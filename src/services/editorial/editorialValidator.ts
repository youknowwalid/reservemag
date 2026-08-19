// Server-side structural validation for the AI-generated editorial JSON.
// The model's output is never trusted directly: every field is checked
// for presence, type, and (where the task specifies one) a hard limit
// before anything downstream reads it. This is deliberately a plain
// hand-written validator, not a schema library -- the project has no
// existing schema-validation dependency, and this shape is small and
// stable enough not to need one.
//
// This validator checks STRUCTURE (is the JSON usable at all). Graded,
// editorial-severity checks (PASS/WARNING/FAIL judgment calls like "the
// article is a little short") belong in editorialQA.ts, not here -- a
// failure here means the record is unusable and generation is marked
// VALIDATION_FAILED with no automatic re-generation (see
// editorialGenerationService.ts).

import type { EditorialPackage, ValidationIssue, ValidationResult } from './editorialTypes';

// Hard limits. INSTAGRAM_HEADLINE_MAX/INSTAGRAM_SUBHEADLINE_MAX mirror the
// original task spec's Instagram field limits. COVER_KICKER_MAX reuses the
// same ceiling as a kicker-style short line is expected to be short
// regardless of which surface (Instagram or cover) it labels.
const COVER_KICKER_MAX = 40;
const INSTAGRAM_HEADLINE_MAX = 80;
const INSTAGRAM_SUBHEADLINE_MAX = 120;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function isValidUrl(v: string): boolean {
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the structure of a parsed editorial package against the
 * minimal, flat schema (see editorialTypes.ts's EditorialPackage doc
 * comment).
 *
 * `validSourceIds` -- the `source_N` ids that were actually supplied in
 * this generation's prompt, used to catch a hallucinated source
 * reference. `candidateImageUrls` -- every image URL that was offered as
 * a candidate, used to catch a fabricated image URL (the task requires
 * `imageUrl` to come verbatim from the supplied candidates, or be `""`).
 */
export function validateEditorialPackage(
  raw: unknown,
  context: { validSourceIds: Set<string>; candidateImageUrls: Set<string> },
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fail = (field: string, message: string) => issues.push({ field, message });

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, issues: [{ field: '$', message: 'Top-level response is not a JSON object.' }] };
  }
  const pkg = raw as Record<string, any>;

  if (!isNonEmptyString(pkg.title)) fail('title', 'Required non-empty string.');
  if (!isString(pkg.subtitle)) fail('subtitle', 'Required string.');
  if (!isNonEmptyString(pkg.article)) fail('article', 'Required non-empty string.');

  if (!isNonEmptyString(pkg.instagramHeadline)) fail('instagramHeadline', 'Required non-empty string.');
  else if (pkg.instagramHeadline.length > INSTAGRAM_HEADLINE_MAX) fail('instagramHeadline', `Exceeds ${INSTAGRAM_HEADLINE_MAX} characters.`);

  if (!isString(pkg.instagramSubheadline)) fail('instagramSubheadline', 'Required string.');
  else if (pkg.instagramSubheadline.length > INSTAGRAM_SUBHEADLINE_MAX) fail('instagramSubheadline', `Exceeds ${INSTAGRAM_SUBHEADLINE_MAX} characters.`);

  if (!isNonEmptyString(pkg.coverKicker)) fail('coverKicker', 'Required non-empty string.');
  else if (pkg.coverKicker.length > COVER_KICKER_MAX) fail('coverKicker', `Exceeds ${COVER_KICKER_MAX} characters.`);

  if (!isNonEmptyString(pkg.coverSecondaryLine)) fail('coverSecondaryLine', 'Required non-empty string.');

  if (!isNonEmptyString(pkg.caption)) fail('caption', 'Required non-empty string.');

  if (!isString(pkg.imageUrl)) {
    fail('imageUrl', 'Must be a string ("" if no suitable image).');
  } else if (pkg.imageUrl.length > 0) {
    if (!isValidUrl(pkg.imageUrl)) {
      fail('imageUrl', 'Not a well-formed http(s) URL.');
    } else if (!context.candidateImageUrls.has(pkg.imageUrl)) {
      fail('imageUrl', 'Does not match any supplied image candidate URL -- possible fabrication.');
    }
  }
  if (!isString(pkg.imageReason)) fail('imageReason', 'Required string.');

  if (!isStringArray(pkg.sourcesUsed)) {
    fail('sourcesUsed', 'Must be an array of source id strings.');
  } else {
    pkg.sourcesUsed.forEach((id: string, i: number) => {
      if (!context.validSourceIds.has(id)) fail(`sourcesUsed[${i}]`, `References unknown source id "${id}".`);
    });
  }

  if (!isStringArray(pkg.warnings)) fail('warnings', 'Must be an array of strings.');

  return { valid: issues.length === 0, issues };
}

/** Narrows `raw` to `EditorialPackage` after a successful `validateEditorialPackage()` call. Throws if called on an invalid result -- always check `.valid` first. */
export function asEditorialPackage(raw: unknown, validation: ValidationResult): EditorialPackage {
  if (!validation.valid) throw new Error('asEditorialPackage() called on an invalid package.');
  return raw as EditorialPackage;
}
