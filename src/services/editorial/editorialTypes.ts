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

export interface EditorialSubject {
  name: string;
  shortBio: string;
  currentRole: string | null;
  organization: string | null;
  industry: string | null;
  location: string | null;
  careerHighlights: string[];
  notableAchievements: string[];
  keyThemes: string[];
}

export interface EditorialFact {
  claim: string;
  sourceIds: string[];
  confidence: number;
}

export interface EditorialResearch {
  editorialAngle: string;
  angleReason: string;
  facts: EditorialFact[];
}

export interface EditorialArticleSection {
  heading: string;
  body: string;
}

export interface EditorialArticle {
  title: string;
  subtitle: string;
  introduction: string;
  sections: EditorialArticleSection[];
  conclusion: string;
}

export interface EditorialInstagram {
  kicker: string;
  headline: string;
  subheadline: string;
  caption: string;
  hashtags: string[];
}

export interface EditorialCover {
  primaryHeadline: string;
  secondaryLine: string;
}

export interface EditorialImageRecommendation {
  recommendedImageUrl: string | null;
  recommendedImageSource: string | null;
  imageReason: string;
}

export interface EditorialSeo {
  title: string;
  description: string;
  slugSuggestion: string;
}

export interface EditorialSourceUsed {
  sourceId: string;
  publisher: string;
  title: string;
  url: string;
  factsUsed: string[];
}

export interface EditorialSelfCheck {
  unsupportedClaims: string[];
  fabricatedQuotes: string[];
  conflictingFacts: string[];
  missingAttribution: string[];
  warnings: string[];
  confidence: number;
}

/** The exact structure requested from the model in one generation call. */
export interface EditorialPackage {
  status: EditorialStatus;
  subject: EditorialSubject;
  research: EditorialResearch;
  article: EditorialArticle;
  instagram: EditorialInstagram;
  cover: EditorialCover;
  image: EditorialImageRecommendation;
  seo: EditorialSeo;
  sourcesUsed: EditorialSourceUsed[];
  selfCheck: EditorialSelfCheck;
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
 */
export type EditorialErrorCategory =
  | 'SOURCE_RETRIEVAL'
  | 'TIMEOUT'
  | 'ACCESS_DENIED'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE'
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
