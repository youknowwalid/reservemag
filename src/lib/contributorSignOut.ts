// Dependency-injected core of "Sign Out", extracted the same way
// contributorAdminActions.ts/otpVerification.ts are: no import of
// ./supabase, so it's directly testable outside a Vite runtime (see
// scripts/test-contributor-sign-out.ts).
//
// THE ACTUAL BUG this fixes: supabase-js's own GoTrueClient#signOut()
// only clears its local (localStorage-persisted) session AFTER it
// successfully re-reads the existing session first. If that internal
// read itself errors -- a corrupted or already-invalidated refresh
// token, a network failure reaching the Auth server, anything other than
// "no session at all" -- signOut() resolves with `{ error }` WITHOUT
// touching local storage at all, and the stale session survives. The
// dashboard's old click handler (`await logout(); navigate(...)`) had no
// error handling for that: the throw from `logout()` propagated as an
// unhandled promise rejection, the post-logout redirect never ran, and
// the contributor was left exactly where they started -- Sign Out
// visibly did nothing. This function guarantees the local session is
// gone and the caller can always proceed, regardless of whether the
// network round-trip to invalidate the session server-side succeeded.

export interface SignOutResult {
  error: { message: string } | null;
}

export type SignOutFn = () => Promise<SignOutResult>;

export async function signOutEverywhere(signOut: SignOutFn, clearLocalSession: () => void): Promise<void> {
  let signOutError: { message: string } | null = null;
  try {
    const { error } = await signOut();
    signOutError = error;
  } catch (error: any) {
    signOutError = { message: error?.message || String(error) };
  } finally {
    // Unconditional, not just in the error branch -- this function's
    // guarantee shouldn't quietly depend on signOut()'s own
    // undocumented, version-specific internal behavior.
    clearLocalSession();
  }
  if (signOutError) {
    // eslint-disable-next-line no-console
    console.error('supabase.auth.signOut() reported an error; the local session was force-cleared anyway so the app still ends up signed out.', signOutError);
  }
}
