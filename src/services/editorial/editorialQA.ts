// Deterministic, non-AI quality checks run on an already-structurally-
// valid editorial package (see editorialValidator.ts, which must pass
// first). These are graded editorial judgments (PASS/WARNING/FAIL), not
// structural correctness -- a package that fails validation never reaches
// this stage at all. No AI call is made here or triggered by a low
// result; a FAIL means the admin reviews it, not that the system
// regenerates automatically.
//
// `confidence` and `status` (READY/NEEDS_REVIEW) are computed here, not
// requested from the model -- the minimal request schema
// (editorialPromptBuilder.ts) deliberately doesn't ask for a self-rated
// confidence score. A rule-based score derived from these objective
// checks is more trustworthy than a model's self-assessment, and it can
// never "forget" to apply its own review threshold the way a model
// occasionally did under the old, larger schema.

import type { EditorialPackage, QaCheckResult, QaReport, QaSeverity } from './editorialTypes';

// Cover copy has no explicit character limit in the task spec (unlike the
// Instagram/cover-kicker fields, which do -- enforced in the validator) --
// this is a reasonable inferred ceiling for a magazine cover secondary
// line, checked as a WARNING rather than a hard validation failure.
const COVER_SECONDARY_LINE_SOFT_MAX = 100;

const ARTICLE_WORD_COUNT_TARGET_MIN = 600;
const ARTICLE_WORD_COUNT_TARGET_MAX = 900;
const ARTICLE_WORD_COUNT_SHORT_WARNING = 300; // below this and outside the target range, flag as unusually short
const ARTICLE_WORD_COUNT_FAIL_FLOOR = 100; // below this, treat as essentially empty

// Confidence starts at 100 and is docked per check outcome, floored at 0.
const CONFIDENCE_PENALTY_WARNING = 10;
const CONFIDENCE_PENALTY_FAIL = 25;
const NEEDS_REVIEW_CONFIDENCE_THRESHOLD = 70;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function worst(a: QaSeverity, b: QaSeverity): QaSeverity {
  const rank: Record<QaSeverity, number> = { PASS: 0, WARNING: 1, FAIL: 2 };
  return rank[b] > rank[a] ? b : a;
}

