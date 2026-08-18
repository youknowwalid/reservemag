// Metadata extraction: OpenGraph, Twitter Card, <link rel="canonical">,
// article:* meta tags, and JSON-LD (Article / NewsArticle / Person /
// Organization). Operates on a cheerio-loaded document -- no network
// access, no side effects, easy to unit-test in isolation.

import type { CheerioAPI } from 'cheerio';

export interface JsonLdEntity {
  type: string | null;
  raw: Record<string, any>;
}

export interface RawPageMetadata {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;

  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogSiteName: string | null;
  ogType: string | null;

  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;

  articlePublishedTime: string | null;
  articleModifiedTime: string | null;
  articleAuthor: string | null;
  metaAuthor: string | null;

  language: string | null;

  jsonLd: JsonLdEntity[];
}

function metaContent($: CheerioAPI, selector: string): string | null {
  const val = $(selector).first().attr('content');
  const trimmed = val?.trim();
  return trimmed ? trimmed : null;
}

/** Parses every `<script type="application/ld+json">` block on the page. Malformed blocks are skipped, not fatal. */
function extractJsonLd($: CheerioAPI): JsonLdEntity[] {
  const entities: JsonLdEntity[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // best-effort metadata -- a malformed block shouldn't fail the whole page
    }

    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed];
    for (const item of items) {
      if (item && typeof item === 'object') {
        const type = item['@type'];
        entities.push({ type: Array.isArray(type) ? type[0] ?? null : type ?? null, raw: item });
      }
    }
  });

  return entities;
}

/** Finds the first JSON-LD entity whose `@type` matches one of `types` (case-insensitive). */
export function findJsonLdByType(entities: JsonLdEntity[], types: string[]): JsonLdEntity | null {
  const wanted = new Set(types.map((t) => t.toLowerCase()));
  for (const entity of entities) {
    if (entity.type && wanted.has(entity.type.toLowerCase())) return entity;
  }
  return null;
}

/** Best-effort author name out of a JSON-LD `author` field, which can be a string, an object, or an array of either. */
export function jsonLdAuthorName(author: unknown): string | null {
  if (!author) return null;
  if (typeof author === 'string') return author.trim() || null;
  if (Array.isArray(author)) return jsonLdAuthorName(author[0]);
  if (typeof author === 'object' && author !== null) {
    const name = (author as any).name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  return null;
}

/** Best-effort image URL out of a JSON-LD `image` field (string, object with `url`, or array of either). */
export function jsonLdImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image.trim() || null;
  if (Array.isArray(image)) return jsonLdImageUrl(image[0]);
  if (typeof image === 'object' && image !== null) {
    const url = (image as any).url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  }
  return null;
}

export function extractMetadata($: CheerioAPI): RawPageMetadata {
  const jsonLd = extractJsonLd($);

  return {
    title:
      metaContent($, 'meta[property="og:title"]') ||
      $('title').first().text().trim() ||
      null,
    description:
      metaContent($, 'meta[name="description"]') || metaContent($, 'meta[property="og:description"]'),
    canonicalUrl:
      $('link[rel="canonical"]').first().attr('href')?.trim() || metaContent($, 'meta[property="og:url"]') || null,

    ogTitle: metaContent($, 'meta[property="og:title"]'),
    ogDescription: metaContent($, 'meta[property="og:description"]'),
    ogImage: metaContent($, 'meta[property="og:image:secure_url"]') || metaContent($, 'meta[property="og:image"]'),
    ogUrl: metaContent($, 'meta[property="og:url"]'),
    ogSiteName: metaContent($, 'meta[property="og:site_name"]'),
    ogType: metaContent($, 'meta[property="og:type"]'),

    twitterTitle: metaContent($, 'meta[name="twitter:title"]'),
    twitterDescription: metaContent($, 'meta[name="twitter:description"]'),
    twitterImage: metaContent($, 'meta[name="twitter:image"]') || metaContent($, 'meta[name="twitter:image:src"]'),

    articlePublishedTime:
      metaContent($, 'meta[property="article:published_time"]') ||
      metaContent($, 'meta[name="publish-date"]') ||
      metaContent($, 'meta[name="date"]') ||
      metaContent($, 'meta[name="parsely-pub-date"]') ||
      $('time[datetime]').first().attr('datetime')?.trim() ||
      null,
    articleModifiedTime: metaContent($, 'meta[property="article:modified_time"]'),
    articleAuthor: metaContent($, 'meta[property="article:author"]'),
    metaAuthor: metaContent($, 'meta[name="author"]') || metaContent($, 'meta[name="parsely-author"]'),

    language: $('html').first().attr('lang')?.trim() || metaContent($, 'meta[property="og:locale"]') || null,

    jsonLd,
  };
}
