// Article cleaning: turns a raw HTML page into the plain text an AI
// generation call should actually see, plus heading and image-candidate
// extraction. No network access here -- everything operates on HTML
// already retrieved by sourceRetrievalService.ts, which keeps this module
// easy to unit-test with fixture HTML strings.
//
// Primary extraction is Mozilla's Readability algorithm (the engine behind
// Firefox Reader View) run against a JSDOM document -- chosen over a
// hand-rolled heuristic because it's a production-proven library that
// already handles the huge variety of real-world article markup, and it
// is not a browser-automation tool (no script execution, no navigation,
// pure DOM parsing). A simple paragraph-density heuristic is kept as a
// fallback for the pages Readability can't parse.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { RawPageMetadata } from './sourceMetadata';
import { findJsonLdByType, jsonLdImageUrl } from './sourceMetadata';
import type { SourceHeading, SourceImageCandidate, SourceImageKind } from './sourceTypes';

// Chrome/boilerplate that is never part of the article body. Stripped
// before Readability runs (cuts noise out of its scoring on template-heavy
// pages) and before the heuristic fallback scans for content.
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
  /** False when Readability couldn't parse the page and the density-heuristic fallback ran instead. */
  usedReadability: boolean;
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

function heuristicExtract($: CheerioAPI): CleanedArticle {
  // Density heuristic: the container with the most cumulative <p> text is
  // treated as the article body. A blunt instrument, but a reasonable
  // fallback for the minority of pages Readability can't handle.
  let bestEl: ReturnType<CheerioAPI> | null = null;
  let bestScore = 0;

  $('article, main, [role="main"], div, section').each((_, el) => {
    const $el = $(el);
    const text = $el
      .find('p')
      .map((_, p) => $(p).text())
      .get()
      .join(' ');
    if (text.length > bestScore) {
      bestScore = text.length;
      bestEl = $el;
    }
  });

  const $container = bestEl ?? $('body');
  const paragraphs = dedupeParagraphs(paragraphsFromHtml(cheerio.load($container.html() || '')));
  const articleText = paragraphs.join('\n\n');

  return {
    title: $('title').first().text().trim() || null,
    byline: null,
    excerpt: null,
    articleText,
    articleHtml: $container.html() || '',
    headings: extractHeadings($container as unknown as CheerioAPI),
    wordCount: countWords(articleText),
    usedReadability: false,
  };
}

/**
 * Extracts the readable article body from a raw HTML page. Never throws --
 * a Readability/JSDOM failure (malformed markup, no recognizable article,
 * etc.) falls back to the density heuristic rather than failing the whole
 * retrieval.
 */
export function extractCleanArticle(html: string, pageUrl: string): CleanedArticle {
  const $pre = cheerio.load(html);
  $pre(BOILERPLATE_SELECTORS).remove();
  const prunedHtml = $pre.html() || html;

  let parsed: { title: string | null; byline: string | null; excerpt: string | null; content: string | null; textContent: string } | null = null;
  try {
    const dom = new JSDOM(prunedHtml, { url: pageUrl });
    const article = new Readability(dom.window.document, { charThreshold: 200 }).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      parsed = {
        title: article.title?.trim() || null,
        byline: article.byline?.trim() || null,
        excerpt: article.excerpt?.trim() || null,
        content: article.content ?? null,
        textContent: article.textContent,
      };
    }
  } catch {
    parsed = null; // fall through to the heuristic below
  }

  if (!parsed) return heuristicExtract($pre);

  const $content = cheerio.load(parsed.content || '');
  const fromHtml = dedupeParagraphs(paragraphsFromHtml($content));
  const articleText =
    fromHtml.length > 0
      ? fromHtml.join('\n\n')
      : dedupeParagraphs(
          parsed.textContent
            .split(/\n{2,}/)
            .map((block) => block.replace(/\s+/g, ' ').trim())
            .filter(Boolean),
        ).join('\n\n');

  return {
    title: parsed.title,
    byline: parsed.byline,
    excerpt: parsed.excerpt,
    articleText,
    articleHtml: parsed.content || '',
    headings: extractHeadings($content),
    wordCount: countWords(articleText),
    usedReadability: true,
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
