// Source Retrieval Engine -- fetches editor-supplied URLs server-side,
// extracts clean article content + metadata + image candidates, and
// caches the result. This is the ONLY module the rest of the app should
// use to pull in external source material; nothing else should call
// `fetch()` against an arbitrary URL directly.
//
// SERVER-SIDE ONLY. Performs outbound network requests to arbitrary
// editor-supplied URLs -- must never be imported into a browser bundle.
//
// SSRF posture (see validateUrlForFetch/isPrivateIpv4/isPrivateIpv6 below):
// only http/https is allowed; IP-literal hostnames and every address a
// domain name resolves to are checked against the private/reserved
// ranges (including link-local 169.254.0.0/16, which covers the common
// cloud metadata endpoint 169.254.169.254); redirects are followed
// manually, one hop at a time, re-running the full validation on each
// hop's target before it is fetched, so a redirect can't be used to reach
// an internal address the original URL wouldn't have been allowed to
// reach. Known residual gap: DNS-rebinding, where a hostname resolves to
// a public IP at validation time and a private IP moments later at
// connection time, is not fully closed -- doing so requires pinning the
// validated IP onto the actual TCP connection (a custom low-level HTTP
// agent), which this implementation does not do. Acceptable for now given
// this is an admin-only tool operating on editor-supplied URLs, not a
// public-facing arbitrary-URL proxy; worth hardening later if that
// changes.

import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { extractMetadata, findJsonLdByType, jsonLdAuthorName, type RawPageMetadata } from './sourceMetadata';
import { extractCleanArticle, extractSourceImages, normalizeSourceContent, type CleanedArticle } from './sourceCleaner';
import type {
  RetrievedSource,
  RetrieveSourceOptions,
  SourceJobStatus,
  SourceRetrievalJobResult,
  SourceStatus,
} from './sourceTypes';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/services/research is server-only and must not be imported from browser/client code.',
  );
}

export { normalizeSourceContent, extractSourceImages } from './sourceCleaner';
export * from './sourceTypes';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_URLS_PER_JOB = 10;
const DEFAULT_MAX_CONTENT_CHARS = 12_000; // ~2,000-2,500 words -- generous for one editorial source, small next to Tabitoken's fixed per-call overhead
const CACHE_TTL_MS = (() => {
  const configured = Number(process.env.SOURCE_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30 * 60 * 1000; // 30 minutes
})();

const PAYWALL_SIGNALS = [
  'subscribe to continue reading',
  'subscribe to read more',
  'this content is for subscribers',
  'to continue reading this article',
  'you have reached your limit of free articles',
  'become a member to continue reading',
  'sign in to continue reading',
  'this article is for subscribers only',
  'create a free account to continue',
];

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata.internal']);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

const IPV4_BLOCKED_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local -- covers the 169.254.169.254 cloud metadata endpoint
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isPrivateIpv4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int === null) return true; // fail closed on anything we can't parse confidently
  return IPV4_BLOCKED_RANGES.some(([base, prefix]) => {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (int & mask) === (baseInt & mask);
  });
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  const mapped =
    normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || normalized.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7 unique local
  if (['fe8', 'fe9', 'fea', 'feb'].some((p) => normalized.startsWith(p))) return true; // fe80::/10 link-local
  if (normalized.startsWith('2001:db8')) return true; // documentation range
  return false;
}

interface UrlSafetyCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

