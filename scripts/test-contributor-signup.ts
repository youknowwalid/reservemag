// Deterministic, network/DOM-free tests for the "Become a Contributor"
// signup/profile-completion validation logic (src/lib/imageValidation.ts).
// Run with `npm run test:contributor-signup`.
//
// Only the synchronous, DOM-free pieces are unit-tested here --
// validateFileType/validateFileSize/validateFileTypeAndSize (take a
// plain {size, type} object, not a real File) and isValidHttpUrl (plain
// string parsing via the URL global). validateImageResolution() needs a
// real Image()/URL.createObjectURL() to decode actual pixel dimensions,
// which requires a browser -- same category of limitation as
// instagramBannerRenderer.ts's canvas drawing (documented there and in
// scripts/test-news-banner-template.ts), exercised manually through the
// actual profile-photo upload form instead.
//
// Never touches Supabase, auth, or the network -- contributorService.ts
// and ContributorContext.tsx are thin wrappers around supabase-js calls
// with no independently-testable logic of their own beyond what RLS
// already enforces server-side (verified by inspection of the
// add_contributors migration, not re-tested here).

import {
  validateFileType,
  validateFileSize,
  validateFileTypeAndSize,
  isValidHttpUrl,
  CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES,
  CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH,
  CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT,
  type FileLike,
} from '../src/lib/imageValidation';

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

function fakeFile(overrides: Partial<FileLike>): FileLike {
  return { size: 1024, type: 'image/jpeg', ...overrides };
}

// ---------------------------------------------------------------------------
// validateFileType
// ---------------------------------------------------------------------------

function testFileTypeAccepted() {
  console.log('\n=== validateFileType: image/* is accepted ===');
  assert(validateFileType(fakeFile({ type: 'image/jpeg' })).ok === true, 'image/jpeg passes');
  assert(validateFileType(fakeFile({ type: 'image/png' })).ok === true, 'image/png passes');
  assert(validateFileType(fakeFile({ type: 'image/webp' })).ok === true, 'image/webp passes');
}

function testFileTypeRejected() {
  console.log('\n=== validateFileType: non-image is rejected with a specific reason ===');
  const result = validateFileType(fakeFile({ type: 'application/pdf' }));
  assert(result.ok === false, 'application/pdf is rejected', result);
  assert(result.ok === false && /image/i.test(result.reason), 'rejection reason mentions "image"', result);
}

// ---------------------------------------------------------------------------
// validateFileSize
// ---------------------------------------------------------------------------

function testFileSizeUnderLimit() {
  console.log('\n=== validateFileSize: under the limit passes ===');
  assert(validateFileSize(fakeFile({ size: 1024 }), CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES).ok === true, '1KB is well under the 5MB profile-photo cap');
}

function testFileSizeAtLimit() {
  console.log('\n=== validateFileSize: exactly at the limit passes (boundary is inclusive) ===');
  const maxBytes = 5 * 1024 * 1024;
  assert(validateFileSize(fakeFile({ size: maxBytes }), maxBytes).ok === true, 'a file exactly at maxBytes is not rejected');
}

function testFileSizeOverLimit() {
  console.log('\n=== validateFileSize: over the limit is rejected with the MB figure in the message ===');
  const maxBytes = 5 * 1024 * 1024;
  const result = validateFileSize(fakeFile({ size: maxBytes + 1 }), maxBytes);
  assert(result.ok === false, 'one byte over the limit is rejected', result);
  assert(result.ok === false && result.reason.includes('5MB'), 'rejection message states the limit in MB, not raw bytes', result);
}

function testFileSizeUsesExplicitLimit() {
  console.log('\n=== validateFileSize: uses the maxBytes argument, not a hidden default (this is the Stage-2-reuse contract) ===');
  const smallFile = fakeFile({ size: 3 * 1024 * 1024 }); // 3MB
  const passesAtProfileCap = validateFileSize(smallFile, CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES); // 5MB cap
  const failsAtHypotheticalContentCap = validateFileSize(smallFile, 2 * 1024 * 1024); // a stage-2-style 2MB cap
  assert(passesAtProfileCap.ok === true, '3MB passes under the 5MB profile-photo cap', passesAtProfileCap);
  assert(failsAtHypotheticalContentCap.ok === false, 'the SAME file fails under a stricter 2MB cap passed explicitly', failsAtHypotheticalContentCap);
}

// ---------------------------------------------------------------------------
// validateFileTypeAndSize (combined gate)
// ---------------------------------------------------------------------------

function testCombinedGateChecksTypeFirst() {
  console.log('\n=== validateFileTypeAndSize: type is checked before size ===');
  // A huge, wrong-type file should fail on TYPE, not report a size error.
  const result = validateFileTypeAndSize(fakeFile({ type: 'video/mp4', size: 50 * 1024 * 1024 }), CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES);
  assert(result.ok === false, 'a huge non-image file is rejected', result);
  assert(result.ok === false && /image/i.test(result.reason), 'the reported reason is the type error, not a size error', result);
}

function testCombinedGatePasses() {
  console.log('\n=== validateFileTypeAndSize: a valid image under the cap passes both checks ===');
  assert(validateFileTypeAndSize(fakeFile({ type: 'image/png', size: 2 * 1024 * 1024 }), CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES).ok === true, '2MB PNG passes');
}

// ---------------------------------------------------------------------------
// isValidHttpUrl (social media fields)
// ---------------------------------------------------------------------------

function testValidUrls() {
  console.log('\n=== isValidHttpUrl: well-formed http(s) URLs pass ===');
  assert(isValidHttpUrl('https://instagram.com/thereservemag'), 'https Instagram URL passes');
  assert(isValidHttpUrl('http://example.com'), 'plain http URL passes (not just https)');
  assert(isValidHttpUrl('  https://x.com/handle  '), 'surrounding whitespace is trimmed before validating');
}

function testInvalidUrls() {
  console.log('\n=== isValidHttpUrl: malformed or non-http values are rejected ===');
  assert(!isValidHttpUrl('@thereservemag'), 'a bare @handle (not a URL) is rejected');
  assert(!isValidHttpUrl('instagram.com/thereservemag'), 'a URL missing its protocol is rejected');
  assert(!isValidHttpUrl(''), 'an empty string is rejected');
  assert(!isValidHttpUrl('ftp://example.com/file'), 'a non-http(s) protocol is rejected');
  assert(!isValidHttpUrl('not a url at all'), 'plain text is rejected');
}

// ---------------------------------------------------------------------------
// Exported constants -- sanity
// ---------------------------------------------------------------------------

function testConstantsAreSane() {
  console.log('\n=== profile-photo limits are sane and more generous than a hypothetical 2MB content-photo cap ===');
  assert(CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES > 2 * 1024 * 1024, 'profile photo cap is larger than a 2MB content-photo cap, per the brief', CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES);
  assert(CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH > 0 && CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT > 0, 'minimum resolution floors are positive', {
    CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH,
    CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT,
  });
}

async function main() {
  testFileTypeAccepted();
  testFileTypeRejected();
  testFileSizeUnderLimit();
  testFileSizeAtLimit();
  testFileSizeOverLimit();
  testFileSizeUsesExplicitLimit();
  testCombinedGateChecksTypeFirst();
  testCombinedGatePasses();
  testValidUrls();
  testInvalidUrls();
  testConstantsAreSane();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
