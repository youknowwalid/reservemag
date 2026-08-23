// Deterministic, network/DOM-free tests for the "Sign Out" fix
// (src/lib/contributorSignOut.ts) and the site-header "Become a
// Contributor" auth-state gate (src/lib/contributorRouting.ts's
// shouldShowBecomeContributorCta). Run with `npm run test:contributor-sign-out`.
//
// Same reasoning as scripts/test-contributor-signup.ts: these are the
// exact functions the real components call (lib/supabase.ts's logout()
// wraps signOutEverywhere directly; Navbar.tsx calls
// shouldShowBecomeContributorCta directly), so testing them here IS
// testing the real fix, not an approximation of it. Neither touches
// Supabase, auth, or the network.

import { signOutEverywhere, type SignOutFn } from '../src/lib/contributorSignOut';
import { shouldShowBecomeContributorCta } from '../src/lib/contributorRouting';

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

// ---------------------------------------------------------------------------
// signOutEverywhere -- the actual Sign Out bug fix
// ---------------------------------------------------------------------------

async function testClearsLocalSessionOnSuccess() {
  console.log('\n=== signOutEverywhere: a successful signOut() still clears the local session ===');
  let cleared = false;
  const signOut: SignOutFn = async () => ({ error: null });
  await signOutEverywhere(signOut, () => { cleared = true; });
  assert(cleared, 'clearLocalSession was called after a successful signOut()');
}

async function testClearsLocalSessionWhenSignOutReturnsAnError() {
  console.log('\n=== signOutEverywhere: THE BUG -- signOut() resolving with an error must still clear the local session ===');
  // This mirrors supabase-js's real behavior: GoTrueClient#_signOut can
  // resolve with `{ error }` WITHOUT ever touching local storage, if its
  // internal session re-read fails for any reason other than "no session
  // at all" (corrupted/invalidated refresh token, a network failure,
  // etc.). The old `logout()` just did `if (error) throw error`, so nothing
  // downstream of that ever ran -- the local session was left exactly as
  // it was, and Sign Out visibly did nothing.
  let cleared = false;
  const signOut: SignOutFn = async () => ({ error: { message: 'Network request failed' } });
  await signOutEverywhere(signOut, () => { cleared = true; });
  assert(cleared, 'clearLocalSession was still called even though signOut() reported an error');
}

async function testClearsLocalSessionWhenSignOutThrows() {
  console.log('\n=== signOutEverywhere: a signOut() call that throws outright still clears the local session ===');
  let cleared = false;
  const signOut: SignOutFn = async () => { throw new Error('boom'); };
  await signOutEverywhere(signOut, () => { cleared = true; });
  assert(cleared, 'clearLocalSession was called even though signOut() threw');
}

async function testNeverThrows() {
  console.log('\n=== signOutEverywhere: never rejects, regardless of what signOut() does -- the caller\'s redirect must always run ===');
  const erroringSignOut: SignOutFn = async () => ({ error: { message: 'nope' } });
  const throwingSignOut: SignOutFn = async () => { throw new Error('nope'); };

  let threw = false;
  try {
    await signOutEverywhere(erroringSignOut, () => {});
  } catch {
    threw = true;
  }
  assert(!threw, 'an error result from signOut() does not propagate as a rejection');

  threw = false;
  try {
    await signOutEverywhere(throwingSignOut, () => {});
  } catch {
    threw = true;
  }
  assert(!threw, 'a thrown error from signOut() does not propagate as a rejection either');
}

// ---------------------------------------------------------------------------
// shouldShowBecomeContributorCta -- the header auth-state fix
// ---------------------------------------------------------------------------

function testHidesCtaForAnAuthenticatedContributor() {
  console.log('\n=== shouldShowBecomeContributorCta: hidden for an already-onboarded contributor ===');
  assert(shouldShowBecomeContributorCta(true) === false, 'hasContributor: true -> CTA hidden (they see the account menu instead)');
}

function testShowsCtaForALoggedOutVisitor() {
  console.log('\n=== shouldShowBecomeContributorCta: shown for a logged-out visitor, and for a visitor mid-signup ===');
  assert(shouldShowBecomeContributorCta(false) === true, 'hasContributor: false -> CTA shown (covers both no session at all, and a session that has not completed onboarding yet)');
}

async function main() {
  await testClearsLocalSessionOnSuccess();
  await testClearsLocalSessionWhenSignOutReturnsAnError();
  await testClearsLocalSessionWhenSignOutThrows();
  await testNeverThrows();
  testHidesCtaForAnAuthenticatedContributor();
  testShowsCtaForALoggedOutVisitor();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
