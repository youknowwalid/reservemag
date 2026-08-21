// Deterministic, network/DOM-free tests for the News banner template's
// pure logic (src/lib/instagramBannerRenderer.ts). Run with
// `npm run test:news-banner-template`.
//
// Only tests the two functions that are genuinely pure (no canvas, no
// document/fonts, no image loading): tokenizeWithEmphasis() -- the
// admin-controlled red-emphasis-phrase logic, which is the riskiest new
// piece of string handling this template adds -- and computeCoverFit(),
// the cover-fit/focal-point math shared between the editorial template's
// full-canvas photo and the news template's boxed photo (proving there is
// exactly one implementation, not two). The actual canvas drawing
// (renderInstagramBanner, renderNewsTemplate) needs a real browser Canvas
// 2D context and loaded webfonts to produce a meaningful result, which
// this codebase has no jsdom/canvas-mocking infrastructure for (see
// instagramBannerRenderer.ts's own header comment on why it deliberately
// avoids that route) -- exercised manually instead, via the admin panel's
// live preview.

import { tokenizeWithEmphasis, computeCoverFit } from '../src/lib/instagramBannerRenderer';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS -- ${label}`);
  } else {
    failed++;
    console.log(`  FAIL -- ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  }
}

function words(emphasized: boolean, ...text: string[]) {
  return text.map((word) => ({ word, emphasized }));
}

// ---------------------------------------------------------------------------
// tokenizeWithEmphasis
// ---------------------------------------------------------------------------

function testNoEmphasisPhrase() {
  console.log('\n=== no emphasis phrase -- every word unemphasized ===');
  const result = tokenizeWithEmphasis('Reserve Bank Raises Interest Rates', '');
  assert(result.every((w) => !w.emphasized), 'every word is unemphasized when emphasisPhrase is empty', result);
  assert(result.map((w) => w.word).join(' ') === 'RESERVE BANK RAISES INTEREST RATES', 'words are uppercased, in original order', result);
}

function testSimpleTrailingPhrase() {
  console.log('\n=== emphasis phrase matches the trailing clause ===');
  const result = tokenizeWithEmphasis('Markets React As Rates Hit Record High', 'Record High');
  const expected = [...words(false, 'MARKETS', 'REACT', 'AS', 'RATES', 'HIT'), ...words(true, 'RECORD', 'HIGH')];
  assert(JSON.stringify(result) === JSON.stringify(expected), 'only the matched trailing words are emphasized', result);
}

function testCaseInsensitiveMatch() {
  console.log('\n=== case-insensitive match ===');
  const result = tokenizeWithEmphasis('Prices Fall Sharply', 'prices fall');
  assert(result[0].emphasized && result[1].emphasized && !result[2].emphasized, 'match is case-insensitive', result);
}

function testPhraseNotFound() {
  console.log('\n=== emphasis phrase not present in headline -- falls back to no emphasis, never throws ===');
  const result = tokenizeWithEmphasis('Global Trade Slows', 'nonexistent phrase');
  assert(result.every((w) => !w.emphasized), 'no word is emphasized when the phrase is not found', result);
  assert(result.length === 3, 'headline is still fully tokenized', result.length);
}

function testWholeWordNeverSplit() {
  console.log('\n=== a partial-word match still emphasizes the WHOLE word, never splits it ===');
  // "cord" only partially overlaps "RECORD" -- the whole word must still
  // come back emphasized, not silently dropped or half-colored.
  const result = tokenizeWithEmphasis('Hits Record High', 'cord high');
  assert(result[0].emphasized === false, '"HITS" (before the match) is not emphasized', result);
  assert(result[1].emphasized === true, '"RECORD" (partially overlapped) is emphasized as a whole word', result);
  assert(result[2].emphasized === true, '"HIGH" (fully matched) is emphasized', result);
}

function testEmptyHeadline() {
  console.log('\n=== empty headline -- returns no words, never throws ===');
  assert(tokenizeWithEmphasis('', 'anything').length === 0, 'empty headline tokenizes to an empty array');
  assert(tokenizeWithEmphasis('   ', '').length === 0, 'whitespace-only headline tokenizes to an empty array');
}

function testMultiWordPhraseInMiddle() {
  console.log('\n=== emphasis phrase in the middle of the headline (not just the final clause) ===');
  const result = tokenizeWithEmphasis('THE RESERVE BANK SURPRISES MARKETS TODAY', 'RESERVE BANK');
  const expected = [
    { word: 'THE', emphasized: false },
    { word: 'RESERVE', emphasized: true },
    { word: 'BANK', emphasized: true },
    { word: 'SURPRISES', emphasized: false },
    { word: 'MARKETS', emphasized: false },
    { word: 'TODAY', emphasized: false },
  ];
  assert(JSON.stringify(result) === JSON.stringify(expected), 'admin can highlight any phrase, not just the trailing clause', result);
}

// ---------------------------------------------------------------------------
// computeCoverFit
// ---------------------------------------------------------------------------

function testCoverFitCenteredSquareIntoLandscape() {
  console.log('\n=== computeCoverFit: square image into a wider-than-tall box, centered ===');
  // 1000x1000 image into a 400x200 box -- must scale to cover the wider
  // dimension (400/1000 = 0.4), so drawWidth=400, drawHeight=400, and a
  // centered focal point crops 100px off both the top and bottom.
  const fit = computeCoverFit(1000, 1000, 400, 200, 50, 50);
  assert(fit.drawWidth === 400, 'scales to exactly cover the box width', fit);
  assert(fit.drawHeight === 400, 'height scales proportionally with width', fit);
  assert(fit.drawX === 0, 'no horizontal crop needed -- width matches exactly', fit);
  assert(fit.drawY === -100, 'centered focal point crops equally off both the top and bottom', fit);
}

function testCoverFitFocalPointExtremes() {
  console.log('\n=== computeCoverFit: focal point 0/100 vs 100/100 crops from opposite edges ===');
  const topLeft = computeCoverFit(1000, 1000, 400, 200, 0, 0);
  const bottomRight = computeCoverFit(1000, 1000, 400, 200, 100, 100);
  assert(topLeft.drawY === 0, 'focalY=0 keeps the top edge of the image in frame', topLeft);
  assert(bottomRight.drawY === -200, 'focalY=100 keeps the bottom edge of the image in frame', bottomRight);
}

function testCoverFitNoCropWhenAspectMatches() {
  console.log('\n=== computeCoverFit: no crop needed when the image aspect ratio already matches the box ===');
  const fit = computeCoverFit(800, 400, 400, 200, 50, 50);
  assert(fit.drawX === 0 && fit.drawY === 0, 'zero offset in both axes when the box is an exact scaled match', fit);
  assert(fit.drawWidth === 400 && fit.drawHeight === 200, 'scales down exactly to the box size', fit);
}

async function main() {
  testNoEmphasisPhrase();
  testSimpleTrailingPhrase();
  testCaseInsensitiveMatch();
  testPhraseNotFound();
  testWholeWordNeverSplit();
  testEmptyHeadline();
  testMultiWordPhraseInMiddle();
  testCoverFitCenteredSquareIntoLandscape();
  testCoverFitFocalPointExtremes();
  testCoverFitNoCropWhenAspectMatches();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
