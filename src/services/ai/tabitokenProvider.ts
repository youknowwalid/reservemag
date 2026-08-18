// AIProvider implementation for the Tabitoken gateway -- a third-party,
// OpenAI-compatible Chat Completions API (POST {baseUrl}/chat/completions).
//
// Configuration is read from environment variables at call time (never
// hardcoded, never imported into client code):
//   TABITOKEN_API_KEY   (required -- no default; sent as `Authorization: Bearer`)
//   TABITOKEN_BASE_URL  (default: https://tabitoken.com/v1)
//   TABITOKEN_MODEL     (default: claude-opus-5-thinking)
//
// This targets the standard Chat Completions request/response shape only.
// Tabitoken is explicitly documented as OpenAI-compatible, not an
// Anthropic-native endpoint, so features outside that standard shape
// (e.g. `response_format`) are attempted best-effort with a graceful
// fallback rather than assumed to work.

import { AIProviderError } from './aiTypes';
import type { AIProvider } from './aiProvider';
import type {
  AIChatMessage,
  AIConnectionTestResult,
  AIErrorCode,
  AIGenerateOptions,
  AIGenerateResult,
} from './aiTypes';

const DEFAULT_BASE_URL = 'https://tabitoken.com/v1';
// Locked production model (see the controlled comparison against
// claude-opus-4-8 / claude-opus-4-8-thinking / claude-opus-5 -- Thinking
// won on quality with no cost penalty under Tabitoken's flat per-request
// pricing). TABITOKEN_MODEL is still the actual source of truth at
// runtime; this is only the fallback when that env var is unset.
const DEFAULT_MODEL = 'claude-opus-4-8-thinking';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const CONNECTION_TEST_PHRASE = 'RESERVE AI CONNECTED';

interface TabitokenConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function resolveConfig(): TabitokenConfig {
  const apiKey = process.env.TABITOKEN_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      'TABITOKEN_API_KEY is not set. Add it to your local .env file (see .env.example) or your production environment settings -- it must never be hardcoded in source.',
      'config_error',
    );
  }
  const baseUrl = (process.env.TABITOKEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.TABITOKEN_MODEL || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

function buildMessages(options: AIGenerateOptions): AIChatMessage[] {
  const messages: AIChatMessage[] = [];
  if (options.systemPrompt?.trim()) messages.push({ role: 'system', content: options.systemPrompt });
  if (options.messages?.length) messages.push(...options.messages);
  if (options.userPrompt?.trim()) messages.push({ role: 'user', content: options.userPrompt });
  if (messages.length === 0) {
    throw new AIProviderError(
      'At least one of systemPrompt, userPrompt, or messages must be provided.',
      'config_error',
    );
  }
  return messages;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(text: string): unknown | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export class TabitokenProvider implements AIProvider {
  readonly name = 'tabitoken';

  async generate(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const config = resolveConfig();
    const messages = buildMessages(options);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.retries ?? DEFAULT_RETRIES;

    const baseBody: Record<string, unknown> = {
      model: config.model,
      messages,
    };
    if (typeof options.temperature === 'number') baseBody.temperature = options.temperature;
    if (typeof options.maxTokens === 'number') baseBody.max_tokens = options.maxTokens;

    let wantsJson = options.responseFormat === 'json_object';
    let attempt = 0;
    let lastError: AIProviderError | null = null;

    while (attempt <= maxRetries) {
      const requestBody = wantsJson ? { ...baseBody, response_format: { type: 'json_object' } } : baseBody;

      try {
        const raw = await this.sendRequest(config, requestBody, timeoutMs);
        return this.parseResult(raw, wantsJson);
      } catch (error) {
        const providerError = this.normalizeError(error);
        lastError = providerError;

        // Don't assume every OpenAI-compatible gateway honors
        // `response_format` -- if the request was rejected outright (400),
        // drop it and retry once without consuming a retry slot, instead
        // of failing the whole call over a best-effort feature. Gated on
        // maxRetries > 0: a caller that explicitly asked for zero retries
        // (e.g. a paid, cost-sensitive generation that must be at most
        // one real HTTP request no matter what) means exactly that --
        // this fallback is itself a second request, so it must not fire
        // when retries are disabled.
        if (wantsJson && providerError.status === 400 && maxRetries > 0) {
          wantsJson = false;
          continue;
        }

        const retryable =
          providerError.code === 'timeout' ||
          providerError.code === 'network_error' ||
          (providerError.status !== undefined && isRetryableStatus(providerError.status));

        if (!retryable || attempt === maxRetries) throw providerError;

        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        attempt += 1;
      }
    }

    throw lastError ?? new AIProviderError('Tabitoken request failed for an unknown reason.', 'provider_error');
  }

  async testConnection(): Promise<AIConnectionTestResult> {
    const start = Date.now();
    try {
      const config = resolveConfig();
      const result = await this.generate({
        userPrompt: `Reply with exactly: ${CONNECTION_TEST_PHRASE}`,
        maxTokens: 20,
        temperature: 0,
        timeoutMs: 15_000,
        retries: 1,
      });
      const latencyMs = Date.now() - start;
      const reply = result.text.trim();

      if (reply.includes(CONNECTION_TEST_PHRASE)) {
        return {
          ok: true,
          message: 'Connected to the Tabitoken gateway.',
          model: result.model || config.model,
          latencyMs,
        };
      }
      return {
        ok: false,
        message: `Gateway responded, but not with the expected phrase (received: "${reply.slice(0, 200)}").`,
        model: result.model || config.model,
        latencyMs,
      };
    } catch (error) {
      const providerError = this.normalizeError(error);
      return { ok: false, message: providerError.message, latencyMs: Date.now() - start };
    }
  }

  private async sendRequest(
    config: TabitokenConfig,
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new AIProviderError(`Tabitoken request timed out after ${timeoutMs}ms.`, 'timeout', { cause: error });
      }
      throw new AIProviderError(
        `Failed to reach the Tabitoken gateway: ${error?.message || error}`,
        'network_error',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const code: AIErrorCode =
        response.status === 401 || response.status === 403
          ? 'auth_error'
          : response.status === 429
            ? 'rate_limit'
            : 'provider_error';
      throw new AIProviderError(
        `Tabitoken gateway returned ${response.status}: ${errorText.slice(0, 500) || response.statusText}`,
        code,
        { status: response.status },
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AIProviderError('Tabitoken gateway returned a non-JSON response.', 'invalid_response', {
        cause: error,
      });
    }
  }

  private parseResult(raw: any, wantedJson: boolean): AIGenerateResult {
    const choice = raw?.choices?.[0];
    const text: string = choice?.message?.content ?? '';
    if (typeof text !== 'string') {
      throw new AIProviderError('Tabitoken gateway response did not include message content.', 'invalid_response');
    }

    const usage = raw?.usage ?? {};
    return {
      text,
      json: wantedJson ? tryParseJson(text) : null,
      model: typeof raw?.model === 'string' ? raw.model : '',
      finishReason: choice?.finish_reason ?? null,
      usage: {
        promptTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
        completionTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
        totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
      },
    };
  }

  private normalizeError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    return new AIProviderError(error instanceof Error ? error.message : String(error), 'provider_error', {
      cause: error,
    });
  }
}
