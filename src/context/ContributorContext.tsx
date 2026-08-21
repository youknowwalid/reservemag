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
  /** null until profile completion has happened -- see contributorService.completeProfile(). A non-null `user` with a null `contributor` means "signed up, profile not yet completed" (Step 2 gate). */
  contributor: Contributor | null;
  loading: boolean;
  /** Re-fetches `contributor` for the current user -- call right after completeProfile() succeeds, since Supabase Auth's own auth state doesn't change on that write (only the contributors table row does). */
  refreshContributor: () => Promise<void>;
}

const ContributorContext = createContext<ContributorContextType>({
  user: null,
  contributor: null,
  loading: true,
  refreshContributor: async () => {},
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

  return (
    <ContributorContext.Provider value={{ user, contributor, loading, refreshContributor }}>
      {children}
    </ContributorContext.Provider>
  );
};
