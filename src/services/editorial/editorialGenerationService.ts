// Reserve Editorial Intelligence Engine -- orchestrates one editorial
// generation: retrieve sources, build one compact prompt, make exactly
// ONE AI request, extract and validate the response, run deterministic
// QA. This is the only entry point the rest of the app should call for
// editorial generation.
//
// COST SAFETY: an editorial generation is a paid, flat-rate Tabitoken
// request. The AI call below is made with `retries: 0` -- this is a
// per-call option on the existing provider interface (`AIGenerateOptions.
// retries`), not a new mechanism, and it only affects this call site;
// every other caller of `aiProvider.generate()` (e.g. /api/ai/ingest, the
// admin connection test) is unaffected and keeps the provider's normal
// transient-failure retry behavior. `retries: 0` means the provider makes
// exactly one HTTP attempt and does not retry on timeout, 5xx, or 429 --
// see tabitokenProvider.ts, where the same option also disables its
// separate "drop response_format and try again" fallback for zero-retry
// callers, so a paid editorial generation can never silently become two
// real requests.
//
// PLAIN-TEXT JSON: this call does NOT set `responseFormat`. Tabitoken is
// an OpenAI-compatible gateway, not the OpenAI API itself -- depending on
// provider-specific structured-output support was an unnecessary
// compatibility risk. The request is the standard OpenAI-compatible
// shape only (model, messages, max_tokens, temperature); the model is
// told in the prompt to return JSON as plain text, and the response is
// parsed with a bracket/string-aware extractor (jsonExtraction.ts) that
// tolerates code fences or a stray sentence before/after the object.
//
// One editorial item = one AI request, full stop. No separate calls for
// research, headline, caption, cover, or QA -- all of it is produced by
// the single generation call and validated/QA'd deterministically
// afterward. No retry-on-malformed-output layer is added here either: if
// the model's response fails JSON extraction or structural validation,
// this function returns a failed result and stops -- it never re-invokes
// generation.
//
// SERVER-SIDE ONLY.

import { generate as aiGenerateDefault } from '../ai';
import { AIProviderError } from '../ai';
import {
  retrieveSources as retrieveSourcesDefault,
  type RetrievedSource,
} from '../research/sourceRetrievalService';
import { buildEditorialSystemPrompt, buildEditorialUserPrompt } from './editorialPromptBuilder';
import { validateEditorialPackage, asEditorialPackage } from './editorialValidator';
import { runEditorialQA } from './editorialQA';
import { extractJsonObject } from './jsonExtraction';
import type {
  EditorialErrorCategory,
  EditorialGenerationInput,
  EditorialGenerationResult,
  RetrievedSourceSummary,
} from './editorialTypes';

if (typeof window !== 'undefined') {
  throw new Error('src/services/editorial is server-only and must not be imported from browser/client code.');
}

export const MAX_SOURCE_URLS_PER_JOB = 3;
// The minimal schema (title/subtitle/article/instagram*/cover*/caption/
// imageUrl/imageReason/sourcesUsed/warnings) is far smaller than the
// original nested schema this replaced. ~900 words of article body is
// roughly 1,350 tokens; the remaining fields add a few hundred more.
// 4000 leaves comfortable headroom for a thinking model's response
// without the excess of the old 6000 figure, which was sized for a
// schema this generation call no longer sends.
const GENERATION_MAX_TOKENS = 4000;
const GENERATION_TEMPERATURE = 0.7;

