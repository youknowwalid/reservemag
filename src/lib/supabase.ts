import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in your environment (see .env.example).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Bootstrap admin: matches the `is_admin()` Postgres function, which grants
// full access to this email even before any row exists in `admin_users`.
export const OWNER_EMAIL = 'walid.alpha101@gmail.com';

/**
 * Passwordless admin sign-in. Supabase emails the admin a magic link that
 * signs them straight into `/admin` -- no separate OAuth app to configure,
 * unlike the old Google sign-in flow.
 */
export const signInWithEmail = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/admin`,
    },
  });
  if (error) throw error;
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
