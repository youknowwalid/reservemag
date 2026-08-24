// Pure, dependency-injected core of the contributor signup OTP-verification
// call -- extracted out of contributorAuth.ts specifically so it has NO
// import of ./supabase (which reads import.meta.env, a Vite-bundler-only
// global that is undefined when a file is loaded outside a Vite bundle --
// e.g. by tsx-run test scripts, which crash on module load the instant
// they import anything that transitively imports supabase.ts). Mirrors
// contributorRouting.ts's resolve*Redirect functions: the real
// route/auth-flow logic, kept independently testable
// (scripts/test-contributor-otp-verify.ts) without a real Supabase
// project, network access, or a Vite runtime.

export interface VerifyOtpResult {
  error: { message: string } | null;
}

export type VerifyOtpFn = (args: { email: string; token: string; type: 'signup' }) => Promise<VerifyOtpResult>;

// Supabase's "OTP Length" project setting (Authentication -> Sign In /
// Providers -> Email -> OTP Settings) can be configured anywhere from 6
// to 10 digits, and differs by project (this one's default was 8 before
// being changed to 6). These bounds match Supabase's own documented
// constraint -- deliberately NOT a fixed length -- so this input keeps
// working if that dashboard setting is ever changed again later.
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

/** Whether `code` is a plausible OTP code -- all digits, within Supabase's allowed 6-10 digit length range. Used by ContributorVerifyEmailPage to validate before calling verifySignupOtp() and to enable/disable its Verify button. */
export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${OTP_MIN_LENGTH},${OTP_MAX_LENGTH}}$`).test(code);
}

/**
 * Verifies the signup confirmation OTP code (its length is a per-project
 * Supabase dashboard setting, 6-10 digits -- deliberately not hardcoded
 * anywhere in this app) against Supabase Auth via
 * the given `verifyOtp` function (production callers pass
 * `supabase.auth.verifyOtp`; tests pass a fake). `type: 'signup'` is
 * hardcoded here -- it is THE specific OTP type for confirming a
 * brand-new signUpContributor() account, not `'email'` (email-*change*
 * confirmation) or `'magiclink'` (passwordless sign-in for an account
 * that already exists), either of which Supabase rejects for a code
 * minted by the "Confirm signup" email template.
 */
export async function verifySignupOtp(verifyOtp: VerifyOtpFn, email: string, token: string): Promise<void> {
  const { error } = await verifyOtp({ email, token, type: 'signup' });
  if (error) throw new Error(error.message);
}

/**
 * Maps a raw Supabase OTP-verification error message to reader-facing copy
 * for ContributorVerifyEmailPage to display (audit STATE-02). Supabase's
 * own wording for a wrong or expired code -- "Token has expired or is
 * invalid" -- is API/developer language ("Token") that means nothing to a
 * contributor typing a code from an email; verifySignupOtp() above
 * deliberately still throws that raw message unchanged (see
 * scripts/test-contributor-otp-verify.ts), so the translation happens
 * here, at the one place it's actually shown to a reader. Anything that
 * isn't recognizably that specific error (e.g. a network failure) falls
 * back to a generic reader-facing message rather than ever surfacing
 * Supabase's raw string.
 */
export function describeOtpError(message: string | undefined): string {
  if (message && /token/i.test(message) && /(expired|invalid)/i.test(message)) {
    return "That code didn't match. Try again or resend.";
  }
  return 'Something went wrong verifying your code. Please try again.';
}
