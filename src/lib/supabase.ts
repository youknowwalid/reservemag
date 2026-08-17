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

// Username -> internal Supabase Auth email mapping for password-based admin
// sign-in. Supabase Auth is always email-based under the hood, so a plain
// "username" is mapped here to a synthetic, never-emailed address that the
// corresponding auth.users row was created with directly in the database.
const USERNAME_EMAIL_MAP: Record<string, string> = {
  walid: 'walid@reservemag.local',
};

/**
 * Username + password admin sign-in (in addition to the magic-link flow
 * above). Looks up the fixed internal email for the given username and
 * signs in with the password against Supabase Auth directly.
 */
export const signInWithUsernamePassword = async (username: string, password: string) => {
  const email = USERNAME_EMAIL_MAP[username.trim().toLowerCase()];
  if (!email) throw new Error('Unknown username.');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Incorrect username or password.');
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
