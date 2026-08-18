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

export type AIErrorCode =
  | 'config_error'
  | 'auth_error'
  | 'timeout'
  | 'network_error'
  | 'rate_limit'
  | 'invalid_response'
  | 'provider_error';

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(message: string, code: AIErrorCode, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}
