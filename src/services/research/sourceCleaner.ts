// Article cleaning: turns a raw HTML page into the plain text an AI
// generation call should actually see, plus heading and image-candidate
// extraction. No network access here -- everything operates on HTML
// already retrieved by sourceRetrievalService.ts, which keeps this module
// easy to unit-test with fixture HTML strings.
//
// Pure cheerio -- no jsdom, no @mozilla/readability. This module
// previously ran Mozilla's Readability algorithm against a JSDOM
// document. That was removed as a production incident fix: jsdom's
// `html-encoding-sniffer` dependency (>=6.0.0) requires `@exodus/bytes`,
// which ships ESM-only, via a plain CommonJS `require()` -- an upstream
// packaging bug (verified directly: html-encoding-sniffer's own
// package.json has no `"type": "module"`, yet its lib file does
// `require("@exodus/bytes/encoding-lite.js")`, and @exodus/bytes's
// package.json declares `"type": "module"`). Because esbuild bundles this
// server with `--packages=external`, that broken `require()` chain is
// resolved fresh from node_modules on every cold start, and Node's
// ERR_REQUIRE_ESM crashes the entire process -- not just source
// retrieval, every route -- the moment the bundle loads. Pinning an older
// html-encoding-sniffer would only be papering over a real incompatibility
// jsdom itself doesn't control, and jsdom's own dependency range doesn't
// allow avoiding it. Rather than reach for a different DOM-emulation
// library with its own unvetted dependency tree during an active outage,
// this rewrite drops the DOM-emulation approach entirely: cheerio (already
// a proven, working dependency elsewhere in this codebase) is sufficient
// for structural HTML scoring, which is all article extraction actually
// needs -- it never required layout/rendering/script execution.
//
// The extraction below scores every plausible content container
// (article/main/section/div/td) using signals adapted from Readability's
// approach: tag weight, positive/negative class-and-id keywords, comma
// count and text length as prose indicators, a link-density penalty (to
// reject navigation/link-list blocks), and a paragraph-to-total-text
// ratio (to prefer tightly-scoped containers over broad ones that merely
// contain the article alongside other page chrome). If nothing scores
// above the disqualification floor, a simpler "largest cumulative
// paragraph text" fallback guarantees a result rather than an outright
// failure.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { RawPageMetadata } from './sourceMetadata';
import { findJsonLdByType, jsonLdImageUrl } from './sourceMetadata';
import type { SourceHeading, SourceImageCandidate, SourceImageKind } from './sourceTypes';

// Chrome/boilerplate that is never part of the article body. Stripped
// before scoring/extraction runs.
const BOILERPLATE_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'iframe',
  'form',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.nav',
  '.navbar',
  '.menu',
  '.breadcrumb',
  '.breadcrumbs',
  '.advert',
  '.advertisement',
  '.ad',
  '.ads',
  '.ad-container',
  '[class*="advert"]',
  '[id*="advert"]',
  '.cookie',
  '.cookie-banner',
  '.cookie-consent',
  '[class*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '.newsletter',
  '.newsletter-signup',
  '.subscribe',
  '[class*="newsletter"]',
  '.share',
  '.social',
  '.social-share',
  '.share-buttons',
  '[class*="share-"]',
  '[class*="social-share"]',
  '.comments',
  '#comments',
  '.comment-section',
  '[class*="comments"]',
  '.related',
  '.related-articles',
  '.recommended',
  '.sidebar',
  '.paywall',
  '.paywall-message',
  '[aria-hidden="true"]',
].join(',');

export interface CleanedArticle {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  /** Plain text, paragraphs separated by a blank line. Deduplicated. */
  articleText: string;
  /** Cleaned HTML of just the article body -- used for heading/image extraction, never sent to the AI provider. */
  articleHtml: string;
  headings: SourceHeading[];
  wordCount: number;
  /** False when nothing cleared the scoring floor and the guaranteed density-only fallback ran instead. */
  usedScoredExtraction: boolean;
}

export interface NormalizedContent {
  text: string;
  truncated: boolean;
  wordCount: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Drops exact-duplicate paragraphs (case/whitespace-insensitive) -- common with repeated captions, boilerplate disclaimers, etc. Short lines are left alone since legitimate short paragraphs collide easily. */
function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const key = p.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 20) {
      out.push(p);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function extractHeadings($: CheerioAPI): SourceHeading[] {
  const headings: SourceHeading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = $(el).prop('tagName')?.toLowerCase() ?? '';
    const level = Number(tag.replace('h', ''));
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && level >= 1 && level <= 6) {
      headings.push({ level: level as SourceHeading['level'], text });
    }
  });
  return headings;
}

