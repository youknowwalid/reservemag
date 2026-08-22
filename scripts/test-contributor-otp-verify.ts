// Deterministic, network/DOM-free tests for verifySignupOtp
// (src/lib/otpVerification.ts) -- the 6-digit-code verification logic
// behind contributorAuth.ts's verifyContributorSignupOtp(), which
// replaced the old click-a-link flow on ContributorVerifyEmailPage. Run
// with `npm run test:contributor-otp-verify`.
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

import { verifySignupOtp, type VerifyOtpFn } from '../src/lib/otpVerification';

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
  console.log('\n=== verifySignupOtp: success path calls Supabase with type "signup" and resolves ===');
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

async function main() {
  await testSuccessPathPassesCorrectTypeAndResolves();
  await testInvalidCodePathThrowsSupabaseError();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