/** Validates scheme + hostname/IP for one URL. Resolves DNS for domain names and checks every returned address. */
async function validateUrlForFetch(rawUrl: string): Promise<UrlSafetyCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Malformed URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Unsupported URL scheme "${url.protocol}" -- only http/https are allowed.` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) return { ok: false, reason: 'URL has no hostname.' };
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'Requests to local/internal hostnames are not allowed.' };
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateIpv4(hostname)) return { ok: false, reason: 'Requests to private/internal IP addresses are not allowed.' };
    return { ok: true, url };
  }
  if (ipVersion === 6) {
    if (isPrivateIpv6(hostname)) return { ok: false, reason: 'Requests to private/internal IP addresses are not allowed.' };
    return { ok: true, url };
  }

  // Domain name -- resolve and check every address returned.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'DNS resolution failed for this hostname.' };
  }
  if (addresses.length === 0) return { ok: false, reason: 'DNS resolution returned no addresses.' };
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIpv4(address)) {
      return { ok: false, reason: 'Hostname resolves to a private/internal IP address.' };
    }
    if (family === 6 && isPrivateIpv6(address)) {
      return { ok: false, reason: 'Hostname resolves to a private/internal IP address.' };
    }
  }

  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Safe HTML fetch (manual redirects, size cap, timeout)
// ---------------------------------------------------------------------------

interface SafeFetchResult {
  ok: boolean;
  status: number | null;
  html: string | null;
  finalUrl: string;
  reason: string | null;
  errorKind: Exclude<SourceStatus, 'SUCCESS'> | null;
}

async function safeFetchHtml(startUrl: string, timeoutMs: number): Promise<SafeFetchResult> {
  let currentUrl = startUrl;
  const overallDeadline = Date.now() + timeoutMs * (MAX_REDIRECTS + 1);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > overallDeadline) {
      return { ok: false, status: null, html: null, finalUrl: currentUrl, reason: 'Overall request duration exceeded.', errorKind: 'TIMEOUT' };
    }

    const check = await validateUrlForFetch(currentUrl);
    if (!check.ok || !check.url) {
      return { ok: false, status: null, html: null, finalUrl: currentUrl, reason: check.reason ?? 'Blocked by URL safety checks.', errorKind: 'BLOCKED' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(check.url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ReserveMagazineEditorialBot/1.0 (+https://thereservemag.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (error: any) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') {
        return { ok: false, status: null, html: null, finalUrl: currentUrl, reason: `Request timed out after ${timeoutMs}ms.`, errorKind: 'TIMEOUT' };
      }
      return { ok: false, status: null, html: null, finalUrl: currentUrl, reason: 'Network error while fetching the page.', errorKind: 'FAILED' };
    }
    clearTimeout(timer);

    // Redirects are followed manually so every hop is re-validated by the
    // SSRF check above before it's fetched.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: 'Redirect with no Location header.', errorKind: 'FAILED' };
      }
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: 'Redirect target is not a valid URL.', errorKind: 'FAILED' };
      }
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: `Blocked by the source site (HTTP ${response.status}).`, errorKind: 'BLOCKED' };
    }
    if (response.status === 404 || response.status === 410) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: 'Page not found.', errorKind: 'NOT_FOUND' };
    }
    if (response.status === 429) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: 'Rate limited by the source site.', errorKind: 'BLOCKED' };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: `Source site returned HTTP ${response.status}.`, errorKind: 'FAILED' };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: `Unsupported content type: ${contentType.split(';')[0]}.`, errorKind: 'UNSUPPORTED' };
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return { ok: false, status: response.status, html: null, finalUrl: currentUrl, reason: 'Response exceeds the maximum allowed size.', errorKind: 'UNSUPPORTED' };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { ok: true, status: response.status, html: text.slice(0, MAX_RESPONSE_BYTES), finalUrl: currentUrl, reason: null, errorKind: null };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncatedBySize = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        truncatedBySize = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
    return {
      ok: true,
      status: response.status,
      html,
      finalUrl: currentUrl,
      reason: truncatedBySize ? 'Response was truncated at the size limit.' : null,
      errorKind: null,
    };
  }

  return { ok: false, status: null, html: null, finalUrl: currentUrl, reason: `Too many redirects (max ${MAX_REDIRECTS}).`, errorKind: 'FAILED' };
}

function looksPaywalled(rawHtml: string, wordCount: number): boolean {
  if (wordCount > 150) return false; // substantial content extracted -- unlikely to actually be walled off
  const lower = rawHtml.toLowerCase();
  return PAYWALL_SIGNALS.some((signal) => lower.includes(signal));
}

function parseDateSafe(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function emptySource(url: string, retrievedAt: string, status: SourceStatus = 'FAILED'): RetrievedSource {
  return {
    url,
    canonicalUrl: null,
    status,
    errorReason: null,
    httpStatus: null,
    title: null,
    subheadline: null,
    author: null,
    publisher: null,
    publishedAt: null,
    description: null,
    language: null,
    articleText: null,
    headings: [],
    images: [],
    ogImage: null,
    twitterImage: null,
    wordCount: 0,
    truncated: false,
    retrievedAt,
    fromCache: false,
    contentHash: null,
  };
}

// ---------------------------------------------------------------------------
// In-memory cache
//
// Process-local, best-effort. Not shared across serverless instances/cold
// starts -- acceptable for now (this only saves a redundant fetch+parse
// within a warm process), but not a substitute for a persistent cache if
// that's ever needed.
// ---------------------------------------------------------------------------

interface CacheEntry {
  source: RetrievedSource;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

/** Returns a fresh cache entry for `url`, or null if there isn't one. */
export function getCachedSource(url: string): RetrievedSource | null {
  const entry = cache.get(cacheKey(url));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(url));
    return null;
  }
  return { ...entry.source, fromCache: true };
}

function setCachedSource(url: string, source: RetrievedSource): void {
  cache.set(cacheKey(url), { source, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Retrieves, cleans, and normalizes a single source URL. Never throws -- failures are reported via `status`/`errorReason`. */
export async function retrieveSource(url: string, options: RetrieveSourceOptions = {}): Promise<RetrievedSource> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxContentChars = options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;

  if (!options.forceRefresh) {
    const cached = getCachedSource(url);
    if (cached) return cached;
  }

  const retrievedAt = new Date().toISOString();

  let fetchResult: SafeFetchResult;
  try {
    fetchResult = await safeFetchHtml(url, timeoutMs);
  } catch (error: any) {
    return { ...emptySource(url, retrievedAt, 'FAILED'), errorReason: 'Unexpected error while fetching the page.' };
  }

  if (!fetchResult.ok || !fetchResult.html) {
    return {
      ...emptySource(url, retrievedAt, fetchResult.errorKind ?? 'FAILED'),
      errorReason: fetchResult.reason,
      httpStatus: fetchResult.status,
    };
  }

  let $full: CheerioAPI;
  let metadata: RawPageMetadata;
  let cleaned: CleanedArticle;
  try {
    $full = cheerio.load(fetchResult.html);
    metadata = extractMetadata($full);
    cleaned = extractCleanArticle(fetchResult.html, fetchResult.finalUrl);
  } catch {
    return {
      ...emptySource(url, retrievedAt, 'PARSE_FAILED'),
      errorReason: 'Failed to parse the page HTML.',
      httpStatus: fetchResult.status,
    };
  }

  if (!cleaned.articleText || cleaned.wordCount < 30) {
    const paywalled = looksPaywalled(fetchResult.html, cleaned.wordCount);
    return {
      ...emptySource(url, retrievedAt, paywalled ? 'PAYWALLED' : 'PARSE_FAILED'),
      errorReason: paywalled
        ? 'This source appears to be behind a paywall or subscription wall.'
        : 'Could not extract readable article content from this page (it may require JavaScript, or use an unusual layout).',
      httpStatus: fetchResult.status,
    };
  }

  const normalized = normalizeSourceContent(cleaned.articleText, maxContentChars);
  const images = extractSourceImages(fetchResult.finalUrl, $full, metadata, cleaned.articleHtml);
  const articleEntity = findJsonLdByType(metadata.jsonLd, ['Article', 'NewsArticle', 'BlogPosting', 'Report']);

  const publisher =
    metadata.ogSiteName ||
    (typeof articleEntity?.raw?.publisher === 'object' ? articleEntity?.raw?.publisher?.name : null) ||
    null;
  const author =
    cleaned.byline || metadata.articleAuthor || metadata.metaAuthor || jsonLdAuthorName(articleEntity?.raw?.author) || null;
  const publishedAt = parseDateSafe(metadata.articlePublishedTime) || parseDateSafe(articleEntity?.raw?.datePublished);

  const contentHash = crypto.createHash('sha256').update(normalized.text).digest('hex');

  const result: RetrievedSource = {
    url,
    canonicalUrl: metadata.canonicalUrl,
    status: 'SUCCESS',
    errorReason: fetchResult.reason, // e.g. non-null only if the response was size-truncated but still usable
    httpStatus: fetchResult.status,
    title: cleaned.title || metadata.title,
    subheadline: cleaned.excerpt || metadata.description,
    author,
    publisher,
    publishedAt,
    description: metadata.description,
    language: metadata.language,
    articleText: normalized.text,
    headings: cleaned.headings,
    images,
    ogImage: metadata.ogImage,
    twitterImage: metadata.twitterImage,
    wordCount: normalized.wordCount,
    truncated: normalized.truncated,
    retrievedAt,
    fromCache: false,
    contentHash,
  };

  setCachedSource(url, result);
  return result;
}

/**
 * Retrieves multiple sources independently -- one failed source never
 * fails the whole job. `status` on the returned job summarizes the
 * outcome: `SUCCESS` (all sources retrieved), `PARTIAL` (some failed),
 * or `SOURCE_RETRIEVAL_FAILED` (all failed). Capped at
 * `MAX_URLS_PER_JOB` URLs per call.
 */
export async function retrieveSources(urls: string[], options: RetrieveSourceOptions = {}): Promise<SourceRetrievalJobResult> {
  const limited = urls.slice(0, MAX_URLS_PER_JOB);
  const sources = await Promise.all(
    limited.map((url) =>
      retrieveSource(url, options).catch(
        (): RetrievedSource => ({
          ...emptySource(url, new Date().toISOString(), 'FAILED'),
          errorReason: 'Unexpected error during retrieval.',
        }),
      ),
    ),
  );

  const succeededCount = sources.filter((s) => s.status === 'SUCCESS').length;
  const failedCount = sources.length - succeededCount;
  const status: SourceJobStatus = succeededCount === 0 ? 'SOURCE_RETRIEVAL_FAILED' : failedCount > 0 ? 'PARTIAL' : 'SUCCESS';

  return { sources, succeededCount, failedCount, status };
}

/** Re-fetches a URL, bypassing the cache, and replaces any cached entry with the fresh result. */
export function refreshSource(url: string, options: Omit<RetrieveSourceOptions, 'forceRefresh'> = {}): Promise<RetrievedSource> {
  return retrieveSource(url, { ...options, forceRefresh: true });
}
