// Deterministic, network/DOM-free tests for the admin Authors-table row
// actions -- "Edit User" and "Delete User" -- backed by
// src/lib/contributorAdminActions.ts. Run with
// `npm run test:contributor-admin-actions`.
//
// Deliberately imports from contributorAdminActions.ts, NOT
// contributorService.ts: the latter imports src/lib/supabase.ts, which
// reads import.meta.env and crashes under plain tsx execution (same
// reason otpVerification.ts exists as its own file -- see that file's
// header comment, and scripts/test-contributor-otp-verify.ts's for the
// exact crash this avoids). contributorAdminActions.ts holds the real
// logic with no such import, so these tests exercise what
// contributorService.adminUpdateIdentity()/removeContributor() actually
// delegate to, not an approximation of it, with Supabase's `.update()`
// replaced by a fake that just records the call.
//
// The patch-shape assertions below are the actual proof for two claims
// from the brief:
//   1. "Edit User" is scoped to only name/photo/contact -- proven by
//      buildAdminIdentityEditPatch's output containing EXACTLY those
//      four columns, nothing from bio/category/city/country/
//      specialty_tags/social_media_urls.
//   2. "Delete User" preserves an already-published article's byline --
//      proven by buildContributorRemovalPatch's output touching only
//      status/email/phone_number (full_name is absent -- untouched, see
//      its own doc comment) and, just as importantly, by this file never
//      importing or referencing the `articles` table at all: there is no
//      code path here that could touch it. The complementary half of
//      this proof -- that a published article's `author` text is a
//      snapshot set once at publish time, independent of the contributor
//      row afterward -- is scripts/test-submission-review.ts's
//      testAuthorBylineIsASnapshotIndependentOfLaterContributorState.

import {
  adminUpdateContributorIdentity,
  removeContributorTombstone,
  buildAdminIdentityEditPatch,
  buildContributorRemovalPatch,
  type UpdateContributorFn,
  type AdminIdentityEditInput,
} from '../src/lib/contributorAdminActions';

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

