// Deterministic, network-free tests for the JWT-propagation fix: the
// editorial job-lock database writes must go through the SAME Supabase
// client that verifyAdminRequest() already authenticated as the caller,
// not a bare anon-key client (which has no auth.uid() and is always
// rejected by editorial_generations' is_admin()-gated RLS policy). Run
// with `npm run test:editorial-auth`.
//
// No real Supabase project, no real credentials, and NO Tabitoken/AI
// provider is touched anywhere in this file -- verifyAdminRequest's
// Supabase client is replaced with a fake via its `deps.createClient`
// injection point, and that same fake is what gets handed to
// createSupabaseEditorialJobLockStore(), so these tests prove the
// propagation *chain* end to end, not just each piece in isolation.
//
// Run via `npm run test:editorial-auth`, which loads .env for
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY -- verifyAdminRequest checks
// those are merely non-empty before doing anything else, but because the
// actual Supabase client is swapped for a fake below, their real values
// are never used to open a connection. The publishable anon key is
// public-safe by design (see .env.example) -- this is not the Tabitoken
// key and no AI credential is read anywhere in this file.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { verifyAdminRequest } from '../server-supabase';
import { createSupabaseEditorialJobLockStore, computeEditorialFingerprint } from '../src/services/editorial/editorialJobLock';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS -- ${label}`);
  } else {
    failed++;
    console.log(`  FAIL -- ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * A fake Postgres-backed table with exactly the semantics that matter for
 * these tests: one PENDING/RUNNING row per fingerprint at a time,
 * mirroring the real partial unique index (editorial_generations_active_
 * fingerprint_idx). A duplicate insert while a row is active returns a
 * Postgres-shaped 23505 error, same as the real database would.
 */
function createFakeEditorialTable() {
  const active = new Map<string, { id: string; status: 'PENDING' | 'RUNNING' }>();
  const updateLog: Array<{ id?: string; patch: Record<string, unknown> }> = [];
  let nextId = 1;

  return {
    active,
    updateLog,
    insert(row: Record<string, any>) {
      const fingerprint = row.request_fingerprint as string;
      return {
        select: () => ({
          single: async () => {
            if (active.has(fingerprint)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "editorial_generations_active_fingerprint_idx"' } };
            }
            const id = `row_${nextId++}`;
            active.set(fingerprint, { id, status: 'PENDING' });
            return { data: { id }, error: null };
          },
        }),
      };
    },
    update(patch: Record<string, any>) {
      // Filters accumulate as `.eq()` calls chain; the whole chain is
      // "thenable" so a bare `await update(patch).eq('id', val)` (as
      // markTerminal/updateProgress do) still works exactly like before,
      // while `.eq(...).eq(...).select('id').single()` (as the new
      // conditional markRunning does) is also supported, matching what
      // the real Supabase client accepts for both call shapes.
      const filters: Record<string, string> = {};
      const applyAndRespond = async () => {
        for (const [fingerprint, row] of active) {
          if (filters.id !== undefined && row.id !== filters.id) continue;
          if (filters.generation_status !== undefined && row.status !== filters.generation_status) continue;
          updateLog.push({ id: row.id, patch });
          if (patch.generation_status === 'RUNNING') row.status = 'RUNNING';
          else if (patch.generation_status) active.delete(fingerprint); // any other status is terminal -> frees the slot
          return { data: { id: row.id }, error: null };
        }
        return { data: null, error: { code: 'PGRST116', message: 'no rows matched the given filters' } };
      };
      const chain: any = {
        eq(col: string, val: string) {
          filters[col] = val;
          return chain;
        },
        in: () => chain,
        lt: async () => {
          updateLog.push({ patch });
          return { error: null };
        },
        select: () => ({ single: applyAndRespond }),
        then: (resolve: any, reject: any) => applyAndRespond().then((r) => resolve({ error: r.error }), reject),
      };
      return chain;
    },
  };
}

function buildFakeSupabaseClient(opts: {
  getUser: { data: { user: { id: string } | null }; error: unknown };
  isAdmin: { data: boolean | null; error: unknown };
  table: ReturnType<typeof createFakeEditorialTable>;
}) {
  return {
    auth: { getUser: async () => opts.getUser },
    rpc: async () => opts.isAdmin,
    from: (tableName: string) => {
      if (tableName !== 'editorial_generations') throw new Error(`Unexpected table in test fake: ${tableName}`);
      return opts.table;
    },
  } as any;
}

/** Matches verifyAdminRequest's `deps.createClient` signature -- returns the given fake regardless of URL/key/options. */
function fakeCreateClientFactory(client: any) {
  return (_url: string, _key: string, _options?: any) => client;
}

