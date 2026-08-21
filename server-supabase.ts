// Shared server-side Supabase helpers for server.ts and social-ssr.ts.
//
// Both files are bundled independently by esbuild (see package.json's
// `build` script), so this module gets inlined into each bundle -- there's
// no runtime dependency between the two entry points.
//
// Unlike the old Firebase Admin setup, no service-role/service-account
// credential is required here: `articles` has a public "read regardless of
// status" RLS policy (matching the original Firestore rules' permissive
// `allow read: if true`), so the anon/publishable key is sufficient for
// these read-only SSR lookups.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IncomingHttpHeaders } from 'http';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;
let initError: Error | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    initError = new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) environment variables.',
    );
    return null;
  }
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

export function getServerSupabaseInitError(): string | null {
  return initError?.message ?? null;
}

// Adds camelCase aliases for the handful of snake_case columns the SSR
// templates read (publishDate, mobileImage, authorId, etc.), leaving the
// original snake_case keys in place too.
function rowToArticle(row: any): any {
  if (!row) return null;
  return {
    ...row,
    publishDate: row.publish_date,
    mobileImage: row.mobile_image,
    mobileCropX: row.mobile_crop_x,
    authorId: row.author_id,
    readTime: row.read_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getArticleBySlugServer(slug: string): Promise<any | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from('articles').select('*').eq('slug', slug).limit(1).maybeSingle();
    if (error) throw error;
    return rowToArticle(data);
  } catch (error) {
    console.error('[Supabase SSR] getArticleBySlugServer failed:', error);
    return null;
  }
}

export async function getPublishedArticleSlugsServer(): Promise<string[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.from('articles').select('slug').eq('status', 'published');
    if (error) throw error;
    return (data ?? [])
      .map((row: any) => row.slug)
      .filter((slug: unknown): slug is string => typeof slug === 'string' && slug.length > 0);
  } catch (error) {
    console.error('[Supabase SSR] getPublishedArticleSlugsServer failed:', error);
    return [];
  }
}

export async function insertArticleServer(row: Record<string, any>): Promise<{ id: string }> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error('Supabase is not configured on the server.');

  const { data, error } = await supabase.from('articles').insert(row).select('id').single();
  if (error) throw error;
  return data as { id: string };
}

export type AdminAuthResult =
  | { ok: true; userId: string; client: SupabaseClient }
  | { ok: false; status: number; error: string };

/**
 * Verifies that a request carries a valid Supabase session belonging to an
 * admin, for gating server-side admin-only actions (e.g. the AI connection
 * test, editorial generation). Reads the caller's access token from
 * `Authorization: Bearer <jwt>` and evaluates the same `is_admin()`
 * Postgres function the client uses (see SupabaseContext.tsx) against that
 * token, so this stays in sync with whatever RLS actually allows -- there
 * is no separate admin allowlist to drift out of sync.
 *
 * On success, the returned `client` is the SAME Supabase client instance
 * that just proved it belongs to an admin -- callers that need to write to
 * an `is_admin()`-gated table (e.g. editorial_generations) MUST reuse this
 * client rather than falling back to `getServerSupabase()`'s bare
 * anon-key client, which carries no caller JWT and will always see
 * `auth.uid() = NULL` under RLS. This is the fix for exactly that failure
 * mode: propagate the already-verified client instead of re-deriving auth
 * state, or silently dropping it, downstream.
 *
 * `deps.createClient` is injectable so tests can verify this function's
 * logic (token presence, getUser/is_admin sequencing, and -- the crucial
 * part -- that the exact injected client instance comes back out on
 * success) without a real Supabase project or network access. Production
 * callers should omit it.
 */
export async function verifyAdminRequest(
  req: { headers: IncomingHttpHeaders },
  deps: { createClient?: typeof createClient } = {},
): Promise<AdminAuthResult> {
  const createSupabaseClient = deps.createClient ?? createClient;

  const authHeader = req.headers['authorization'];
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice('Bearer '.length).trim() : null;
  if (!token) return { ok: false, status: 401, error: 'Missing admin session token.' };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: 'Supabase is not configured on the server.' };
  }

  // A request-scoped client, authenticated as the caller, so `is_admin()`
  // evaluates against their JWT -- never the anon role. This is the client
  // that must be reused for any subsequent database mutation this request
  // performs; see the doc comment above.
  const scopedClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await scopedClient.auth.getUser(token);
  if (userError || !userData?.user) return { ok: false, status: 401, error: 'Invalid or expired session.' };

  const { data: isAdminData, error: isAdminError } = await scopedClient.rpc('is_admin');
  if (isAdminError || isAdminData !== true) return { ok: false, status: 403, error: 'Admin privileges required.' };

  return { ok: true, userId: userData.user.id, client: scopedClient };
}

export type ContributorAuthResult =
  | { ok: true; userId: string; contributorId: string; client: SupabaseClient }
  | { ok: false; status: number; error: string };

/**
 * Verifies that a request carries a valid Supabase session belonging to
 * a REGISTERED contributor (a `contributors` row with a matching
 * auth_user_id) -- the contributor-side equivalent of verifyAdminRequest
 * above, for gating server-side contributor-only actions (submission
 * media upload). Deliberately a separate function, not a parameterized
 * version of verifyAdminRequest: this checks contributors table
 * membership, never is_admin(), so an admin session with no contributor
 * profile is correctly rejected here just like anyone else, and this
 * function can never be satisfied by any admin-side property. Same
 * client-reuse contract as verifyAdminRequest -- callers writing to a
 * contributor-scoped RLS table MUST reuse the returned `client`.
 */
export async function verifyContributorRequest(
  req: { headers: IncomingHttpHeaders },
  deps: { createClient?: typeof createClient } = {},
): Promise<ContributorAuthResult> {
  const createSupabaseClient = deps.createClient ?? createClient;

  const authHeader = req.headers['authorization'];
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice('Bearer '.length).trim() : null;
  if (!token) return { ok: false, status: 401, error: 'Missing session token.' };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: 'Supabase is not configured on the server.' };
  }

  const scopedClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await scopedClient.auth.getUser(token);
  if (userError || !userData?.user) return { ok: false, status: 401, error: 'Invalid or expired session.' };

  const { data: contributorRow, error: contributorError } = await scopedClient
    .from('contributors')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (contributorError || !contributorRow) return { ok: false, status: 403, error: 'A completed contributor profile is required.' };

  return { ok: true, userId: userData.user.id, contributorId: (contributorRow as { id: string }).id, client: scopedClient };
}