function paragraphsFromHtml($: CheerioAPI): string[] {
  return $('p')
    .map((_, p) => $(p).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length > 0);
}

// --- Scored extraction -------------------------------------------------

const POSITIVE_CLASS_ID_PATTERN = /article|articlebody|story-?body|[^a-z](body|content|entry|main|page|post|story|text|blog)[^a-z]?/i;
const NEGATIVE_CLASS_ID_PATTERN =
  /sidebar|footer|footnote|comment|widget|related|share|social|nav(igation)?|menu|advert|banner|promo|newsletter|cookie|popup|masthead|breadcrumb|pagination|taglist|tag-list|byline|caption|subscribe|sponsor/i;
const CANDIDATE_SELECTOR = 'article, main, section, div, td';
const MIN_CANDIDATE_TEXT_LENGTH = 40;

function tagBaseScore(tagName: string): number {
  switch (tagName) {
    case 'article':
      return 25;
    case 'main':
      return 20;
    case 'section':
      return 8;
    case 'div':
      return 5;
    case 'td':
      return 3;
    default:
      return 0;
  }
}

function linkDensity($: CheerioAPI, el: any): number {
  const totalLength = $(el).text().length;
  if (totalLength === 0) return 0;
  let linkLength = 0;
  $(el)
    .find('a')
    .each((_, a) => {
      linkLength += $(a).text().length;
    });
  return linkLength / totalLength;
}

function scoreElement($: CheerioAPI, el: any): number {
  const tagName = ($(el).prop('tagName') || '').toLowerCase();
  const attrString = `${$(el).attr('class') || ''} ${$(el).attr('id') || ''}`;

  const paragraphs = $(el).find('p, pre, blockquote');
  const paragraphText = paragraphs
    .map((_, p) => $(p).text())
    .get()
    .join(' ');
  if (paragraphText.trim().length < MIN_CANDIDATE_TEXT_LENGTH) return -Infinity;

  let score = tagBaseScore(tagName);
  if (POSITIVE_CLASS_ID_PATTERN.test(attrString)) score += 25;
  if (NEGATIVE_CLASS_ID_PATTERN.test(attrString)) score -= 50;

  const commas = (paragraphText.match(/,/g) || []).length;
  let contentScore = Math.min(commas * 2, 40) + Math.min(Math.floor(paragraphText.length / 50), 60);

  // Link-density penalty -- a block that's mostly link text is a
  // navigation/related-links list, not article prose.
  contentScore *= Math.max(0, 1 - linkDensity($, el) * 1.5);

  // Paragraph-to-total-text ratio -- dampens (but doesn't zero out) broad
  // containers that hold the article alongside other page chrome the
  // boilerplate strip didn't catch, favoring tightly-scoped candidates.
  const totalTextLength = $(el).text().length || 1;
  const paragraphRatio = Math.min(paragraphText.length / totalTextLength, 1);
  contentScore *= 0.5 + 0.5 * paragraphRatio;

  return score + contentScore;
}

function scoredCandidate($: CheerioAPI): any | null {
  let best: { el: any; score: number } | null = null;
  $(CANDIDATE_SELECTOR).each((_, el) => {
    const score = scoreElement($, el);
    if (score === -Infinity) return;
    if (!best || score > best.score) best = { el, score };
  });
  return best ? (best as { el: any; score: number }).el : null;
}

/** Guaranteed fallback: the container with the most cumulative <p> text, no scoring/disqualification. Used only when scoredCandidate() finds nothing. */
function densityOnlyCandidate($: CheerioAPI): any {
  let bestEl: any = null;
  let bestScore = 0;
  $('article, main, [role="main"], div, section').each((_, el) => {
    const text = $(el)
      .find('p')
      .map((_, p) => $(p).text())
      .get()
      .join(' ');
    if (text.length > bestScore) {
      bestScore = text.length;
      bestEl = el;
    }
  });
  return bestEl;
}

/**
 * Extracts the readable article body from a raw HTML page. Never throws --
 * an unusual page structure falls back to the guaranteed density-only
 * heuristic rather than failing the whole retrieval.
 */
