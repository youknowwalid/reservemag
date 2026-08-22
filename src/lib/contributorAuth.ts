import { supabase } from './supabase';
import { verifySignupOtp } from './otpVerification';

// "Become a Contributor" auth helpers -- deliberately a separate file
// from this one's admin equivalents (signInWithEmail,
// signInWithUsernamePassword) even though both ultimately call the same
// supabase.auth.* methods against the same Supabase Auth user pool.
// There's no way (or need) to run two separate Supabase Auth instances
// for one project; the actual separation this system needs is that a
// contributor session is NEVER treated as an admin session -- which is
// already true structurally: is_admin() (server-enforced via RLS, and
// mirrored client-side by SupabaseContext.tsx) only checks admin_users
// membership or the bootstrap owner email, neither of which a
// self-registered contributor can ever satisfy. See
// ContributorContext.tsx, which reads the `contributors` table instead
// of calling is_admin() at all, and never touches AdminPanel's
// ProtectedRoute.

/**
 * Email + password signup. The "Confirm signup" email template (Supabase
 * dashboard) has been customized to include `{{ .Token }}` -- Supabase's
 * built-in 6-digit OTP code -- rather than relying on the default
 * confirmation link. `emailRedirectTo` is still set (it's a required
 * option, and covers the case where the template also renders a link),
 * but the actual verification path is ContributorVerifyEmailPage's code
 * input calling verifyContributorSignupOtp() below, not a link click.
 *
 * Whether an active (but unconfirmed) session is issued immediately
 * after this call, before the link is even clicked, depends on this
 * Supabase project's "Confirm email" setting -- either way, forward
 * progress is gated on `emailConfirmed` (ContributorContext.tsx, derived
 * from `email_confirmed_at`), never on "a session merely exists". That
 * distinction was the actual bug this fixed: a session existing was
 * previously enough to reach the profile form, confirmed or not.
 */
export async function signUpContributor(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/contribute/verify-email` },
  });
  if (error) throw error;
}

/** Re-sends the signup confirmation email (now a 6-digit code -- see verifyContributorSignupOtp below) -- for ContributorVerifyEmailPage's "Resend" action, when the first email didn't arrive or expired. `type: 'signup'` re-triggers the SAME "Confirm signup" template as signUp() itself, so it carries the same `{{ .Token }}` code; no dashboard changes were needed to make resend produce a fresh code too. Works off the plain email string, no active session required (matters for the case where signUp() didn't issue one). */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/contribute/verify-email` },
  });
  if (error) throw error;
}

/**
 * Verifies the 6-digit code the user typed into ContributorVerifyEmailPage
 * against Supabase Auth, confirming the account signUpContributor() just
 * created. On success, Supabase Auth sets a confirmed session for `email`
 * as a side effect of this call; the caller is responsible for syncing
 * ContributorContext (e.g. via its `reloadSession`) before navigating
 * onward, since the context's own onAuthStateChange listener updates
 * asynchronously and isn't guaranteed to have run yet by the time this
 * promise resolves.
 *
 * Thin wrapper around otpVerification.ts's verifySignupOtp -- that's
 * where the actual `type: 'signup'` logic lives (and where it's tested,
 * per scripts/test-contributor-otp-verify.ts), kept in a file with no
 * import of ./supabase so it's testable outside a Vite runtime. This
 * wrapper is the only place that supplies the real
 * `supabase.auth.verifyOtp`.
 */
export async function verifyContributorSignupOtp(email: string, token: string): Promise<void> {
  return verifySignupOtp(supabase.auth.verifyOtp.bind(supabase.auth), email, token);
}

/** Returning-contributor sign-in (email + password they set at signup). */
export async function signInContributor(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * "Sign up with Google" -- requires the Google provider to be enabled
 * and configured (Client ID/Secret from a Google Cloud OAuth app) in the
 * Supabase dashboard under Authentication -> Providers -> Google. That's
 * an external, account-specific setup step only the project owner can
 * do (see the final report for exact instructions) -- this call will
 * fail with a clear Supabase error until that's done, not silently.
 */
export async function signInContributorWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/contribute/profile` },
  });
  if (error) throw error;
}
