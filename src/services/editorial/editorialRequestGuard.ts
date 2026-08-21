// Pure request-shape validation for POST /api/admin/editorial/generate,
// extracted so the exact same logic server.ts enforces can be exercised
// by scripts/test-editorial-cost-safety.ts without spinning up a server.
// Admin authentication (verifyAdminRequest) happens separately in
// server.ts before this runs -- this only validates the request body.

import { MAX_SOURCE_URLS_PER_JOB } from './editorialGenerationService';
import type { EditorialGenerationInput } from './editorialTypes';

export type GenerationRequestGuardResult =
  | { ok: true; input: EditorialGenerationInput }
  | { ok: false; status: number; error: string };

/**
 * Validates a raw request body for the editorial generation endpoint.
 * Enforces, in order: explicit cost confirmation (never trust a
 * frontend-only confirmation -- the server must independently refuse
 * without it), and source URL shape/count.
 */
export function validateGenerationRequestBody(body: unknown): GenerationRequestGuardResult {
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.confirmed !== true) {
    return {
      ok: false,
      status: 400,
      error: 'This action requires explicit confirmation (confirmed: true) before an AI request is made.',
    };
  }

  const sourceUrls = b.sourceUrls;
  if (!Array.isArray(sourceUrls) || sourceUrls.length === 0 || !sourceUrls.every((u) => typeof u === 'string')) {
    return { ok: false, status: 400, error: 'sourceUrls must be a non-empty array of strings.' };
  }
  if (sourceUrls.length > MAX_SOURCE_URLS_PER_JOB) {
    return { ok: false, status: 400, error: `A maximum of ${MAX_SOURCE_URLS_PER_JOB} source URLs are allowed per editorial job.` };
  }

  // Separate from `contentType` above -- see EditorialGenerationInput's
  // doc comment on `bannerTemplate` for why these are two different
  // fields, not one repurposed. Validated strictly (rejected if present
  // and not one of the two known values) rather than silently coerced,
  // matching this guard's existing style for sourceUrls/confirmed.
  if (b.bannerTemplate !== undefined && b.bannerTemplate !== 'editorial' && b.bannerTemplate !== 'news') {
    return { ok: false, status: 400, error: "bannerTemplate must be 'editorial' or 'news' when provided." };
  }

  return {
    ok: true,
    input: {
      sourceUrls,
      subject: typeof b.subject === 'string' ? b.subject : undefined,
      requestedAngle: typeof b.requestedAngle === 'string' ? b.requestedAngle : undefined,
      contentType: typeof b.contentType === 'string' ? b.contentType : undefined,
      bannerTemplate: b.bannerTemplate as 'editorial' | 'news' | undefined,
    },
  };
}
