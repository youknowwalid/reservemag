// Server-side-only type definitions for the Reserve Editorial Engine's AI
// provider abstraction. Nothing under src/services/ai/ should ever be
// imported from a React component or any other code that ships to the
// browser -- see index.ts for the runtime guard against that.

export type AIChatRole = 'system' | 'user' | 'assistant';

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export interface AIUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type AIResponseFormat = 'text' | 'json_object';

export interface AIGenerateOptions {
  /** Convenience for a single system-turn; sent ahead of `messages`. */
  systemPrompt?: string;
  /** Convenience for a single user-turn; sent after `messages`. */
  userPrompt?: string;
  /** Full message history, for multi-turn calls. Optional if system/userPrompt cover the request. */
  messages?: AIChatMessage[];
  /** Sampling temperature, where the provider supports it. */
  temperature?: number;
  /** Response length cap, where the provider supports it. */
  maxTokens?: number;
  /** Per-request timeout in milliseconds. Defaults to the provider's own default. */
  timeoutMs?: number;
  /** Retry attempts on transient failures (timeouts, network errors, 429, 5xx). Defaults to the provider's own default. */
  retries?: number;
  /**
   * Request the provider return a single JSON object as `result.json`.
   * Best-effort: Tabitoken is an OpenAI-compatible gateway, not the OpenAI
   * API itself, so this is not guaranteed to be honored -- see
   * tabitokenProvider.ts for the fallback behavior.
   */
  responseFormat?: AIResponseFormat;
}

export interface AIGenerateResult {
  /** Raw assistant text. */
  text: string;
  /** Parsed JSON, populated only when `responseFormat: 'json_object'` was requested and parsing succeeded. */
  json: unknown | null;
  /** The model that actually served the request, as reported by the provider. */
  model: string;
  finishReason: string | null;
  usage: AIUsage;
}

export interface AIConnectionTestResult {
  ok: boolean;
  /** Human-readable, safe-to-display outcome. Never contains the API key. */
  message: string;
  model?: string;
  latencyMs?: number;
}

// Granular provider error codes. `authentication_error` (401) and
// `access_denied` (403) are deliberately distinct -- one means "the
// credentials are wrong," the other "the credentials are valid but this
// request/resource is refused" -- callers that classify failures for an
// admin-facing message (see editorialGenerationService.ts) need that
// distinction; collapsing both into a single `auth_error` (the previous
// shape of this type) is exactly the kind of information loss that turned
// a real Tabitoken failure into the generic "The AI provider returned an
// error" message this type was reworked to fix.
export type AIErrorCode =
  | 'config_error' // thrown locally before any network call (e.g. missing TABITOKEN_API_KEY) -- the provider was never actually reached
  | 'authentication_error' // HTTP 401 -- invalid/missing credentials
  | 'access_denied' // HTTP 403 -- credentials valid, request refused
  | 'invalid_request' // HTTP 400 (and not identified as a model problem)
  | 'model_error' // HTTP 404, or a 400 whose body specifically identifies a model problem
  | 'rate_limit' // HTTP 429
  | 'timeout'
  | 'network_error' // fetch itself failed (DNS, connection refused, etc.) -- no HTTP response at all
  | 'invalid_response' // gateway responded, but the body wasn't usable (non-JSON, missing message content)
  | 'provider_error' // HTTP 5xx, or any other unrecognized non-2xx status
  | 'unknown_error';

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  /** The provider's own error code/type from its response body (e.g. `"model_not_found"`), when it returned one. Never the HTTP status -- that's `status`. */
  readonly providerErrorCode?: string | null;
  /** A truncated, sanitized excerpt of the provider's error response body -- API keys and Authorization headers are stripped before this is ever set. Safe to log; still not guaranteed safe to show an end user verbatim (it's the provider's own text), so callers should prefer a constructed message over echoing this raw. */
  readonly responseBodySnippet?: string | null;
  override readonly cause?: unknown;

  constructor(
    message: string,
    code: AIErrorCode,
    options?: { status?: number; providerErrorCode?: string | null; responseBodySnippet?: string | null; cause?: unknown },
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = options?.status;
    this.providerErrorCode = options?.providerErrorCode ?? null;
    this.responseBodySnippet = options?.responseBodySnippet ?? null;
    this.cause = options?.cause;
  }
}
