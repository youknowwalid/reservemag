// Deterministic, network/DOM-free tests for the "Become a Contributor"
// signup/profile-completion validation logic (src/lib/imageValidation.ts)
// and route-guard logic (src/lib/contributorRouting.ts). Run with
// `npm run test:contributor-signup`.
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
// The four resolve*Redirect functions ARE the actual route guards --
// ContributorSignupPage/ContributorVerifyEmailPage/ContributorProfilePage/
// ContributorProtectedRoute all call these directly rather than
// reimplementing the logic inline, so testing these functions IS testing
// the real enforcement, not an approximation of it. resolveProfilePageRedirect
// in particular is the fix for the bug this script was extended to cover:
// the profile-completion form must be unreachable (never returns null) for
// any state where emailConfirmed is false, regardless of how that state
// was reached (redirected here, or a direct URL hit) -- see
// testProfilePageBlocksUnverifiedAccount below.
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
import {
  resolveSignupPageRedirect,
  resolveVerifyEmailPageRedirect,
  resolveProfilePageRedirect,
  resolveDashboardGuardRedirect,
  type ContributorAuthState,
} from '../src/lib/contributorRouting';

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

// ---------------------------------------------------------------------------
// Route guards -- resolveProfilePageRedirect is the fix's core assertion
// ---------------------------------------------------------------------------

function state(overrides: Partial<ContributorAuthState>): ContributorAuthState {
  return { hasUser: false, emailConfirmed: false, hasContributor: false, isRemoved: false, ...overrides };
}

function testProfilePageBlocksUnverifiedAccount() {
  console.log('\n=== resolveProfilePageRedirect: an unconfirmed account can NEVER reach the profile form ===');
  // The exact bug: a session existing was previously enough. Assert it
  // is not, for every combination where emailConfirmed is false.
  const unverifiedNoContributor = resolveProfilePageRedirect(state({ hasUser: true, emailConfirmed: false, hasContributor: false }));
  assert(unverifiedNoContributor === '/contribute/verify-email', 'signed in, unverified, no profile yet -> sent to the verification gate, NOT the form', unverifiedNoContributor);

  const unverifiedSomehowHasContributor = resolveProfilePageRedirect(state({ hasUser: true, emailConfirmed: false, hasContributor: true }));
  assert(unverifiedSomehowHasContributor === '/contribute/verify-email', 'even if a contributor row somehow exists, an unconfirmed session is still sent to verification first, never the form', unverifiedSomehowHasContributor);

  const noSession = resolveProfilePageRedirect(state({ hasUser: false, emailConfirmed: false, hasContributor: false }));
  assert(noSession === '/contribute', 'no session at all -> sent to signup, not the form');
}

function testProfilePageAllowsVerifiedAccount() {
  console.log('\n=== resolveProfilePageRedirect: a verified account WITH no profile yet reaches the form ===');
  const verifiedNoContributor = resolveProfilePageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: false }));
  assert(verifiedNoContributor === null, 'verified + no contributor row -> null (render the form) -- this is the only state that does', verifiedNoContributor);
}

function testProfilePageRedirectsCompletedProfile() {
  console.log('\n=== resolveProfilePageRedirect: a verified account that already completed their profile skips the form ===');
  const alreadyDone = resolveProfilePageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: true }));
  assert(alreadyDone === '/contribute/dashboard', 'verified + contributor row already exists -> straight to the dashboard, not back through the form', alreadyDone);
}

function testSignupPageRedirect() {
  console.log('\n=== resolveSignupPageRedirect: routes a signed-in visitor to wherever they actually belong ===');
  assert(resolveSignupPageRedirect(state({ hasUser: false })) === null, 'no session -> null (show the signup form)');
  assert(resolveSignupPageRedirect(state({ hasUser: true, emailConfirmed: false })) === '/contribute/verify-email', 'signed in but unverified -> verification gate, not the profile form', resolveSignupPageRedirect(state({ hasUser: true, emailConfirmed: false })));
  assert(resolveSignupPageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: false })) === '/contribute/profile', 'verified, no profile yet -> profile form');
  assert(resolveSignupPageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: true })) === '/contribute/dashboard', 'fully set up -> dashboard');
}

function testVerifyEmailPageRedirect() {
  console.log('\n=== resolveVerifyEmailPageRedirect: shows the gate exactly while unverified, handles the no-session-yet case ===');
  assert(resolveVerifyEmailPageRedirect(state({ hasUser: false }), false) === '/contribute', 'no session AND no pending email passed in -> back to signup (nothing to verify)');
  assert(resolveVerifyEmailPageRedirect(state({ hasUser: false }), true) === null, 'no session yet, but a pending email was passed from signup -> show the gate (this Supabase project may not issue a session before the link is clicked)');
  assert(resolveVerifyEmailPageRedirect(state({ hasUser: true, emailConfirmed: false }), false) === null, 'session exists but unconfirmed -> show the gate');
  assert(resolveVerifyEmailPageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: false }), false) === '/contribute/profile', 'just confirmed, no profile yet -> straight on to the profile form');
  assert(resolveVerifyEmailPageRedirect(state({ hasUser: true, hasContributor: true }), false) === '/contribute/dashboard', 'already fully set up -> dashboard');
}

