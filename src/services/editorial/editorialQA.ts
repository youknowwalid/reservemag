// Deterministic, non-AI quality checks run on an already-structurally-valid
// editorial package. No AI call is made here and a FAIL never triggers a
// regeneration. English-only output is a hard publication requirement, and
// so is substantial rewriting relative to the source(s) -- see the
// source_originality check below, which is the deterministic backstop for
// editorialPromptBuilder.ts's "NON-NEGOTIABLE REWRITING RULE".

import type { EditorialPackage, QaCheckResult, QaReport, QaSeverity } from './editorialTypes';

const COVER_SECONDARY_LINE_SOFT_MAX = 100;
const ARTICLE_WORD_COUNT_TARGET_MIN = 600;
const ARTICLE_WORD_COUNT_TARGET_MAX = 900;
const ARTICLE_WORD_COUNT_SHORT_WARNING = 300;
const ARTICLE_WORD_COUNT_FAIL_FLOOR = 100;

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

// Source-vs-output originality check -- catches a substantially unrewritten
// article, which nothing else in the pipeline checks for: the prompt asks
// for one, but a model can satisfy every other requirement (facts,
// language, JSON shape, length) while staying very close to the source's
// own sentences, especially when the source is already in English.
const SOURCE_OVERLAP_WARNING_THRESHOLD = 0.2;
const SOURCE_OVERLAP_FAIL_THRESHOLD = 0.35;

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/numbers/whitespace (Unicode-aware)
    .split(/\s+/)
    .filter(Boolean);
}

function trigrams(words: string[]): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return grams;
}

/**
 * Fraction of the article's trigrams (3-consecutive-word sequences) that
 * also appear verbatim in the source text -- a containment ratio, not a
 * symmetric similarity score, because the question that matters is "how
 * much of what we published already existed word-for-word in the
 * source," not how much overlap exists in either direction (a long
 * source trivially "contains" less of a short article's language, which
 * isn't the failure mode this check exists to catch).
 *
 * Trigrams are the standard granularity for this kind of near-duplicate
 * detection: bigrams produce too many incidental matches from ordinary
 * English connective phrasing ("of the", "in a"), while longer n-grams
 * miss a near-copy that lightly edits individual words but keeps the
 * source's sentence structure intact. A genuinely independent rewrite of
 * the same facts still produces some nonzero baseline overlap purely
 * from common phrasing and unavoidable factual terms (names, dates,
 * figures) -- in practice this baseline sits well under 20%, which is
 * why that's the warning floor rather than 0. Above roughly a third of
 * the article's phrasing being verbatim-traceable to the source is a
 * reasonable, practical line for "this reads as a paraphrase or a
 * lightly-edited copy, not an original piece" -- these are the same kind
 * of reasoned, non-clinically-calibrated thresholds already used
 * elsewhere in this file (e.g. the article-length bands above).
 */
function sourceOverlapRatio(articleText: string, sourceText: string): number {
  const articleGrams = trigrams(tokenizeWords(articleText));
  if (articleGrams.size === 0) return 0;
  const sourceGrams = trigrams(tokenizeWords(sourceText));
  if (sourceGrams.size === 0) return 0;
  let matched = 0;
  for (const gram of articleGrams) if (sourceGrams.has(gram)) matched++;
  return matched / articleGrams.size;
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

// English editorial copy may contain Latin letters, punctuation, numbers,
// symbols and normal Latin diacritics (e.g. café). Any other Unicode letter
// script is rejected. This is intentionally broader than a Bengali-only
// check: the magazine is English-only regardless of the source language.
function hasNonLatinLetters(text: string): boolean {
  return Array.from(text).some((char) => /\p{L}/u.test(char) && !/\p{Script=Latin}/u.test(char));
}

export function runEditorialQA(
  pkg: EditorialPackage,
  context: { validSourceIds: Set<string>; candidateImageUrls: Set<string>; sourceTextsById: Map<string, string> },
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
    .filter(([, value]) => hasNonLatinLetters(value))
    .map(([field]) => field);
  push(
    'english_only',
    nonEnglishFields.length > 0 ? 'FAIL' : 'PASS',
    nonEnglishFields.length > 0
      ? `Non-English script detected in: ${nonEnglishFields.join(', ')}. Editorial output must be English only.`
      : 'All generated editorial text uses Latin script and passes the English-only publication gate.',
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

  // 10. Source-vs-output originality -- see sourceOverlapRatio()'s doc
  // comment for the method and thresholds. Runs regardless of source
  // language: a genuinely translated, independently-written article
  // naturally produces very low trigram overlap with a non-English
  // source, so this doesn't need a separate language-detection step to
  // decide whether to run -- it's a real signal either way. Only the
  // source(s) actually cited in sourcesUsed count; a source that was
  // retrieved for the job but not drawn on shouldn't count against
  // originality.
  const citedSourceText = pkg.sourcesUsed
    .map((id) => context.sourceTextsById.get(id))
    .filter((text): text is string => Boolean(text))
    .join('\n\n');
  if (citedSourceText) {
    const overlap = sourceOverlapRatio(pkg.article, citedSourceText);
    const overlapPct = (overlap * 100).toFixed(1);
    if (overlap >= SOURCE_OVERLAP_FAIL_THRESHOLD) {
      push(
        'source_originality',
        'FAIL',
        `${overlapPct}% of the article's phrasing (3-word sequences) is verbatim-traceable to the cited source(s) -- this reads as a close paraphrase or a lightly-edited copy, not a substantially reworded original piece.`,
      );
    } else if (overlap >= SOURCE_OVERLAP_WARNING_THRESHOLD) {
      push('source_originality', 'WARNING', `${overlapPct}% of the article's phrasing is verbatim-traceable to the cited source(s) -- noticeably close in places; worth a review pass.`);
    } else {
      push('source_originality', 'PASS', `Only ${overlapPct}% of the article's phrasing is verbatim-traceable to the cited source(s) -- substantially reworded.`);
    }
  } else {
    push('source_originality', 'PASS', 'No cited source text was available to compare against.');
  }

  const overall = checks.reduce<QaSeverity>((acc, c) => worst(acc, c.severity), 'PASS');
  const confidence = Math.max(
    0,
    100 - checks.filter((c) => c.severity === 'WARNING').length * CONFIDENCE_PENALTY_WARNING - checks.filter((c) => c.severity === 'FAIL').length * CONFIDENCE_PENALTY_FAIL,
  );
  const status = overall === 'FAIL' || confidence < NEEDS_REVIEW_CONFIDENCE_THRESHOLD ? 'NEEDS_REVIEW' : 'READY';

  return { overall, checks, confidence, status };
}
