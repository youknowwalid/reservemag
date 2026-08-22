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

/**
 * Verifies the 6-digit signup confirmation code against Supabase Auth via
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