function testDashboardGuardRedirect() {
  console.log('\n=== resolveDashboardGuardRedirect: dashboard requires both a session and a completed profile ===');
  assert(resolveDashboardGuardRedirect(state({ hasUser: false })) === '/contribute', 'no session -> signup');
  assert(resolveDashboardGuardRedirect(state({ hasUser: true, hasContributor: false })) === '/contribute/profile', 'session but no profile -> profile form (note: reaching the form from here still passes through resolveProfilePageRedirect\'s own emailConfirmed check)');
  assert(resolveDashboardGuardRedirect(state({ hasUser: true, hasContributor: true })) === null, 'session + completed profile -> null (render the dashboard)');
}

// ---------------------------------------------------------------------------
// isRemoved -- the admin "Delete User" tombstone gate. Added alongside
// the app-level access lock (expand_contributor_profile_and_removal_lock
// migration): every one of the four gates must send a removed
// contributor to '/contribute/removed' BEFORE any other check, the same
// way an unconfirmed account is bounced to the verification gate before
// ever reaching the profile form -- see contributorRouting.ts's header
// comment.
// ---------------------------------------------------------------------------

function testRemovedContributorNeverReachesAnyOtherGate() {
  console.log('\n=== isRemoved: every gate sends a removed contributor to /contribute/removed, ahead of every other check ===');

  const removedButOtherwiseFullyValid = state({ hasUser: true, emailConfirmed: true, hasContributor: true, isRemoved: true });

  assert(resolveSignupPageRedirect(removedButOtherwiseFullyValid) === '/contribute/removed', 'Step 1 (signup page): removed -> /contribute/removed, not the dashboard it would otherwise reach', resolveSignupPageRedirect(removedButOtherwiseFullyValid));
  assert(resolveVerifyEmailPageRedirect(removedButOtherwiseFullyValid, false) === '/contribute/removed', 'Step 2 (verify-email page): removed -> /contribute/removed', resolveVerifyEmailPageRedirect(removedButOtherwiseFullyValid, false));
  assert(resolveProfilePageRedirect(removedButOtherwiseFullyValid) === '/contribute/removed', 'Step 3 (profile page): removed -> /contribute/removed, not the dashboard', resolveProfilePageRedirect(removedButOtherwiseFullyValid));
  assert(resolveDashboardGuardRedirect(removedButOtherwiseFullyValid) === '/contribute/removed', 'Step 4 (dashboard guard): removed -> /contribute/removed, never renders the dashboard', resolveDashboardGuardRedirect(removedButOtherwiseFullyValid));

  // The edge case that matters most: removed AND unconfirmed at the same
  // time (shouldn't normally happen, but the gate must not let an
  // unlucky state combination land somewhere wrong) -- isRemoved must
  // still win over the emailConfirmed check.
  const removedAndUnconfirmed = state({ hasUser: true, emailConfirmed: false, hasContributor: true, isRemoved: true });
  assert(resolveProfilePageRedirect(removedAndUnconfirmed) === '/contribute/removed', 'removed wins over "unconfirmed" too -- never sent to the verification gate instead', resolveProfilePageRedirect(removedAndUnconfirmed));
}

function testNonRemovedContributorIsUnaffected() {
  console.log('\n=== isRemoved: false (the default/normal case) changes nothing about the existing gates ===');
  assert(resolveDashboardGuardRedirect(state({ hasUser: true, hasContributor: true, isRemoved: false })) === null, 'a normal, active contributor still reaches the dashboard', resolveDashboardGuardRedirect(state({ hasUser: true, hasContributor: true, isRemoved: false })));
  assert(resolveProfilePageRedirect(state({ hasUser: true, emailConfirmed: true, hasContributor: false, isRemoved: false })) === null, 'a normal, active, unverified-turned-verified contributor still reaches the profile form', undefined);
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
  testProfilePageBlocksUnverifiedAccount();
  testProfilePageAllowsVerifiedAccount();
  testProfilePageRedirectsCompletedProfile();
  testSignupPageRedirect();
  testVerifyEmailPageRedirect();
  testDashboardGuardRedirect();
  testRemovedContributorNeverReachesAnyOtherGate();
  testNonRemovedContributorIsUnaffected();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