export function extractCleanArticle(html: string, _pageUrl: string): CleanedArticle {
  const $ = cheerio.load(html);
  $(BOILERPLATE_SELECTORS).remove();

  let container: any = null;
  let usedScoredExtraction = false;
  try {
    container = scoredCandidate($);
    if (container) usedScoredExtraction = true;
  } catch {
    container = null;
  }
  if (!container) container = densityOnlyCandidate($);

  const $container = container ? $(container) : $('body');
  const containerHtml = $container.html() || '';
  // Re-load the container's HTML as its own document so extractHeadings
  // (and paragraph extraction) get a real CheerioAPI to query against --
  // a Cheerio *selection* (like $container) is not itself queryable the
  // way the root $ is, so it must never be passed where a CheerioAPI is
  // expected.
  const $containerDoc = cheerio.load(containerHtml);
  const paragraphs = dedupeParagraphs(paragraphsFromHtml($containerDoc));
  const articleText = paragraphs.join('\n\n');

  return {
    title: $('title').first().text().trim() || null,
    byline: null,
    excerpt: null,
    articleText,
    articleHtml: containerHtml,
    headings: extractHeadings($containerDoc),
    wordCount: countWords(articleText),
    usedScoredExtraction,
  };
}

/**
 * Caps `articleText` to `maxChars`, keeping whole paragraphs from the
 * beginning of the article rather than cutting mid-sentence -- the lead
 * paragraphs carry the most editorial value, and a hard character cut can
 * land anywhere in the text regardless of structure.
 */
export function normalizeSourceContent(articleText: string, maxChars: number): NormalizedContent {
  const paragraphs = articleText.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  if (articleText.length <= maxChars) {
    return { text: articleText, truncated: false, wordCount: countWords(articleText) };
  }

  const kept: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const addition = (kept.length > 0 ? 2 : 0) + p.length;
    if (total + addition > maxChars && kept.length > 0) break;
    kept.push(p);
    total += addition;
  }
  if (kept.length === 0 && paragraphs.length > 0) {
    // A single paragraph alone exceeds the budget -- there is no
    // paragraph boundary left to respect, so this is the one place a mid-
    // text cut is unavoidable.
    kept.push(paragraphs[0].slice(0, maxChars));
  }

  const text = kept.join('\n\n');
  return { text, truncated: true, wordCount: countWords(text) };
}

function numOrNull(val: string | undefined): number | null {
  if (!val) return null;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toAbsoluteImageUrl(rawUrl: string | undefined, base: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /^(data|javascript|vbscript|blob):/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Identifies candidate images only -- does not download or store them.
 * Priority order: og:image / twitter:image, the article's first inline
 * image (treated as the hero), the remaining article-body images, a
 * JSON-LD `image`, then other reasonably-sized images elsewhere on the
 * page. Later pipeline stages decide which candidate to actually use.
 */
export function extractSourceImages(
  pageUrl: string,
  $full: CheerioAPI,
  metadata: RawPageMetadata,
  articleHtml: string,
): SourceImageCandidate[] {
  const candidates: SourceImageCandidate[] = [];
  const seen = new Set<string>();
  let position = 0;

  const add = (
    rawUrl: string | null | undefined,
    kind: SourceImageKind,
    opts?: { alt?: string | null; caption?: string | null; width?: number | null; height?: number | null },
  ) => {
    if (!rawUrl) return;
    const absolute = toAbsoluteImageUrl(rawUrl, pageUrl);
    if (!absolute || seen.has(absolute)) return;
    seen.add(absolute);
    candidates.push({
      imageUrl: absolute,
      sourcePageUrl: pageUrl,
      altText: opts?.alt?.trim() || null,
      caption: opts?.caption?.trim() || null,
      width: opts?.width ?? null,
      height: opts?.height ?? null,
      position: position++,
      kind,
    });
  };

  add(metadata.ogImage, 'og');
  add(metadata.twitterImage, 'twitter');

  const $article = cheerio.load(articleHtml || '');
  $article('img').each((i, el) => {
    const $img = $article(el);
    const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
    const caption = $img.closest('figure').find('figcaption').first().text().trim() || null;
    add(src, i === 0 ? 'hero' : 'article', {
      alt: $img.attr('alt'),
      caption,
      width: numOrNull($img.attr('width')),
      height: numOrNull($img.attr('height')),
    });
  });

  const articleEntity = findJsonLdByType(metadata.jsonLd, ['Article', 'NewsArticle', 'BlogPosting', 'Report']);
  if (articleEntity) add(jsonLdImageUrl(articleEntity.raw.image), 'json-ld');

  $full('img').each((_, el) => {
    const $img = $full(el);
    const width = numOrNull($img.attr('width'));
    const height = numOrNull($img.attr('height'));
    if ((width !== null && width < 200) || (height !== null && height < 200)) return; // skip obvious icons/tracking pixels
    add($img.attr('src') || $img.attr('data-src'), 'other', { alt: $img.attr('alt'), width, height });
  });

  return candidates;
}
