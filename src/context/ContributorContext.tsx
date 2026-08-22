import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Contributor } from '../types';
import { contributorService } from '../services/contributorService';

// Contributor-facing session state -- deliberately its own context, not
// a field bolted onto SupabaseContext.tsx (the admin one). It reads the
// same underlying Supabase Auth session (there's only one Supabase Auth
// user pool per project), but never calls is_admin() and never feeds
// AdminPanel's ProtectedRoute. A signed-in contributor and a signed-in
// admin are simply two different `user.id`s as far as this app is
// concerned; nothing here grants admin access, and nothing in
// SupabaseContext.tsx grants contributor access.

interface ContributorContextType {
  user: User | null;
  /** Derived from user.email_confirmed_at -- the real signal, not "a session exists" (a session can exist for an unconfirmed account depending on this Supabase project's email-confirmation setting, which is exactly what let the profile form leak through before this was added). Step 2's gate (ContributorVerifyEmailPage) and Step 3's guard (ContributorProfilePage) both check this, not just `user`. */
  emailConfirmed: boolean;
  /** null until profile completion has happened -- see contributorService.completeProfile(). A non-null `user` with a null `contributor` means "signed up, profile not yet completed" (Step 3 gate -- Step 2, email verification, comes first). */
  contributor: Contributor | null;
  loading: boolean;
  /** Re-fetches `contributor` for the current user -- call right after completeProfile() succeeds, since Supabase Auth's own auth state doesn't change on that write (only the contributors table row does). */
  refreshContributor: () => Promise<void>;
  /** Re-reads the Supabase session from scratch -- used by ContributorVerifyEmailPage right after a successful verifyContributorSignupOtp() call, to make sure `user`/`emailConfirmed` are up to date in this context BEFORE it navigates to /contribute/profile, rather than racing the async onAuthStateChange listener below. */
  reloadSession: () => Promise<void>;
}

const ContributorContext = createContext<ContributorContextType>({
  user: null,
  emailConfirmed: false,
  contributor: null,
  loading: true,
  refreshContributor: async () => {},
  reloadSession: async () => {},
});

export const useContributor = () => useContext(ContributorContext);

export const ContributorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContributor = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    if (!nextUser) {
      setContributor(null);
      setLoading(false);
      return;
    }
    const profile = await contributorService.getOwnProfile(nextUser.id);
    setContributor(profile);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadContributor(session?.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      loadContributor(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadContributor]);

  const refreshContributor = useCallback(async () => {
    if (!user) return;
    const profile = await contributorService.getOwnProfile(user.id);
    setContributor(profile);
  }, [user]);

  const reloadSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadContributor(session?.user ?? null);
  }, [loadContributor]);

  const emailConfirmed = Boolean(user?.email_confirmed_at);

  return (
    <ContributorContext.Provider value={{ user, emailConfirmed, contributor, loading, refreshContributor, reloadSession }}>
      {children}
    </ContributorContext.Provider>
  );
};
