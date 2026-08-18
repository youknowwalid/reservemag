// Application-level entry point for the Reserve Editorial Engine's AI
// integration.
//
// SERVER-SIDE ONLY. Everything under src/services/ai/ reads
// TABITOKEN_API_KEY from process.env and must never be imported from a
// React component, a browser bundle, or any other code path that ships to
// the client -- the guard below throws immediately if that happens.
//
// The rest of the application must depend on this file's exports
// (`aiProvider.generate(...)` / `generate(...)` / `testAIConnection()`)
// rather than importing TabitokenProvider directly, so the underlying
// gateway can be swapped later without touching call sites.

import { TabitokenProvider } from './tabitokenProvider';
import type { AIProvider } from './aiProvider';
import type { AIConnectionTestResult, AIGenerateOptions, AIGenerateResult } from './aiTypes';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/services/ai is server-only and must not be imported from browser/client code. Call the server API (e.g. /api/admin/ai-connection-test) instead.',
  );
}

/**
 * The active AI provider. Currently always Tabitoken; kept behind this
 * interface so a different backend can be swapped in later without
 * changing any call site.
 */
export const aiProvider: AIProvider = new TabitokenProvider();

/** Convenience wrapper around `aiProvider.generate(...)`. */
export function generate(options: AIGenerateOptions): Promise<AIGenerateResult> {
  return aiProvider.generate(options);
}

/** Convenience wrapper around `aiProvider.testConnection()`. */
export function testAIConnection(): Promise<AIConnectionTestResult> {
  return aiProvider.testConnection();
}

export type { AIProvider } from './aiProvider';
export * from './aiTypes';
