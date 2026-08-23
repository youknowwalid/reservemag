// Pure route-guard decisions for the "Become a Contributor" flow --
// extracted from the four page/route-guard components that each used to
// inline this logic as JSX conditionals. Centralizing it here means:
//   1. All four gates agree on the exact same rules (no drift between,
//      say, ContributorProfilePage's guard and
//      ContributorProtectedRoute's guard).
//   2. It's directly unit-testable (scripts/test-contributor-signup.ts)
//      without rendering React or touching Supabase -- the actual bug
//      this stage fixed (the profile-completion route being reachable
//      for an unverified account) is a pure function of this state, and
//      is asserted against directly rather than only being implicit in
//      component behavior.
//
// `emailConfirmed` -- never "does a session merely exist" -- is the
// signal every gate past Step 1 checks. A session can exist for an
// unconfirmed account depending on this Supabase project's "Confirm
// email" setting; treating session-existence as "verified" was exactly
// the original bug.
//
// `isRemoved` (added alongside the admin "Delete User" action) is the
// SAME kind of real, not merely UI-hidden, gate: it mirrors the RLS
// write-lock added in the expand_contributor_profile_and_removal_lock
// migration (a removed contributor's own Supabase Auth session can still
// authenticate and can still read their own tombstoned row -- that part
// isn't revoked -- but every write-as-a-contributor policy now also
// requires status = 'active'). These four functions are the client-side
// mirror of that same boundary, so a removed contributor is bounced to
// '/contribute/removed' the instant their state is known, the same way
// an unconfirmed account is bounced to the verification gate rather than
// ever reaching the profile form.

export interface ContributorAuthState {
  hasUser: boolean;
  emailConfirmed: boolean;
  hasContributor: boolean;
  isRemoved: boolean;
}

export type ContributorRedirect =
  | '/contribute'
  | '/contribute/verify-email'
  | '/contribute/profile'
  | '/contribute/dashboard'
  | '/contribute/removed'
  | null;

/** Step 1 (ContributorSignupPage) -- redirects a caller who's already past this step to wherever they actually belong; `null` means "show the signup form" (only when there's no session at all). */
export function resolveSignupPageRedirect(state: ContributorAuthState): ContributorRedirect {
  if (!state.hasUser) return null;
  if (state.isRemoved) return '/contribute/removed';
  if (state.hasContributor) return '/contribute/dashboard';
  return state.emailConfirmed ? '/contribute/profile' : '/contribute/verify-email';
}

/** Step 2 (ContributorVerifyEmailPage). `hasPendingEmail` covers the case where signUp() didn't issue a session yet (this Supabase project's "Confirm email" setting) -- the page still has something to show/resend to even with `hasUser: false`. */
export function resolveVerifyEmailPageRedirect(state: ContributorAuthState, hasPendingEmail: boolean): ContributorRedirect {
  if (!state.hasUser && !hasPendingEmail) return '/contribute';
  if (state.isRemoved) return '/contribute/removed';
  if (state.hasUser && state.hasContributor) return '/contribute/dashboard';
  if (state.hasUser && state.emailConfirmed && !state.hasContributor) return '/contribute/profile';
  return null; // show the verification gate
}

/**
 * Step 3 (ContributorProfilePage) -- THE fix's core assertion:
 * profile-completion is reachable (returns null, meaning "render the
 * form") if and only if there's a session AND it's email-confirmed AND
 * no contributor row exists yet AND the contributor hasn't been removed.
 * An unconfirmed account is bounced to the verification gate regardless
 * of how it navigated here (a redirect from Step 1/2, or typing the URL
 * directly -- this function doesn't know or care which); a removed one
 * is bounced to '/contribute/removed' before that check even runs, so a
 * removed-then-somehow-still-unconfirmed edge case can never land on the
 * verification gate instead.
 */
export function resolveProfilePageRedirect(state: ContributorAuthState): ContributorRedirect {
  if (!state.hasUser) return '/contribute';
  if (state.isRemoved) return '/contribute/removed';
  if (!state.emailConfirmed) return '/contribute/verify-email';
  if (state.hasContributor) return '/contribute/dashboard';
  return null; // show the profile-completion form
}

/** Step 4 (ContributorProtectedRoute, guards /contribute/dashboard). */
export function resolveDashboardGuardRedirect(state: ContributorAuthState): ContributorRedirect {
  if (!state.hasUser) return '/contribute';
  if (state.isRemoved) return '/contribute/removed';
  if (!state.hasContributor) return '/contribute/profile';
  return null; // render the dashboard
}