function normalizeForDupeCheck(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function runEditorialQA(
  pkg: EditorialPackage,
  context: { validSourceIds: Set<string>; candidateImageUrls: Set<string> },
): QaReport {
  const checks: QaCheckResult[] = [];
  const push = (check: string, severity: QaSeverity, message: string) => checks.push({ check, severity, message });

  // 1. Required fields -- the package already passed structural
  // validation to get here, so this check confirms the highest-value
  // fields aren't merely present-but-degenerate (e.g. whitespace-only)
  // in a way a naive presence check could miss.
  const requiredNonEmpty: Array<[string, string]> = [
    ['title', pkg.title],
    ['article', pkg.article],
    ['instagramHeadline', pkg.instagramHeadline],
    ['coverKicker', pkg.coverKicker],
    ['coverSecondaryLine', pkg.coverSecondaryLine],
    ['caption', pkg.caption],
  ];
  const emptyRequiredFields = requiredNonEmpty.filter(([, value]) => !value || !value.trim());
  if (emptyRequiredFields.length > 0) {
    for (const [field] of emptyRequiredFields) push('required_fields', 'FAIL', `${field} is empty.`);
  } else {
    push('required_fields', 'PASS', 'All required fields present.');
  }

  // 2. Article length
  const totalWords = countWords(pkg.article);
  if (totalWords < ARTICLE_WORD_COUNT_FAIL_FLOOR) {
    push('article_length', 'FAIL', `Article is only ${totalWords} words -- effectively empty.`);
  } else if (totalWords < ARTICLE_WORD_COUNT_SHORT_WARNING) {
    push('article_length', 'WARNING', `Article is ${totalWords} words, well under the ${ARTICLE_WORD_COUNT_TARGET_MIN}-${ARTICLE_WORD_COUNT_TARGET_MAX} target (acceptable if the source genuinely didn't support more).`);
  } else if (totalWords > ARTICLE_WORD_COUNT_TARGET_MAX * 1.3) {
    push('article_length', 'WARNING', `Article is ${totalWords} words, notably over the ${ARTICLE_WORD_COUNT_TARGET_MAX}-word target.`);
  } else {
    push('article_length', 'PASS', `Article is ${totalWords} words.`);
  }

  // 3. Duplicate paragraphs within the article (split on blank lines).
  const paragraphs = pkg.article.split(/\n{2,}/);
  const seen = new Set<string>();
  let duplicatesFound = 0;
  for (const p of paragraphs) {
    const key = normalizeForDupeCheck(p);
    if (key.length < 40) continue; // short strings collide too easily to be meaningful
    if (seen.has(key)) duplicatesFound++;
    seen.add(key);
  }
  push('duplicate_paragraphs', duplicatesFound > 0 ? 'WARNING' : 'PASS', duplicatesFound > 0 ? `${duplicatesFound} near-duplicate paragraph(s) found.` : 'No duplicate paragraphs found.');

  // 4. Cover secondary line length (soft limit -- see constant above; coverKicker's hard limit is already enforced in the validator).
  push(
    'cover_text_length',
    pkg.coverSecondaryLine.length > COVER_SECONDARY_LINE_SOFT_MAX ? 'WARNING' : 'PASS',
    pkg.coverSecondaryLine.length > COVER_SECONDARY_LINE_SOFT_MAX
      ? `coverSecondaryLine is ${pkg.coverSecondaryLine.length} characters, longer than the recommended length.`
      : 'Cover copy length is reasonable.',
  );

  // 5. Headline length (hard limit from the task spec -- already enforced
  // in the validator, but surfaced here too so a QA report alone tells
  // the full story without cross-referencing validation output).
  push('headline_length', pkg.instagramHeadline.length <= 80 ? 'PASS' : 'FAIL', `Instagram headline is ${pkg.instagramHeadline.length}/80 characters.`);

  // 6. Source IDs -- every reference should point at a source that was
  // actually supplied (the validator already rejects this structurally,
  // but this pass is defense in depth and reports it in QA terms too).
  const badSourceRefs = pkg.sourcesUsed.filter((id) => !context.validSourceIds.has(id));
  push(
    'source_ids',
    badSourceRefs.length > 0 ? 'FAIL' : pkg.sourcesUsed.length === 0 ? 'WARNING' : 'PASS',
    badSourceRefs.length > 0
      ? `Unknown source id(s) referenced: ${[...new Set(badSourceRefs)].join(', ')}.`
      : pkg.sourcesUsed.length === 0
        ? 'No sources were cited -- unusual for a sourced editorial.'
        : 'All source id references are valid.',
  );

  // 7. Image candidate URL
  if (pkg.imageUrl === '') {
    push('image_candidate_url', 'PASS', 'No image recommended (acceptable).');
  } else if (!context.candidateImageUrls.has(pkg.imageUrl)) {
    push('image_candidate_url', 'FAIL', 'Recommended image URL does not match any supplied candidate.');
  } else {
    push('image_candidate_url', 'PASS', 'Recommended image URL matches a supplied candidate.');
  }

  // 8. Model self-reported warnings -- informational, surfaced for admin
  // review rather than auto-failing, since the model is expected to
  // self-report honestly.
  push(
    'self_reported_warnings',
    pkg.warnings.length > 0 ? 'WARNING' : 'PASS',
    pkg.warnings.length > 0 ? `Model self-reported ${pkg.warnings.length} warning(s) -- review before publishing.` : 'Model reported no warnings.',
  );

  const overall = checks.reduce<QaSeverity>((acc, c) => worst(acc, c.severity), 'PASS');

  // Deterministic confidence score -- see this file's header comment for
  // why this replaces a model-self-reported number.
  const confidence = Math.max(
    0,
    100 - checks.filter((c) => c.severity === 'WARNING').length * CONFIDENCE_PENALTY_WARNING - checks.filter((c) => c.severity === 'FAIL').length * CONFIDENCE_PENALTY_FAIL,
  );
  const status = overall === 'FAIL' || confidence < NEEDS_REVIEW_CONFIDENCE_THRESHOLD ? 'NEEDS_REVIEW' : 'READY';

  return { overall, checks, confidence, status };
}