const baseInput = { sourceUrls: ['https://example.com/article'] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function test1UnauthenticatedRejected() {
  console.log('\n=== TEST 1: unauthenticated request -> 401 ===');
  const result = await verifyAdminRequest({ headers: {} });
  assert(result.ok === false, 'no Authorization header is rejected');
  assert(result.ok === false && result.status === 401, 'rejection is HTTP 401', result);
}

async function test2AuthenticatedNonAdminRejected() {
  console.log('\n=== TEST 2: authenticated non-admin -> 403 ===');
  const table = createFakeEditorialTable();
  const fakeClient = buildFakeSupabaseClient({
    getUser: { data: { user: { id: 'user_non_admin' } }, error: null },
    isAdmin: { data: false, error: null }, // valid session, but is_admin() returns false
    table,
  });

  const result = await verifyAdminRequest(
    { headers: { authorization: 'Bearer fake-non-admin-token' } },
    { createClient: fakeCreateClientFactory(fakeClient) },
  );
  assert(result.ok === false, 'authenticated non-admin is rejected');
  assert(result.ok === false && result.status === 403, 'rejection is HTTP 403 (RLS-equivalent denial)', result);

  // Also cover the invalid/expired-session branch while we're here.
  const expiredClient = buildFakeSupabaseClient({
    getUser: { data: { user: null }, error: { message: 'invalid token' } },
    isAdmin: { data: null, error: null },
    table: createFakeEditorialTable(),
  });
  const expiredResult = await verifyAdminRequest(
    { headers: { authorization: 'Bearer expired-token' } },
    { createClient: fakeCreateClientFactory(expiredClient) },
  );
  assert(expiredResult.ok === false && expiredResult.status === 401, 'invalid/expired token is rejected with 401', expiredResult);
}

async function test3AdminCanInsertPending() {
  console.log('\n=== TEST 3: authenticated admin -> PENDING job INSERT succeeds ===');
  const table = createFakeEditorialTable();
  const fakeClient = buildFakeSupabaseClient({
    getUser: { data: { user: { id: 'user_admin' } }, error: null },
    isAdmin: { data: true, error: null },
    table,
  });

  const auth = await verifyAdminRequest(
    { headers: { authorization: 'Bearer fake-admin-token' } },
    { createClient: fakeCreateClientFactory(fakeClient) },
  );
  assert(auth.ok === true, 'admin request is accepted', auth);
  assert(auth.ok === true && auth.client === fakeClient, 'the EXACT authenticated client instance is returned -- this is the propagation the fix relies on');

  if (auth.ok === false) return; // narrow for TS below; already failed the assertion above

  const store = createSupabaseEditorialJobLockStore(auth.client);
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, { source_urls: baseInput.sourceUrls, provider: 'tabitoken', requested_model: 'claude-opus-4-8-thinking' });
  assert(acquired.ok === true, 'PENDING row insert succeeds using the propagated authenticated client', acquired);
  assert(table.active.get(fingerprint)?.status === 'PENDING', 'the fake table actually recorded a PENDING row');

  return { store, fingerprint, id: acquired.ok ? acquired.id : null, table };
}

async function test4PendingToRunning() {
  console.log('\n=== TEST 4: PENDING -> RUNNING using the same authenticated context ===');
  const table = createFakeEditorialTable();
  const fakeClient = buildFakeSupabaseClient({
    getUser: { data: { user: { id: 'user_admin' } }, error: null },
    isAdmin: { data: true, error: null },
    table,
  });
  const auth = await verifyAdminRequest({ headers: { authorization: 'Bearer t' } }, { createClient: fakeCreateClientFactory(fakeClient) });
  if (auth.ok === false) {
    assert(false, 'setup: admin auth should succeed', auth);
    return;
  }
  const store = createSupabaseEditorialJobLockStore(auth.client);
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  if (!acquired.ok) {
    assert(false, 'setup: acquire should succeed');
    return;
  }
  await store.markRunning(acquired.id);
  assert(table.active.get(fingerprint)?.status === 'RUNNING', 'row transitioned from PENDING to RUNNING');

  await store.markTerminal(acquired.id, { generation_status: 'SUCCESS' });
  assert(!table.active.has(fingerprint), 'a terminal update frees the fingerprint slot');
}

async function test5DuplicateProtectionStillWorks() {
  console.log('\n=== TEST 5: duplicate PENDING/RUNNING protection still works (via the real 23505 handling path) ===');
  const table = createFakeEditorialTable();
  const fakeClient = buildFakeSupabaseClient({
    getUser: { data: { user: { id: 'user_admin' } }, error: null },
    isAdmin: { data: true, error: null },
    table,
  });
  const auth = await verifyAdminRequest({ headers: { authorization: 'Bearer t' } }, { createClient: fakeCreateClientFactory(fakeClient) });
  if (auth.ok === false) {
    assert(false, 'setup: admin auth should succeed');
    return;
  }
  const store = createSupabaseEditorialJobLockStore(auth.client);
  const fingerprint = computeEditorialFingerprint(baseInput);

  const first = await store.tryAcquire(fingerprint, {});
  assert(first.ok === true, 'first acquire succeeds');

  const duplicateWhilePending = await store.tryAcquire(fingerprint, {});
  assert(duplicateWhilePending.ok === false, 'duplicate acquire while PENDING is rejected (simulated 23505)');

  if (first.ok) await store.markRunning(first.id);
  const duplicateWhileRunning = await store.tryAcquire(fingerprint, {});
  assert(duplicateWhileRunning.ok === false, 'duplicate acquire while RUNNING is rejected (simulated 23505)');

  if (first.ok) await store.markTerminal(first.id, { generation_status: 'GENERATION_FAILED' });
  const afterTerminal = await store.tryAcquire(fingerprint, {});
  assert(afterTerminal.ok === true, 'a new acquire succeeds once the prior job reached a terminal state');
}

async function main() {
  await test1UnauthenticatedRejected();
  await test2AuthenticatedNonAdminRejected();
  await test3AdminCanInsertPending();
  await test4PendingToRunning();
  await test5DuplicateProtectionStillWorks();

  console.log('\n=== TEST 6 (schema check, not a mock -- see the final report for the live read-only verification result) ===');
  console.log('  Not run from this script: RLS enablement + policy definition were verified directly against the database via a read-only query, reported separately.');

  console.log('\n=== TEST 7: no Tabitoken/AI request made by this suite ===');
  const ownSource = fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8');
  const importsAiModule = /from ['"].*services\/ai['"]/.test(ownSource);
  assert(!importsAiModule, 'this test file does not import src/services/ai anywhere (verified by scanning its own source)');

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
