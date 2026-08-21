import { supabase } from './supabase';

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
 * Email + password signup. Supabase's default project settings send a
 * confirmation LINK (not an OTP code) to `email` -- this is "Supabase's
 * built-in email confirmation" as-is, with no dashboard changes needed.
 * `emailRedirectTo` points at the verify-email gate (Step 2), not
 * straight at profile completion (Step 3) -- clicking the link lands the
 * browser there with a freshly-confirmed session, and
 * ContributorVerifyEmailPage is what actually moves the contributor
 * forward once `user.email_confirmed_at` is set.
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

/** Re-sends the signup confirmation link -- for ContributorVerifyEmailPage's "Resend" action, when the first email didn't arrive or expired. Works off the plain email string, no active session required (matters for the case where signUp() didn't issue one). */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/contribute/verify-email` },
  });
  if (error) throw error;
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
