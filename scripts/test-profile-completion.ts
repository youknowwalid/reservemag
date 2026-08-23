// Deterministic, network/DOM-free tests for validateProfileCompletionInput
// (src/lib/profileValidation.ts) -- Step 3's expanded profile-completion
// form validation, specifically: every field is required together
// EXCEPT social links, which are now ALL optional (was: Instagram
// required, others optional). Run with
// `npm run test:profile-completion`.
//
// No DOM, no File objects, no Supabase -- profileValidation.ts only
// imports imageValidation.ts's isValidHttpUrl (pure string parsing) and
// SPECIALTY_TAGS from types.ts (a plain constant), neither of which
// touches ./supabase, so this is safe under the tsx test runner.

import { validateProfileCompletionInput, BIO_MAX_LENGTH, type ProfileCompletionFormInput } from '../src/lib/profileValidation';

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

function validInput(overrides: Partial<ProfileCompletionFormInput> = {}): ProfileCompletionFormInput {
  return {
    fullName: 'Jane Contributor',
    phoneNumber: '+1-555-0100',
    hasPhoto: true,
    bio: 'Culture writer covering fashion, film, and the occasional gallery opening.',
    city: 'London',
    country: 'United Kingdom',
    specialtyTags: ['Fashion', 'Culture'],
    socialMediaUrls: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The full-valid case, and the "social links optional" claim specifically
// ---------------------------------------------------------------------------

function testFullyValidInputWithNoSocialLinksPasses() {
  console.log('\n=== validateProfileCompletionInput: a complete profile with ZERO social links passes -- the core "all optional now" claim ===');
  const result = validateProfileCompletionInput(validInput({ socialMediaUrls: {} }));
  assert(result.ok === true, 'every field filled except social links -> ok', result);
}

function testAnySingleSocialLinkAloneIsFine() {
  console.log('\n=== validateProfileCompletionInput: any ONE social link alone (not just Instagram) is sufficient -- none is specially required ===');
  assert(validateProfileCompletionInput(validInput({ socialMediaUrls: { facebook: 'https://facebook.com/jane' } })).ok === true, 'Facebook alone passes, with Instagram absent', undefined);
  assert(validateProfileCompletionInput(validInput({ socialMediaUrls: { linkedin: 'https://linkedin.com/in/jane' } })).ok === true, 'LinkedIn alone passes', undefined);
  assert(validateProfileCompletionInput(validInput({ socialMediaUrls: { instagram: 'https://instagram.com/jane' } })).ok === true, 'Instagram alone still passes too (just no longer required)', undefined);
}

function testAllFiveSocialLinksTogetherIsFine() {
  console.log('\n=== validateProfileCompletionInput: all five social platforms filled in at once still passes ===');
  const result = validateProfileCompletionInput(
    validInput({
      socialMediaUrls: {
        instagram: 'https://instagram.com/jane',
        facebook: 'https://facebook.com/jane',
        linkedin: 'https://linkedin.com/in/jane',
        twitter: 'https://x.com/jane',
        website: 'https://jane.com',
      },
    }),
  );
  assert(result.ok === true, 'five valid URLs across all platforms -> ok', result);
}

function testAMalformedSocialLinkIsStillRejected() {
  console.log('\n=== validateProfileCompletionInput: a FILLED-IN social link still has to be a real URL -- "optional" is not "unvalidated" ===');
  const result = validateProfileCompletionInput(validInput({ socialMediaUrls: { facebook: 'not-a-url' } }));
  assert(result.ok === false, 'a malformed Facebook URL is rejected even though Facebook itself is optional', result);
  assert(result.ok === false && /Facebook/.test(result.reason), 'the rejection names the specific platform, not a generic message', result);
}

// ---------------------------------------------------------------------------
// Every OTHER field is still required
// ---------------------------------------------------------------------------

function testMissingFullNameOrPhoneIsRejected() {
  console.log('\n=== validateProfileCompletionInput: full name and phone number are still required ===');
  assert(validateProfileCompletionInput(validInput({ fullName: '' })).ok === false, 'empty full name is rejected');
  assert(validateProfileCompletionInput(validInput({ fullName: '   ' })).ok === false, 'whitespace-only full name is rejected');
  assert(validateProfileCompletionInput(validInput({ phoneNumber: '' })).ok === false, 'empty phone number is rejected');
}

function testMissingPhotoIsRejected() {
  console.log('\n=== validateProfileCompletionInput: a profile photo is still required ===');
  assert(validateProfileCompletionInput(validInput({ hasPhoto: false })).ok === false, 'hasPhoto: false is rejected');
}

function testBioIsRequiredAndCapped() {
  console.log(`\n=== validateProfileCompletionInput: bio is required, capped at ${BIO_MAX_LENGTH} characters ===`);
  assert(validateProfileCompletionInput(validInput({ bio: '' })).ok === false, 'empty bio is rejected');
  assert(validateProfileCompletionInput(validInput({ bio: '   ' })).ok === false, 'whitespace-only bio is rejected');
  assert(validateProfileCompletionInput(validInput({ bio: 'x'.repeat(BIO_MAX_LENGTH) })).ok === true, `exactly ${BIO_MAX_LENGTH} characters passes (boundary is inclusive)`);
  const overLong = validateProfileCompletionInput(validInput({ bio: 'x'.repeat(BIO_MAX_LENGTH + 1) }));
  assert(overLong.ok === false, `${BIO_MAX_LENGTH + 1} characters (one over) is rejected`, overLong);
  assert(overLong.ok === false && overLong.reason.includes(String(BIO_MAX_LENGTH)), 'the rejection message states the actual character limit', overLong);
}

function testCityAndCountryAreRequired() {
  console.log('\n=== validateProfileCompletionInput: city and country are required, separate fields (not one address field) ===');
  assert(validateProfileCompletionInput(validInput({ city: '' })).ok === false, 'empty city is rejected even with country filled');
  assert(validateProfileCompletionInput(validInput({ country: '' })).ok === false, 'empty country is rejected even with city filled');
}

function testSpecialtyTagsRequireAtLeastOneFromTheFixedSet() {
  console.log('\n=== validateProfileCompletionInput: at least one specialty tag is required, and must be from the fixed set ===');
  assert(validateProfileCompletionInput(validInput({ specialtyTags: [] })).ok === false, 'zero tags selected is rejected');
  assert(validateProfileCompletionInput(validInput({ specialtyTags: ['Fashion'] })).ok === true, 'exactly one valid tag is sufficient');
  assert(validateProfileCompletionInput(validInput({ specialtyTags: ['Fashion', 'Beauty', 'Travel'] })).ok === true, 'multiple tags (multi-select) pass together');
  const bogus = validateProfileCompletionInput(validInput({ specialtyTags: ['Fashion', 'NotARealTag'] }));
  assert(bogus.ok === false, 'a tag outside the fixed vocabulary is rejected -- this is a fixed selectable set, not free text', bogus);
}

async function main() {
  testFullyValidInputWithNoSocialLinksPasses();
  testAnySingleSocialLinkAloneIsFine();
  testAllFiveSocialLinksTogetherIsFine();
  testAMalformedSocialLinkIsStillRejected();
  testMissingFullNameOrPhoneIsRejected();
  testMissingPhotoIsRejected();
  testBioIsRequiredAndCapped();
  testCityAndCountryAreRequired();
  testSpecialtyTagsRequireAtLeastOneFromTheFixedSet();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
