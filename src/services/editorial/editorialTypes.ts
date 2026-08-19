// Type definitions for the Reserve Editorial Intelligence Engine.
//
// SERVER-SIDE ONLY -- this whole directory orchestrates the AI provider
// (src/services/ai) and the Source Retrieval Engine
// (src/services/research), neither of which may be imported into a
// browser bundle.

export interface EditorialGenerationInput {
  sourceUrls: string[];
  subject?: string;
  requestedAngle?: string;
  contentType?: string;
}

export type EditorialStatus = 'READY' | 'NEEDS_REVIEW';

/**
 * The exact, minimal structure requested from the model in one generation
 * call -- see editorialPromptBuilder.ts. Deliberately flat: no nested
 * research/seo/subject/selfCheck structures, no per-field duplication of
 * data the application already has (source publisher/title/url are looked
 * up from the already-retrieved sources via `sourcesUsed`'s source IDs,
 * not repeated by the model). Everything not strictly needed to produce
 * the Reserve article, Instagram copy, and cover treatment is derived by
 * application code afterward (editorialQA.ts) rather than requested from
 * the model -- a smaller, simpler request is a more reliable one.
 */
export interface EditorialPackage {
  title: string;
  subtitle: string;
  /** The full article body as continuous prose (paragraphs separated by blank lines) -- not a sections array. */
  article: string;
  instagramHeadline: string;
  instagramSubheadline: string;
  coverKicker: string;
  coverSecondaryLine: string;
  caption: string;
  /** Must exactly match one of the supplied image candidate URLs, or `""` if none is suitable. Never a URL the model invented. */
  imageUrl: string;
  imageReason: string;
  /** Source IDs (e.g. `"source_1"`) actually drawn on -- not duplicated source metadata; the app looks up publisher/title/url from the sources it already retrieved. */
  sourcesUsed: string[];
  /** The model's own brief self-flagged concerns (unsupported claims, weak sourcing, etc.), if any. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Validation & QA
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type QaSeverity = 'PASS' | 'WARNING' | 'FAIL';

export interface QaCheckResult {
  check: string;
  severity: QaSeverity;
  message: string;
}

export interface QaReport {
  overall: QaSeverity;
  checks: QaCheckResult[];
  /**
   * Deterministically computed by editorialQA.ts from the check results
   * below (100 minus a penalty per WARNING/FAIL, floored at 0) -- not a
   * number the model self-reports. The minimal request schema
   * (editorialPromptBuilder.ts) deliberately doesn't ask the model for a
   * confidence score; a rule-based score computed from objective checks
   * (source-id validity, image-candidate match, length, duplication) is
   * more trustworthy than a self-rating anyway.
   */
  confidence: number;
  /** Deterministically derived from `overall`/`confidence`, not requested from the model -- see the confidence doc comment above. */
  status: EditorialStatus;
}

// ---------------------------------------------------------------------------
// Generation result (what the service returns / what gets persisted)
// ---------------------------------------------------------------------------

export type EditorialGenerationStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'SOURCE_RETRIEVAL_FAILED'
  | 'GENERATION_FAILED'
  | 'VALIDATION_FAILED';

/**
 * Structured failure classification, stored alongside the free-text
 * `failureReason` for observability/filtering. `null` on success.
 *
 * The provider-facing categories (AUTHENTICATION_ERROR through UNKNOWN)
 * mirror AIErrorCode (src/services/ai/aiTypes.ts) at a coarser,
 * admin-facing grain -- see classifyGenerationError() in
 * editorialGenerationService.ts for the mapping. Every one of them is
 * reported with a specific, safe message (HTTP status + a short
 * classification), never collapsed into a single generic "the AI provider
 * returned an error."
 */
export type EditorialErrorCategory =
  | 'SOURCE_RETRIEVAL'
  | 'TIMEOUT'
  | 'AUTHENTICATION_ERROR'
  | 'ACCESS_DENIED'
  | 'INVALID_REQUEST'
  | 'MODEL_ERROR'
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE'
  /** The AI provider was never actually contacted -- a server-side configuration problem (e.g. missing TABITOKEN_API_KEY) was caught before any network call. `aiRequestAttempted` is false for this category. */
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN'
  | 'VALIDATION_FAILED'
  | null;

export interface EditorialGenerationUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface RetrievedSourceSummary {
  sourceId: string;
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  status: string;
  wordCount: number;
}

export interface EditorialGenerationResult {
  status: EditorialGenerationStatus;
  failureReason: string | null;
  errorCategory: EditorialErrorCategory;
  /** Whether a real request was actually sent to the AI provider (false for e.g. source-retrieval failures, where generation never got that far). */
  aiRequestAttempted: boolean;

  input: EditorialGenerationInput;
  /** Every source that was requested, including failures -- not just the ones used in the prompt. */
  sources: RetrievedSourceSummary[];

  editorialPackage: EditorialPackage | null;
  validation: ValidationResult | null;
  qa: QaReport | null;

  provider: string;
  requestedModel: string;
  servedModel: string | null;
  usage: EditorialGenerationUsage;
  latencyMs: number | null;

  generatedAt: string;
}
