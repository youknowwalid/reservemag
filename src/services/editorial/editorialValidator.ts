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

const VALID_STATUSES = new Set(['READY', 'NEEDS_REVIEW']);

// Hard limits explicitly given in the task spec.
const INSTAGRAM_KICKER_MAX = 40;
const INSTAGRAM_HEADLINE_MAX = 80;
const INSTAGRAM_SUBHEADLINE_MAX = 120;
const INSTAGRAM_HASHTAG_MAX = 5;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function isConfidence(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
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
 * Validates the structure of a parsed editorial package.
 *
 * `validSourceIds` -- the `source_N` ids that were actually supplied in
 * this generation's prompt, used to catch a hallucinated source
 * reference. `candidateImageUrls` -- every image URL that was offered as
 * a candidate, used to catch a fabricated image URL (the task requires
 * `recommendedImageUrl` to come verbatim from the supplied candidates).
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

  // status
  if (!isString(pkg.status) || !VALID_STATUSES.has(pkg.status)) {
    fail('status', `Must be "READY" or "NEEDS_REVIEW"; got ${JSON.stringify(pkg.status)}.`);
  }

  // subject
  const subject = pkg.subject;
  if (typeof subject !== 'object' || subject === null) {
    fail('subject', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(subject.name)) fail('subject.name', 'Required non-empty string.');
    if (!isString(subject.shortBio)) fail('subject.shortBio', 'Required string.');
    for (const field of ['currentRole', 'organization', 'industry', 'location'] as const) {
      if (subject[field] !== null && !isString(subject[field])) fail(`subject.${field}`, 'Must be a string or null.');
    }
    for (const field of ['careerHighlights', 'notableAchievements', 'keyThemes'] as const) {
      if (!isStringArray(subject[field])) fail(`subject.${field}`, 'Must be an array of strings.');
    }
  }

  // research
  const research = pkg.research;
  if (typeof research !== 'object' || research === null) {
    fail('research', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(research.editorialAngle)) fail('research.editorialAngle', 'Required non-empty string.');
    if (!isString(research.angleReason)) fail('research.angleReason', 'Required string.');
    if (!Array.isArray(research.facts)) {
      fail('research.facts', 'Must be an array.');
    } else {
      research.facts.forEach((f: any, i: number) => {
        if (typeof f !== 'object' || f === null) {
          fail(`research.facts[${i}]`, 'Must be an object.');
          return;
        }
        if (!isNonEmptyString(f.claim)) fail(`research.facts[${i}].claim`, 'Required non-empty string.');
        if (!isStringArray(f.sourceIds)) {
          fail(`research.facts[${i}].sourceIds`, 'Must be an array of strings.');
        } else {
          for (const id of f.sourceIds) {
            if (!context.validSourceIds.has(id)) {
              fail(`research.facts[${i}].sourceIds`, `References unknown source id "${id}".`);
            }
          }
        }
        if (!isConfidence(f.confidence)) fail(`research.facts[${i}].confidence`, 'Must be a number 0-100.');
      });
    }
  }

  // article
  const article = pkg.article;
  if (typeof article !== 'object' || article === null) {
    fail('article', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(article.title)) fail('article.title', 'Required non-empty string.');
    if (!isString(article.subtitle)) fail('article.subtitle', 'Required string.');
    if (!isNonEmptyString(article.introduction)) fail('article.introduction', 'Required non-empty string.');
    if (!isNonEmptyString(article.conclusion)) fail('article.conclusion', 'Required non-empty string.');
    if (!Array.isArray(article.sections) || article.sections.length === 0) {
      fail('article.sections', 'Must be a non-empty array.');
    } else {
      article.sections.forEach((s: any, i: number) => {
        if (typeof s !== 'object' || s === null) {
          fail(`article.sections[${i}]`, 'Must be an object.');
          return;
        }
        if (!isNonEmptyString(s.heading)) fail(`article.sections[${i}].heading`, 'Required non-empty string.');
        if (!isNonEmptyString(s.body)) fail(`article.sections[${i}].body`, 'Required non-empty string.');
      });
    }
  }

  // instagram
  const instagram = pkg.instagram;
  if (typeof instagram !== 'object' || instagram === null) {
    fail('instagram', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(instagram.kicker)) fail('instagram.kicker', 'Required non-empty string.');
    else if (instagram.kicker.length > INSTAGRAM_KICKER_MAX) fail('instagram.kicker', `Exceeds ${INSTAGRAM_KICKER_MAX} characters.`);
    if (!isNonEmptyString(instagram.headline)) fail('instagram.headline', 'Required non-empty string.');
    else if (instagram.headline.length > INSTAGRAM_HEADLINE_MAX) fail('instagram.headline', `Exceeds ${INSTAGRAM_HEADLINE_MAX} characters.`);
    if (!isNonEmptyString(instagram.subheadline)) fail('instagram.subheadline', 'Required non-empty string.');
    else if (instagram.subheadline.length > INSTAGRAM_SUBHEADLINE_MAX)
      fail('instagram.subheadline', `Exceeds ${INSTAGRAM_SUBHEADLINE_MAX} characters.`);
    if (!isNonEmptyString(instagram.caption)) fail('instagram.caption', 'Required non-empty string.');
    if (!isStringArray(instagram.hashtags)) fail('instagram.hashtags', 'Must be an array of strings.');
    else if (instagram.hashtags.length > INSTAGRAM_HASHTAG_MAX) fail('instagram.hashtags', `Exceeds ${INSTAGRAM_HASHTAG_MAX} hashtags.`);
  }

  // cover
  const cover = pkg.cover;
  if (typeof cover !== 'object' || cover === null) {
    fail('cover', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(cover.primaryHeadline)) fail('cover.primaryHeadline', 'Required non-empty string.');
    if (!isNonEmptyString(cover.secondaryLine)) fail('cover.secondaryLine', 'Required non-empty string.');
  }

  // image
  const image = pkg.image;
  if (typeof image !== 'object' || image === null) {
    fail('image', 'Missing or not an object.');
  } else {
    if (image.recommendedImageUrl !== null && !isString(image.recommendedImageUrl)) {
      fail('image.recommendedImageUrl', 'Must be a string or null.');
    } else if (typeof image.recommendedImageUrl === 'string') {
      if (!isValidUrl(image.recommendedImageUrl)) {
        fail('image.recommendedImageUrl', 'Not a well-formed http(s) URL.');
      } else if (!context.candidateImageUrls.has(image.recommendedImageUrl)) {
        fail('image.recommendedImageUrl', 'Does not match any supplied image candidate URL -- possible fabrication.');
      }
    }
    if (image.recommendedImageSource !== null && !isString(image.recommendedImageSource)) {
      fail('image.recommendedImageSource', 'Must be a string or null.');
    }
    if (!isString(image.imageReason)) fail('image.imageReason', 'Required string.');
  }

  // seo
  const seo = pkg.seo;
  if (typeof seo !== 'object' || seo === null) {
    fail('seo', 'Missing or not an object.');
  } else {
    if (!isNonEmptyString(seo.title)) fail('seo.title', 'Required non-empty string.');
    if (!isNonEmptyString(seo.description)) fail('seo.description', 'Required non-empty string.');
    if (!isNonEmptyString(seo.slugSuggestion)) fail('seo.slugSuggestion', 'Required non-empty string.');
  }

  // sourcesUsed
  if (!Array.isArray(pkg.sourcesUsed)) {
    fail('sourcesUsed', 'Must be an array.');
  } else {
    pkg.sourcesUsed.forEach((s: any, i: number) => {
      if (typeof s !== 'object' || s === null) {
        fail(`sourcesUsed[${i}]`, 'Must be an object.');
        return;
      }
      if (!isNonEmptyString(s.sourceId)) fail(`sourcesUsed[${i}].sourceId`, 'Required non-empty string.');
      else if (!context.validSourceIds.has(s.sourceId)) fail(`sourcesUsed[${i}].sourceId`, `References unknown source id "${s.sourceId}".`);
      if (!isString(s.publisher)) fail(`sourcesUsed[${i}].publisher`, 'Required string.');
      if (!isString(s.title)) fail(`sourcesUsed[${i}].title`, 'Required string.');
      if (!isNonEmptyString(s.url) || !isValidUrl(s.url)) fail(`sourcesUsed[${i}].url`, 'Must be a well-formed http(s) URL.');
      if (!isStringArray(s.factsUsed)) fail(`sourcesUsed[${i}].factsUsed`, 'Must be an array of strings.');
    });
  }

  // selfCheck
  const selfCheck = pkg.selfCheck;
  if (typeof selfCheck !== 'object' || selfCheck === null) {
    fail('selfCheck', 'Missing or not an object.');
  } else {
    for (const field of ['unsupportedClaims', 'fabricatedQuotes', 'conflictingFacts', 'missingAttribution', 'warnings'] as const) {
      if (!isStringArray(selfCheck[field])) fail(`selfCheck.${field}`, 'Must be an array of strings.');
    }
    if (!isConfidence(selfCheck.confidence)) fail('selfCheck.confidence', 'Must be a number 0-100.');
  }

  return { valid: issues.length === 0, issues };
}

/** Narrows `raw` to `EditorialPackage` after a successful `validateEditorialPackage()` call. Throws if called on an invalid result -- always check `.valid` first. */
export function asEditorialPackage(raw: unknown, validation: ValidationResult): EditorialPackage {
  if (!validation.valid) throw new Error('asEditorialPackage() called on an invalid package.');
  return raw as EditorialPackage;
}
