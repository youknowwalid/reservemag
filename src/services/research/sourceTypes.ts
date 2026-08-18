// Shared type definitions for the Source Retrieval Engine.
//
// SERVER-SIDE ONLY. This module performs outbound network requests to
// arbitrary editor-supplied URLs; it must never be imported into a browser
// bundle. See sourceRetrievalService.ts for the runtime guard.

/** Outcome of attempting to retrieve and parse one URL. */
export type SourceStatus =
  | 'SUCCESS'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'PARSE_FAILED'
  | 'PAYWALLED'
  | 'UNSUPPORTED'
  | 'FAILED';

/** Aggregate outcome of a multi-URL retrieval job. */
export type SourceJobStatus = 'SUCCESS' | 'PARTIAL' | 'SOURCE_RETRIEVAL_FAILED';

export type SourceImageKind = 'og' | 'twitter' | 'json-ld' | 'hero' | 'article' | 'other';

export interface SourceImageCandidate {
  imageUrl: string;
  sourcePageUrl: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  /** Rank/order among candidates for this source -- lower is higher priority. */
  position: number;
  kind: SourceImageKind;
}

export interface SourceHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

/**
 * A single retrieved and normalized source. Always present even on
 * failure -- `status` and `errorReason` describe what went wrong, and the
 * content fields are simply `null`/empty rather than the object being
 * omitted, so callers can report per-URL outcomes uniformly.
 */
export interface RetrievedSource {
  /** The URL as originally requested. */
  url: string;
  /** The page's declared canonical URL, if different/available. */
  canonicalUrl: string | null;

  status: SourceStatus;
  /** Safe, non-secret, human-readable explanation. Never contains request/response headers or credentials. */
  errorReason: string | null;
  /** HTTP status code of the final response, if one was received. */
  httpStatus: number | null;

  title: string | null;
  subheadline: string | null;
  author: string | null;
  publisher: string | null;
  /** ISO 8601 timestamp if a publish date could be parsed. */
  publishedAt: string | null;
  description: string | null;
  language: string | null;

  /** Cleaned, plain-text article body -- paragraphs joined with blank lines. */
  articleText: string | null;
  headings: SourceHeading[];

  images: SourceImageCandidate[];
  ogImage: string | null;
  twitterImage: string | null;

  wordCount: number;
  /** True if `articleText` was truncated to stay within content limits. */
  truncated: boolean;

  /** ISO 8601 timestamp of when this retrieval/parse actually ran (not when a cache entry was read). */
  retrievedAt: string;
  fromCache: boolean;
  /** SHA-256 of the normalized article text, for cache/dedupe purposes. */
  contentHash: string | null;
}

export interface RetrieveSourceOptions {
  /** Per-request network timeout in milliseconds. */
  timeoutMs?: number;
  /** Bypass the cache and re-fetch even if a fresh cache entry exists. */
  forceRefresh?: boolean;
  /** Cap on `articleText` length, in characters, after cleaning. */
  maxContentChars?: number;
}

export interface SourceRetrievalJobResult {
  sources: RetrievedSource[];
  succeededCount: number;
  failedCount: number;
  status: SourceJobStatus;
}