// Thinking-model generations against this schema run long. Configurable
// so an operator can tune it without a code change, but the default is
// intentionally left at 240s (not raised further) -- see the incident
// this hardening pass responds to: a too-short timeout caused the
// provider's own retry logic to re-attempt the same slow request
// multiple times, and Tabitoken subsequently returned 403 "abusive use."
// `retries: 0` above is the primary fix for that; this timeout only
// controls how long a single attempt is allowed to run before it's
// treated as failed.
export function resolveGenerationTimeoutMs(): number {
  const configured = Number(process.env.EDITORIAL_GENERATION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 240_000;
}

/** The model this service will actually request -- single source of truth for the fallback string, so the server route's pre-generation lock row and the post-generation result agree without duplicating the literal. */
export function getConfiguredEditorialModel(): string {
  return process.env.TABITOKEN_MODEL || 'claude-opus-4-8-thinking';
}

export interface EditorialGenerationDeps {
  generate: typeof aiGenerateDefault;
  retrieveSources: typeof retrieveSourcesDefault;
}

function summarize(id: string | null, source: RetrievedSource): RetrievedSourceSummary {
  return {
    sourceId: id ?? '',
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    status: source.status,
    wordCount: source.wordCount,
  };
}

/**
 * Maps a thrown generation error to a structured category + a specific,
 * safe, admin-facing message -- never a single generic "the AI provider
 * returned an error" (that message was itself the symptom of a real
 * production incident: it made a genuine provider rejection
 * indistinguishable from a server misconfiguration). Never includes
 * credentials or internal provider details -- `error.responseBodySnippet`
 * (already sanitized in tabitokenProvider.ts, stripped of anything
 * resembling an API key or Authorization header) is logged server-side
 * only, never returned to the client.
 */
function classifyGenerationError(error: unknown): { category: EditorialErrorCategory; message: string } {
  if (error instanceof AIProviderError) {
    // Full diagnostics, server-side only (Vercel function logs) -- this
    // is exactly the information a prior production failure lacked,
    // which made it impossible to tell a config problem from a genuine
    // provider rejection after the fact.
    console.error('[Editorial Generation] AI provider call failed.', {
      code: error.code,
      status: error.status ?? null,
      providerErrorCode: error.providerErrorCode ?? null,
      responseBodySnippet: error.responseBodySnippet ?? null,
      message: error.message,
    });

    switch (error.code) {
      case 'timeout':
        return { category: 'TIMEOUT', message: 'Tabitoken did not respond within the allotted time. No automatic retry was attempted.' };
      case 'config_error':
        return {
          category: 'CONFIGURATION_ERROR',
          message: 'Editorial generation is not configured correctly on the server (AI provider credentials missing or invalid). No request was sent to Tabitoken -- contact an administrator.',
        };
      case 'authentication_error':
        return { category: 'AUTHENTICATION_ERROR', message: `Tabitoken rejected the request's credentials (HTTP ${error.status ?? 401}). No automatic retry was attempted.` };
      case 'access_denied':
        return { category: 'ACCESS_DENIED', message: `Tabitoken denied access to this request (HTTP ${error.status ?? 403}). No automatic retry was attempted.` };
      case 'invalid_request':
        return { category: 'INVALID_REQUEST', message: `Tabitoken rejected the editorial request (HTTP ${error.status ?? 400}): invalid request parameters. No automatic retry was attempted.` };
      case 'model_error':
        return { category: 'MODEL_ERROR', message: `Tabitoken reported a model error (HTTP ${error.status ?? 404}) for "${getConfiguredEditorialModel()}". No automatic retry was attempted.` };
      case 'rate_limit':
        return { category: 'RATE_LIMIT', message: 'Tabitoken rate-limited this request (HTTP 429). No automatic retry was attempted.' };
      case 'invalid_response':
        return { category: 'MALFORMED_RESPONSE', message: 'Tabitoken returned a response that could not be read. No automatic retry was attempted.' };
      case 'network_error':
        return { category: 'PROVIDER_ERROR', message: 'Could not reach the Tabitoken gateway (network error). No automatic retry was attempted.' };
      default:
        return { category: 'PROVIDER_ERROR', message: `Tabitoken returned an error${error.status ? ` (HTTP ${error.status})` : ''}. No automatic retry was attempted.` };
    }
  }
  console.error('[Editorial Generation] Unclassified generation error (not an AIProviderError):', error);
  return { category: 'UNKNOWN', message: 'Editorial generation failed for an unexpected reason. No automatic retry was attempted.' };
}

/**
 * Runs one complete editorial generation. Never throws for expected
 * failure modes (bad URLs, source retrieval failure, malformed AI
 * output, failed validation, provider errors) -- those are reported via
 * `status`/`failureReason`/`errorCategory` on the returned result so the
 * caller (the admin API route) can persist and display them uniformly.
 *
 * `deps` allows injecting a fake AI provider / source retrieval function
 * for tests (see scripts/test-editorial-cost-safety.ts); production
 * callers should omit it and get the real implementations.
 */
export async function generateEditorialPackage(
  input: EditorialGenerationInput,
  deps: Partial<EditorialGenerationDeps> = {},
): Promise<EditorialGenerationResult> {
  const generate = deps.generate ?? aiGenerateDefault;
  const doRetrieveSources = deps.retrieveSources ?? retrieveSourcesDefault;

  const generatedAt = new Date().toISOString();
  const requestedModel = getConfiguredEditorialModel();
  const provider = 'tabitoken';

  const sourceUrls = (input.sourceUrls || []).map((u) => u.trim()).filter(Boolean).slice(0, MAX_SOURCE_URLS_PER_JOB);

  const baseResult: Omit<EditorialGenerationResult, 'status' | 'failureReason' | 'errorCategory' | 'aiRequestAttempted' | 'sources'> = {
    input: { ...input, sourceUrls },
    editorialPackage: null,
    validation: null,
    qa: null,
    provider,
    requestedModel,
    servedModel: null,
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    latencyMs: null,
    generatedAt,
  };

  if (sourceUrls.length === 0) {
    return {
      ...baseResult,
      status: 'SOURCE_RETRIEVAL_FAILED',
      failureReason: 'No source URLs were supplied.',
      errorCategory: 'SOURCE_RETRIEVAL',
      aiRequestAttempted: false,
      sources: [],
    };
  }

  // 1. Source retrieval -- delegates entirely to the existing engine (or the injected fake in tests). No AI call happens here or as a result of it failing.
  const job = await doRetrieveSources(sourceUrls);
  if (job.status === 'SOURCE_RETRIEVAL_FAILED') {
    return {
      ...baseResult,
      status: 'SOURCE_RETRIEVAL_FAILED',
      failureReason: 'All supplied sources failed to retrieve.',
      errorCategory: 'SOURCE_RETRIEVAL',
      aiRequestAttempted: false,
      sources: job.sources.map((s) => summarize(null, s)),
    };
  }

  const successfulSources = job.sources.filter((s) => s.status === 'SUCCESS');
  const sourcesById = successfulSources.map((source, i) => ({ id: `source_${i + 1}`, source }));
  const validSourceIds = new Set(sourcesById.map((s) => s.id));
  const candidateImageUrls = new Set(sourcesById.flatMap(({ source }) => source.images.map((img) => img.imageUrl)));

  const allSourceSummaries: RetrievedSourceSummary[] = job.sources.map((source) => {
    const match = sourcesById.find((s) => s.source === source);
    return summarize(match?.id ?? null, source);
  });

  // 2. Build the single prompt.
  const systemPrompt = buildEditorialSystemPrompt();
  const userPrompt = buildEditorialUserPrompt(input, sourcesById);

  // 3. Exactly ONE AI request (retries: 0 -- see the file header comment).
  // No editorial-layer retry either: a bad response falls through to a
  // failed result below, not another generation call.
  const generationStart = Date.now();
  let latencyMs: number | null = null;
  let rawText: string;
  let servedModel: string | null = null;
  let usage: EditorialGenerationResult['usage'] = { promptTokens: null, completionTokens: null, totalTokens: null };

  try {
    // No `responseFormat` -- standard OpenAI-compatible fields only
    // (model/messages/max_tokens/temperature). See this file's header
    // comment for why.
    const result = await generate({
      systemPrompt,
      userPrompt,
      temperature: GENERATION_TEMPERATURE,
      maxTokens: GENERATION_MAX_TOKENS,
      timeoutMs: resolveGenerationTimeoutMs(),
      retries: 0,
    });
    latencyMs = Date.now() - generationStart;
    rawText = result.text;
    servedModel = result.model || null;
    usage = result.usage;
  } catch (error) {
    latencyMs = Date.now() - generationStart;
    const { category, message } = classifyGenerationError(error);
    // A CONFIGURATION_ERROR is thrown locally (missing/invalid credentials)
    // before any network call is made -- no real Tabitoken request was
    // ever attempted, so this must not be recorded as one. Every other
    // category means an HTTP attempt genuinely happened.
    const aiRequestAttempted = category !== 'CONFIGURATION_ERROR';
    return {
      ...baseResult,
      status: 'GENERATION_FAILED',
      failureReason: message,
      errorCategory: category,
      aiRequestAttempted,
      sources: allSourceSummaries,
      servedModel,
      usage,
      latencyMs,
    };
  }

  // 4. Extract the JSON object from the response text -- bracket/string-
  // aware (jsonExtraction.ts), tolerant of a stray code fence or a short
  // sentence before/after the object (the model was asked for JSON-only
  // text, not a provider-enforced JSON mode). No retry on failure: a bad
  // extraction falls through to a failed result, never a second request.
  const parsed = extractJsonObject(rawText);
  if (parsed === null) {
    return {
      ...baseResult,
      status: 'GENERATION_FAILED',
      failureReason: 'AI response did not contain a parseable JSON object. No automatic retry was attempted.',
      errorCategory: 'MALFORMED_RESPONSE',
      aiRequestAttempted: true,
      sources: allSourceSummaries,
      servedModel,
      usage,
      latencyMs,
    };
  }

  // 5. Validate structure. Never trust the model's JSON directly.
  const validation = validateEditorialPackage(parsed, { validSourceIds, candidateImageUrls });
  if (!validation.valid) {
    return {
      ...baseResult,
      status: 'VALIDATION_FAILED',
      failureReason: `Editorial package failed validation (${validation.issues.length} issue(s)). No automatic retry was attempted.`,
      errorCategory: 'VALIDATION_FAILED',
      aiRequestAttempted: true,
      sources: allSourceSummaries,
      editorialPackage: null,
      validation,
      servedModel,
      usage,
      latencyMs,
    };
  }

  const editorialPackage = asEditorialPackage(parsed, validation);

  // 6. Deterministic QA -- no AI call. sourceTextsById feeds the
  // source-vs-output originality check (see editorialQA.ts) -- keyed by
  // the same source_N ids already used throughout the prompt/schema/
  // validation, so QA can look up exactly the source text(s) the model
  // actually cited via sourcesUsed.
  const sourceTextsById = new Map(sourcesById.map(({ id, source }) => [id, source.articleText || '']));
  const qa = runEditorialQA(editorialPackage, { validSourceIds, candidateImageUrls, sourceTextsById });

  return {
    ...baseResult,
    status: 'SUCCESS',
    failureReason: null,
    errorCategory: null,
    aiRequestAttempted: true,
    sources: allSourceSummaries,
    editorialPackage,
    validation,
    qa,
    servedModel,
    usage,
    latencyMs,
  };
}
