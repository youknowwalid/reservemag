// The application-facing contract every AI backend must implement. Callers
// (server.ts routes, future editorial-automation code) should depend on
// this interface -- via the `aiProvider` singleton exported from
// src/services/ai/index.ts -- rather than importing a concrete provider
// like TabitokenProvider directly. That keeps the gateway swappable.

import type { AIConnectionTestResult, AIGenerateOptions, AIGenerateResult } from './aiTypes';

export interface AIProvider {
  /** Short identifier for logging/diagnostics, e.g. "tabitoken". */
  readonly name: string;

  /** Run a chat completion against the provider. */
  generate(options: AIGenerateOptions): Promise<AIGenerateResult>;

  /**
   * Trivial connectivity check -- sends a fixed prompt and verifies the
   * expected reply. Used by the server-side health check script and the
   * admin-only "AI Connection Test" action. Never throws; failures are
   * reported via `{ ok: false, message }`.
   */
  testConnection(): Promise<AIConnectionTestResult>;
}
