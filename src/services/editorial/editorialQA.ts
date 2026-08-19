// Deterministic, non-AI quality checks run on an already-structurally-valid
// editorial package. No AI call is made here and a FAIL never triggers a
// regeneration. English-only output is a hard publication requirement.

import type { EditorialPackage, QaCheckResult, QaReport, QaSeverity } from './editorialTypes';

const COVER_SECONDARY_LINE_SOFT_MAX = 100;
const ARTICLE_WORD_COUNT_TARGET_MIN = 600;
const ARTICLE_WORD_COUNT_TARGET_MAX = 900;
const ARTICLE_WORD_COUNT_SHORT_WARNING = 300;
const ARTICLE_WORD_COUNT_FAIL_FLOOR = 100;

const CONFIDENCE_PENALTY_WARNING = 10;
const CONFIDENCE_PENALTY_FAIL = 25;
const NEEDS_REVIEW_CONFIDENCE_THRESHOLD = 70;

// Bengali is explicitly blocked because Bengali-language source material was
// the failure mode that exposed this requirement. These ranges cover the
// Bengali Unicode block and Bengali extended block. The model is instructed
// to translate the source into English; this check is the final deterministic
// gate so Bengali text can never silently reach publication as READY.
const NON_ENGLISH_BENGALI_RE = /[\u0980-\u09FF\u{1CD0}-\u{1CFF]/u;

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

function englishTextFields(pkg: EditorialPackage): Array<[string, string]> {
  return [
    ['title', pkg.title],
    ['subtitle', pkg.subtitle],
    ['article', pkg.article],
    ['instagramHeadline', pkg.instagramHeadline],
    ['instagramSubheadline', pkg.instagramSubheadline],
    ['coverKicker', pkg.coverKicker],
    ['coverSecondaryLine', pkg.coverSecondaryLine],
    ['caption', pkg.caption],
    ['imageReason', pkg.imageReason],
    ['warnings', pkg.warnings.join(' ')],
  ];
}

export function runEditorialQA(
  pkg: EditorialPackage,
  context: { validSourceIds: Set<string>; candidateImageUrls: Set<string> },
): QaReport {
  const checks: QaCheckResult[] = [];
  const push = (check: string, severity: QaSeverity, message: string) => checks.push({ check, severity, message });

  // 1. Required fields
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

  // 2. English-only publication gate
  const nonEnglishFields = englishTextFields(pkg)
    .filter(([, value]) => NON_ENGLISH_BENGALI_RE.test(value))
    .map(([field]) => field);
  push(
    'english_only',
    nonEnglishFields.length > 0 ? 'FAIL' : 'PASS',
    nonEnglishFields.length > 0
      ? `Non-English Bengali script detected in: ${nonEnglishFields.join(', ')}. Editorial output must be English only.`
      : 'All generated editorial text is English-only with no Bengali script detected.',
  );

  // 3. Article length
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

  // 4. Duplicate paragraphs
  const paragraphs = pkg.article.split(/\n{2,}/);
  const seen = new Set<string>();
  let duplicatesFound = 0;
  for (const p of paragraphs) {
    const key = normalizeForDupeCheck(p);
    if (key.length < 40) continue;
    if (seen.has(key)) duplicatesFound++;
    seen.add(key);
  }
  push('duplicate_paragraphs', duplicatesFound > 0 ? 'WARNING' : 'PASS', duplicatesFound > 0 ? `${duplicatesFound} near-duplicate paragraph(s) found.` : 'No duplicate paragraphs found.');

  // 5. Cover secondary line length
  push(
    'cover_text_length',
    pkg.coverSecondaryLine.length > COVER_SECONDARY_LINE_SOFT_MAX ? 'WARNING' : 'PASS',
    pkg.coverSecondaryLine.length > COVER_SECONDARY_LINE_SOFT_MAX
      ? `coverSecondaryLine is ${pkg.coverSecondaryLine.length} characters, longer than the recommended length.`
      : 'Cover copy length is reasonable.',
  );

  // 6. Instagram headline length
  push('headline_length', pkg.instagramHeadline.length <= 80 ? 'PASS' : 'FAIL', `Instagram headline is ${pkg.instagramHeadline.length}/80 characters.`);

  // 7. Source IDs
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

  // 8. Image candidate URL
  if (pkg.imageUrl === '') {
    push('image_candidate_url', 'PASS', 'No image recommended (acceptable).');
  } else if (!context.candidateImageUrls.has(pkg.imageUrl)) {
    push('image_candidate_url', 'FAIL', 'Recommended image URL does not match any supplied candidate.');
  } else {
    push('image_candidate_url', 'PASS', 'Recommended image URL matches a supplied candidate.');
  }

  // 9. Model self-reported warnings
  push(
    'self_reported_warnings',
    pkg.warnings.length > 0 ? 'WARNING' : 'PASS',
    pkg.warnings.length > 0 ? `Model self-reported ${pkg.warnings.length} warning(s) -- review before publishing.` : 'Model reported no warnings.',
  );

  const overall = checks.reduce<QaSeverity>((acc, c) => worst(acc, c.severity), 'PASS');
  const confidence = Math.max(
    0,
    100 - checks.filter((c) => c.severity === 'WARNING').length * CONFIDENCE_PENALTY_WARNING - checks.filter((c) => c.severity === 'FAIL').length * CONFIDENCE_PENALTY_FAIL,
  );
  const status = overall === 'FAIL' || confidence < NEEDS_REVIEW_CONFIDENCE_THRESHOLD ? 'NEEDS_REVIEW' : 'READY';

  return { overall, checks, confidence, status };
}
