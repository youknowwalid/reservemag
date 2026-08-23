// Deterministic, network/DOM-free tests for verifySignupOtp and
// isValidOtpCode (src/lib/otpVerification.ts) -- the OTP verification
// call and length validation behind contributorAuth.ts's
// verifyContributorSignupOtp(), which replaced the old click-a-link flow
// on ContributorVerifyEmailPage. Run with
// `npm run test:contributor-otp-verify`.
//
// isValidOtpCode accepts any length in Supabase's documented 6-10 digit
// range, NOT a hardcoded 6 -- this project's own OTP Length dashboard
// setting has already been seen at both 6 and 8 (it defaults to one or
// the other depending on when the project was provisioned, and is
// changeable at any time), so the tests below exercise 6, 8, and 10
// digits as all equally valid, plus the out-of-range boundaries.
//
// Deliberately imports from otpVerification.ts, NOT contributorAuth.ts:
// contributorAuth.ts imports src/lib/supabase.ts, which reads
// import.meta.env -- a Vite-bundler-only global that is undefined under
// plain tsx execution, so importing it here would crash on module load
// before any test even runs (verified directly: `tsx
// scripts/test-contributor-otp-verify.ts` against contributorAuth.ts
// throws "Cannot read properties of undefined (reading
// 'VITE_SUPABASE_URL')" at src/lib/supabase.ts:3). otpVerification.ts
// exists specifically to hold this logic with no such import, exactly
// like contributorRouting.ts's resolve*Redirect functions (see
// scripts/test-contributor-signup.ts) -- these tests exercise the real
// logic verifyContributorSignupOtp() delegates to, not an approximation
// of it, with Supabase's `verifyOtp` replaced by a fake.

import { verifySignupOtp, isValidOtpCode, type VerifyOtpFn } from '../src/lib/otpVerification';

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
function fakeVerifyOtp(result: { error: { message: string } | null }) {
  const calls: Array<{ email: string; token: string; type: string }> = [];
  const fn: VerifyOtpFn = async (args) => {
    calls.push(args);
    return result;
  };
  return { fn, calls };
}

async function testSuccessPathPassesCorrectTypeAndResolves() {
  console.log('\n=== verifySignupOtp: success path calls Supabase with type "signup" and resolves, for a 6-digit code ===');
  const { fn, calls } = fakeVerifyOtp({ error: null });

  let threw = false;
  try {
    await verifySignupOtp(fn, 'writer@example.com', '123456');
  } catch {
    threw = true;
  }

  assert(threw === false, 'a correct code resolves without throwing');
  assert(calls.length === 1, 'Supabase verifyOtp is called exactly once', calls);
  const call = calls[0];
  assert(call.type === 'signup', 'the "type" argument is exactly "signup" -- NOT "email" or "magiclink"', call);
  assert(call.email === 'writer@example.com', 'the email passed through is the signup email, not something else', call);
  assert(call.token === '123456', 'the token passed through is exactly what the user typed', call);
}

async function testSuccessPathAlsoWorksForAnEightDigitCode() {
  console.log('\n=== verifySignupOtp: also succeeds for an 8-digit code -- this app never hardcodes the length ===');
  // This project's own Supabase "OTP Length" setting has been seen at 8
  // (its provisioning default) as well as 6 -- verifySignupOtp() itself
  // has no opinion on length at all, it just passes the token through.
  const { fn, calls } = fakeVerifyOtp({ error: null });

  let threw = false;
  try {
    await verifySignupOtp(fn, 'writer@example.com', '12345678');
  } catch {
    threw = true;
  }

  assert(threw === false, 'an 8-digit code resolves without throwing, same as a 6-digit one');
  assert(calls[0]?.token === '12345678', 'the full 8-digit token is passed through, not truncated to 6', calls[0]);
}

async function testInvalidCodePathThrowsSupabaseError() {
  console.log('\n=== verifySignupOtp: wrong/expired code rejects with the Supabase error message ===');
  const { fn } = fakeVerifyOtp({ error: { message: 'Token has expired or is invalid' } });

  let caught: any = null;
  try {
    await verifySignupOtp(fn, 'writer@example.com', '000000');
  } catch (err) {
    caught = err;
  }

  assert(caught !== null, 'an invalid code throws rather than resolving silently');
  assert(caught?.message === 'Token has expired or is invalid', "the thrown error carries Supabase's actual message, for the UI to show inline", caught);
}

function testIsValidOtpCodeAcceptsTheWholeSupabaseRange() {
  console.log('\n=== isValidOtpCode: accepts every length Supabase allows (6-10 digits), not just 6 ===');
  assert(isValidOtpCode('123456') === true, '6 digits is valid (this project\'s current OTP Length setting)');
  assert(isValidOtpCode('12345678') === true, '8 digits is valid (this project\'s OTP Length before it was changed)');
  assert(isValidOtpCode('1234567890') === true, '10 digits is valid (the top of Supabase\'s documented range)');
}

function testIsValidOtpCodeRejectsOutOfRangeOrNonNumeric() {
  console.log('\n=== isValidOtpCode: rejects codes outside Supabase\'s 6-10 digit range, and non-numeric input ===');
  assert(isValidOtpCode('12345') === false, '5 digits (one under the 6-digit floor) is rejected');
  assert(isValidOtpCode('12345678901') === false, '11 digits (one over the 10-digit ceiling) is rejected');
  assert(isValidOtpCode('') === false, 'an empty string is rejected');
  assert(isValidOtpCode('12a456') === false, 'a non-digit character is rejected even at a valid length');
}

async function main() {
  await testSuccessPathPassesCorrectTypeAndResolves();
  await testSuccessPathAlsoWorksForAnEightDigitCode();
  await testInvalidCodePathThrowsSupabaseError();
  testIsValidOtpCodeAcceptsTheWholeSupabaseRange();
  testIsValidOtpCodeRejectsOutOfRangeOrNonNumeric();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
