import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

import { SiteSettings } from '../types';
import { settingsService } from '../services/settingsService';

interface SupabaseContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  siteSettings: SiteSettings | null;
}

const SupabaseContext = createContext<SupabaseContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  siteSettings: null,
});

export const useSupabase = () => useContext(SupabaseContext);

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    // Real-time listener: this forces the Navbar/Footer to update the second you hit Save in the Admin Panel.
    const unsubscribeSettings = settingsService.subscribeToSiteSettings((settings) => {
      setSiteSettings(settings);
    });

    return () => unsubscribeSettings();
  }, []);

  useEffect(() => {
    async function syncAdminFlag(nextUser: User | null) {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      // `is_admin()` is the exact same Postgres function RLS policies use,
      // so this stays perfectly in sync with what the database will
      // actually allow (bootstrap owner email, or a row in admin_users).
      const { data, error } = await supabase.rpc('is_admin');
      setIsAdmin(!error && data === true);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAdminFlag(session?.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAdminFlag(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider value={{ user, isAdmin, loading, siteSettings }}>
      {children}
    </SupabaseContext.Provider>
  );
};