/** Records every call made to it and returns whatever `result` says to. */
function fakeUpdate(result: { error: { message: string } | null }) {
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const fn: UpdateContributorFn = async (id, patch) => {
    calls.push({ id, patch });
    return result;
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// "Edit User" -- buildAdminIdentityEditPatch / adminUpdateContributorIdentity
// ---------------------------------------------------------------------------

function testEditPatchIsScopedToIdentityAndContactOnly() {
  console.log('\n=== buildAdminIdentityEditPatch: touches ONLY name/photo/email/phone -- never bio/category/location/tags/social links ===');
  const input: AdminIdentityEditInput = {
    fullName: 'Corrected Name',
    profilePhotoUrl: 'https://example.com/new-photo.jpg',
    email: 'corrected@example.com',
    phoneNumber: '+1-555-0199',
  };
  const patch = buildAdminIdentityEditPatch(input);

  assert(Object.keys(patch).sort().join(',') === 'email,full_name,phone_number,profile_photo_url', 'the patch has EXACTLY these four keys, nothing else', patch);
  assert(patch.full_name === 'Corrected Name', 'full_name maps from fullName', patch);
  assert(patch.profile_photo_url === 'https://example.com/new-photo.jpg', 'profile_photo_url maps from profilePhotoUrl', patch);
  assert(patch.email === 'corrected@example.com', 'email maps from email', patch);
  assert(patch.phone_number === '+1-555-0199', 'phone_number maps from phoneNumber', patch);
  assert(!('bio' in patch) && !('category' in patch) && !('city' in patch) && !('country' in patch) && !('specialty_tags' in patch) && !('social_media_urls' in patch), 'none of the contributor-self-service-only fields are present', patch);
}

async function testEditUserSuccessPathCallsUpdateOnceWithTheRightId() {
  console.log('\n=== adminUpdateContributorIdentity: success path updates exactly one row, by id, and resolves ===');
  const { fn, calls } = fakeUpdate({ error: null });
  const input: AdminIdentityEditInput = { fullName: 'Jane Fixed', profilePhotoUrl: 'https://example.com/p.jpg', email: 'jane@fixed.com', phoneNumber: '+1-555-0100' };

  let threw = false;
  try {
    await adminUpdateContributorIdentity(fn, 'contrib_42', input);
  } catch {
    threw = true;
  }

  assert(threw === false, 'resolves without throwing on success');
  assert(calls.length === 1, 'update is called exactly once', calls);
  assert(calls[0].id === 'contrib_42', 'the update targets exactly the given contributor id, not some other row', calls[0]);
}

async function testEditUserErrorPathThrows() {
  console.log('\n=== adminUpdateContributorIdentity: a Supabase error is thrown, not swallowed ===');
  const { fn } = fakeUpdate({ error: { message: 'permission denied for table contributors' } });
  let caught: any = null;
  try {
    await adminUpdateContributorIdentity(fn, 'contrib_42', { fullName: 'X', profilePhotoUrl: '', email: '', phoneNumber: '' });
  } catch (err) {
    caught = err;
  }
  assert(caught?.message === 'permission denied for table contributors', 'the thrown error carries the real Supabase/RLS error message', caught);
}

// ---------------------------------------------------------------------------
// "Delete User" -- buildContributorRemovalPatch / removeContributorTombstone
// ---------------------------------------------------------------------------

function testRemovalPatchIsScopedToStatusAndContactOnly() {
  console.log('\n=== buildContributorRemovalPatch: touches ONLY status/email/phone_number -- full_name (and everything else) is preserved ===');
  const patch = buildContributorRemovalPatch();

  assert(Object.keys(patch).sort().join(',') === 'email,phone_number,status', 'the patch has EXACTLY these three keys', patch);
  assert(patch.status === 'removed', 'status flips to \'removed\' -- the signal every contributorRouting.ts gate and the tightened RLS policies key off of', patch);
  assert(patch.email === null, 'email is cleared', patch);
  assert(patch.phone_number === null, 'phone_number is cleared', patch);
  assert(!('full_name' in patch), 'full_name is absent from the patch -- NOT cleared, so the admin Authors table can still show who this tombstoned row was', patch);
  assert(!('id' in patch) && !('auth_user_id' in patch), 'auth_user_id is never touched either -- its `unique` constraint is what stops a removed contributor from ever registering a second row', patch);
}

async function testDeleteUserSuccessPathCallsUpdateOnceWithTheRightId() {
  console.log('\n=== removeContributorTombstone: success path updates exactly one row, by id, and resolves ===');
  const { fn, calls } = fakeUpdate({ error: null });

  let threw = false;
  try {
    await removeContributorTombstone(fn, 'contrib_99');
  } catch {
    threw = true;
  }

  assert(threw === false, 'resolves without throwing on success');
  assert(calls.length === 1, 'update is called exactly once', calls);
  assert(calls[0].id === 'contrib_99', 'the update targets exactly the given contributor id', calls[0]);
  assert(JSON.stringify(calls[0].patch) === JSON.stringify(buildContributorRemovalPatch()), 'the exact same patch buildContributorRemovalPatch() produces is what actually gets sent', calls[0].patch);
}

async function testDeleteUserErrorPathThrows() {
  console.log('\n=== removeContributorTombstone: a Supabase error is thrown, not swallowed ===');
  const { fn } = fakeUpdate({ error: { message: 'row not found' } });
  let caught: any = null;
  try {
    await removeContributorTombstone(fn, 'contrib_missing');
  } catch (err) {
    caught = err;
  }
  assert(caught?.message === 'row not found', 'the thrown error carries the real Supabase error message', caught);
}

async function main() {
  testEditPatchIsScopedToIdentityAndContactOnly();
  await testEditUserSuccessPathCallsUpdateOnceWithTheRightId();
  await testEditUserErrorPathThrows();
  testRemovalPatchIsScopedToStatusAndContactOnly();
  await testDeleteUserSuccessPathCallsUpdateOnceWithTheRightId();
  await testDeleteUserErrorPathThrows();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
