// Deterministic, non-AI quality checks run on an already-structurally-
// valid editorial package (see editorialValidator.ts, which must pass
// first). These are graded editorial judgments (PASS/WARNING/FAIL), not
// structural correctness -- a package that fails validation never reaches
// this stage at all. No AI call is made here or triggered by a low
// result; a FAIL means the admin reviews it, not that the system
// regenerates automatically.

import type { EditorialPackage, QaCheckResult, QaReport, QaSeverity } from './editorialTypes';

// Cover copy has no explicit character limit in the task spec (unlike the
// Instagram fields, which do) -- these are a reasonable inferred ceiling
// for a magazine cover treatment, checked as a WARNING rather than a hard
// validation failure.
const COVER_PRIMARY_HEADLINE_SOFT_MAX = 60;
const COVER_SECONDARY_LINE_SOFT_MAX = 100;

const ARTICLE_WORD_COUNT_TARGET_MIN = 800;
const ARTICLE_WORD_COUNT_TARGET_MAX = 1200;
const ARTICLE_WORD_COUNT_SHORT_WARNING = 400; // below this and outside the target range, flag as unusually short
const ARTICLE_WORD_COUNT_FAIL_FLOOR = 100; // below this, treat as essentially empty

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
  // fields aren't merely present-but-degenerate (e.g. a title equal to
  // the empty string would already have failed validation; this catches
  // softer emptiness like a whitespace-only field that a naive check
  // could miss).
  const requiredNonEmpty: Array<[string, string]> = [
    ['article.title', pkg.article.title],
    ['article.introduction', pkg.article.introduction],
    ['article.conclusion', pkg.article.conclusion],
    ['instagram.headline', pkg.instagram.headline],
    ['cover.primaryHeadline', pkg.cover.primaryHeadline],
  ];
  const emptyRequiredFields = requiredNonEmpty.filter(([, value]) => !value || !value.trim());
  if (emptyRequiredFields.length > 0) {
    for (const [field] of emptyRequiredFields) push('required_fields', 'FAIL', `${field} is empty.`);
  } else {
    push('required_fields', 'PASS', 'All required fields present.');
  }

  // 2. Article length
  const sectionWords = pkg.article.sections.reduce((sum, s) => sum + countWords(s.body), 0);
  const totalWords = countWords(pkg.article.introduction) + sectionWords + countWords(pkg.article.conclusion);
  if (totalWords < ARTICLE_WORD_COUNT_FAIL_FLOOR) {
    push('article_length', 'FAIL', `Article is only ${totalWords} words -- effectively empty.`);
  } else if (totalWords < ARTICLE_WORD_COUNT_SHORT_WARNING) {
    push('article_length', 'WARNING', `Article is ${totalWords} words, well under the ${ARTICLE_WORD_COUNT_TARGET_MIN}-${ARTICLE_WORD_COUNT_TARGET_MAX} target (acceptable if the sources genuinely didn't support more).`);
  } else if (totalWords > ARTICLE_WORD_COUNT_TARGET_MAX * 1.3) {
    push('article_length', 'WARNING', `Article is ${totalWords} words, notably over the ${ARTICLE_WORD_COUNT_TARGET_MAX}-word target.`);
  } else {
    push('article_length', 'PASS', `Article is ${totalWords} words.`);
  }

  // 3. Duplicate paragraphs (intro / sections / conclusion, near-identical after normalization)
  const paragraphs = [pkg.article.introduction, ...pkg.article.sections.map((s) => s.body), pkg.article.conclusion];
  const seen = new Set<string>();
  let duplicatesFound = 0;
  for (const p of paragraphs) {
    const key = normalizeForDupeCheck(p);
    if (key.length < 40) continue; // short strings collide too easily to be meaningful
    if (seen.has(key)) duplicatesFound++;
    seen.add(key);
  }
  push('duplicate_paragraphs', duplicatesFound > 0 ? 'WARNING' : 'PASS', duplicatesFound > 0 ? `${duplicatesFound} near-duplicate paragraph(s) found.` : 'No duplicate paragraphs found.');

  // 4. Cover text length (soft limits -- see constants above)
  const coverIssues: string[] = [];
  if (pkg.cover.primaryHeadline.length > COVER_PRIMARY_HEADLINE_SOFT_MAX) coverIssues.push(`primaryHeadline is ${pkg.cover.primaryHeadline.length} chars`);
  if (pkg.cover.secondaryLine.length > COVER_SECONDARY_LINE_SOFT_MAX) coverIssues.push(`secondaryLine is ${pkg.cover.secondaryLine.length} chars`);
  push('cover_text_length', coverIssues.length > 0 ? 'WARNING' : 'PASS', coverIssues.length > 0 ? `Longer than the recommended cover length: ${coverIssues.join(', ')}.` : 'Cover copy length is reasonable.');

  // 5. Headline length (hard limit from the task spec -- already enforced
  // in the validator, but surfaced here too so a QA report alone tells
  // the full story without cross-referencing validation output).
  push('headline_length', pkg.instagram.headline.length <= 80 ? 'PASS' : 'FAIL', `Instagram headline is ${pkg.instagram.headline.length}/80 characters.`);

  // 6. Hashtag count
  push('hashtag_count', pkg.instagram.hashtags.length <= 5 ? 'PASS' : 'FAIL', `${pkg.instagram.hashtags.length}/5 hashtags.`);

  // 7. Source IDs -- every reference should point at a source that was
  // actually supplied (the validator already rejects this structurally,
  // but this pass is defense in depth and reports it in QA terms too).
  const badSourceRefs: string[] = [];
  for (const fact of pkg.research.facts) {
    for (const id of fact.sourceIds) if (!context.validSourceIds.has(id)) badSourceRefs.push(id);
  }
  for (const su of pkg.sourcesUsed) {
    if (!context.validSourceIds.has(su.sourceId)) badSourceRefs.push(su.sourceId);
  }
  push('source_ids', badSourceRefs.length > 0 ? 'FAIL' : 'PASS', badSourceRefs.length > 0 ? `Unknown source id(s) referenced: ${[...new Set(badSourceRefs)].join(', ')}.` : 'All source id references are valid.');

  // 8. Image candidate URL
  if (pkg.image.recommendedImageUrl === null) {
    push('image_candidate_url', 'PASS', 'No image recommended (acceptable).');
  } else if (!context.candidateImageUrls.has(pkg.image.recommendedImageUrl)) {
    push('image_candidate_url', 'FAIL', 'Recommended image URL does not match any supplied candidate.');
  } else {
    push('image_candidate_url', 'PASS', 'Recommended image URL matches a supplied candidate.');
  }

  // 9. Malformed URLs (sourcesUsed + image)
  const malformed: string[] = [];
  for (const su of pkg.sourcesUsed) {
    try {
      new URL(su.url);
    } catch {
      malformed.push(`sourcesUsed[${su.sourceId}].url`);
    }
  }
  push('malformed_urls', malformed.length > 0 ? 'FAIL' : 'PASS', malformed.length > 0 ? `Malformed URL(s): ${malformed.join(', ')}.` : 'All URLs are well-formed.');

  // 10. Empty content (spot-check the sections array, beyond what required_fields covers)
  const emptySections = pkg.article.sections.filter((s) => !s.heading.trim() || !s.body.trim()).length;
  push('empty_content', emptySections > 0 ? 'FAIL' : 'PASS', emptySections > 0 ? `${emptySections} article section(s) have an empty heading or body.` : 'No empty sections.');

  // 11. Confidence -- range already validated structurally; here we check
  // the model's own status/confidence consistency (it was told: below 70
  // means NEEDS_REVIEW).
  const confidence = pkg.selfCheck.confidence;
  if (confidence < 70 && pkg.status !== 'NEEDS_REVIEW') {
    push('confidence', 'WARNING', `selfCheck.confidence is ${confidence} (<70) but status is "${pkg.status}", not "NEEDS_REVIEW" -- the model didn't apply its own rule.`);
  } else {
    push('confidence', 'PASS', `selfCheck.confidence is ${confidence}, consistent with status "${pkg.status}".`);
  }

  // 12. Unsupported claims / fabrications the model itself reported --
  // informational, surfaced for admin review rather than auto-failing,
  // since the model is expected to self-report honestly.
  const selfReported =
    pkg.selfCheck.unsupportedClaims.length +
    pkg.selfCheck.fabricatedQuotes.length +
    pkg.selfCheck.conflictingFacts.length +
    pkg.selfCheck.missingAttribution.length;
  if (pkg.selfCheck.fabricatedQuotes.length > 0) {
    push('self_reported_issues', 'FAIL', `Model self-reported ${pkg.selfCheck.fabricatedQuotes.length} fabricated quote(s).`);
  } else if (selfReported > 0) {
    push('self_reported_issues', 'WARNING', `Model self-reported ${selfReported} issue(s) (unsupported claims, conflicting facts, or missing attribution) -- review before publishing.`);
  } else {
    push('self_reported_issues', 'PASS', 'Model reported no unsupported claims, fabricated quotes, conflicts, or missing attribution.');
  }

  const overall = checks.reduce<QaSeverity>((acc, c) => worst(acc, c.severity), 'PASS');
  return { overall, checks };
}
