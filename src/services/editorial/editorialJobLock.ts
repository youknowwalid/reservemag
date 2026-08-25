// Duplicate-submission protection for editorial generation. A generation
// job costs a real, billed Tabitoken request, so two concurrent/duplicate
// submissions for the same source URLs + parameters must not both reach
// the AI provider -- one has to be rejected before any AI call is made.
//
// This file defines the *contract* (`EditorialJobLockStore`) and a pure,
// dependency-free fingerprint function, plus an in-memory implementation
// used only by tests. The real, database-backed implementation
// (`createSupabaseEditorialJobLockStore`, below) enforces the lock with a
// Postgres partial unique index on `request_fingerprint` for
// PENDING/RUNNING rows -- an atomic "insert or fail" at the database
// level, not a check-then-insert race in application code. Both
// implementations satisfy the same interface, which is what lets
// scripts/test-editorial-cost-safety.ts exercise the locking *logic*
// without a real database or any network access.
//
// `createSupabaseEditorialJobLockStore` takes an already-authenticated
// `SupabaseClient` (from `verifyAdminRequest`'s result) rather than
// constructing its own -- `editorial_generations` is an `is_admin()`-gated
// table under RLS, and only a client carrying the caller's verified JWT
// can satisfy that policy. A bare anon-key client (e.g.
// `getServerSupabase()`) has no `auth.uid()` and every write would be
// rejected. See server-supabase.ts's `verifyAdminRequest` doc comment for
// the full reasoning.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EditorialJobLockInput {
  sourceUrls: string[];
  subject?: string;
  requestedAngle?: string;
  contentType?: string;
  /** Included in the fingerprint so the same source URLs can run once for Editorial Factory and once for News Factory without the second being rejected as a duplicate -- they're genuinely different desired outputs (different banner), not a retry of the same request. */
  bannerTemplate?: string;
}

/** Deterministic fingerprint for "is this the same generation request" -- order-insensitive on source URLs, case/whitespace-insensitive on every field. */
export function computeEditorialFingerprint(input: EditorialJobLockInput): string {
  const normalized = {
    sourceUrls: input.sourceUrls.map((u) => u.trim().toLowerCase()).sort(),
    subject: (input.subject || '').trim().toLowerCase(),
    requestedAngle: (input.requestedAngle || '').trim().toLowerCase(),
    contentType: (input.contentType || '').trim().toLowerCase(),
    bannerTemplate: (input.bannerTemplate || 'editorial').trim().toLowerCase(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export type AcquireResult = { ok: true; id: string } | { ok: false; reason: 'DUPLICATE_ACTIVE' };

export interface EditorialJobLockStore {
  /**
   * Atomically creates a PENDING lock row for `fingerprint` carrying
   * `row`, or returns `{ ok: false, reason: 'DUPLICATE_ACTIVE' }` if a
   * PENDING/RUNNING row for the same fingerprint already exists. No AI
   * call may be made unless this returns `ok: true`.
   */
  tryAcquire(fingerprint: string, row: Record<string, unknown>): Promise<AcquireResult>;
  /**
   * Transitions an acquired lock from PENDING to RUNNING (about to make
   * the AI request). Returns `{ claimed: false }` (instead of throwing)
   * if the row was not PENDING when this was called -- e.g. it was
   * already claimed by another invocation, or already reached a terminal
   * state. Callers MUST check `claimed` before making the AI request:
   * this is the guard that makes it safe for the background worker route
   * to be invoked more than once for the same job id (it never will be,
   * by construction -- see server.ts's trigger path -- but this makes
   * that guarantee load-bearing at the data layer, not just "this code
   * happens not to call it twice").
   */
  markRunning(id: string): Promise<{ claimed: boolean }>;
  /** Transitions an acquired lock to a terminal status, releasing the fingerprint for future requests. */
  markTerminal(id: string, patch: Record<string, unknown>): Promise<void>;
  /**
   * Best-effort, non-terminal partial update for observability checkpoints
   * (see EditorialGenerationProgressEvent) -- e.g. recording
   * `ai_request_started_at` the moment the Tabitoken call begins, well
   * before the generation reaches any terminal state. Must never throw in
   * a way that aborts the generation itself; callers treat failures here
   * as non-fatal and log-only.
   */
  updateProgress(id: string, patch: Record<string, unknown>): Promise<void>;
  /**
   * Best-effort cleanup: force-fails any PENDING/RUNNING row for
   * `fingerprint` older than `staleBeforeIso` so a crashed process
   * doesn't permanently block retrying the same generation. Called
   * before `tryAcquire` so a genuinely abandoned lock doesn't shadow a
   * legitimate new attempt, and also called opportunistically by the
   * status-polling route so a stuck job is reclaimed as soon as an admin
   * checks on it, not only on the next generation attempt.
   */
  reclaimStale(fingerprint: string, staleBeforeIso: string): Promise<void>;
}

interface InMemoryEntry {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'TERMINAL';
  createdAt: number;
  row: Record<string, unknown>;
}

/**
 * In-memory fake satisfying `EditorialJobLockStore`, for tests only.
 * Mirrors the database implementation's semantics (one active lock per
 * fingerprint) without touching Supabase or the network.
 */
export function createInMemoryJobLockStore(): EditorialJobLockStore {
  const entries = new Map<string, InMemoryEntry>();
  let nextId = 1;

  return {
    async tryAcquire(fingerprint, row) {
      const existing = entries.get(fingerprint);
      if (existing && existing.status !== 'TERMINAL') {
        return { ok: false, reason: 'DUPLICATE_ACTIVE' };
      }
      const id = `mem_${nextId++}`;
      entries.set(fingerprint, { id, status: 'PENDING', createdAt: Date.now(), row });
      return { ok: true, id };
    },
    async markRunning(id) {
      for (const entry of entries.values()) {
        if (entry.id === id) {
          if (entry.status !== 'PENDING') return { claimed: false };
          entry.status = 'RUNNING';
          return { claimed: true };
        }
      }
      return { claimed: false };
    },
    async markTerminal(id) {
      for (const entry of entries.values()) {
        if (entry.id === id) entry.status = 'TERMINAL';
      }
    },
    async updateProgress(id, patch) {
      for (const entry of entries.values()) {
        if (entry.id === id) Object.assign(entry.row, patch);
      }
    },
    async reclaimStale(fingerprint, staleBeforeIso) {
      const existing = entries.get(fingerprint);
      if (existing && existing.status !== 'TERMINAL' && existing.createdAt < Date.parse(staleBeforeIso)) {
        existing.status = 'TERMINAL';
      }
    },
  };
}

/**
 * Database-backed implementation, used in production. The lock itself is
 * enforced by a Postgres partial unique index on
 * `editorial_generations.request_fingerprint` (see the migration) --
 * `tryAcquire` relies on that constraint rejecting a duplicate INSERT
 * (error code 23505) rather than doing its own check-then-insert, which
 * would have a race window a database constraint doesn't.
 *
 * `client` must be the authenticated `SupabaseClient` returned by a
 * successful `verifyAdminRequest()` call for THIS request -- not
 * `getServerSupabase()`'s bare anon-key client. Construct one store per
 * request (after verifying the caller), not a module-level singleton;
 * each caller's client carries their own JWT.
 */
export function createSupabaseEditorialJobLockStore(client: SupabaseClient): EditorialJobLockStore {
  return {
    async tryAcquire(fingerprint, row) {
      const { data, error } = await client
        .from('editorial_generations')
        .insert({ ...row, request_fingerprint: fingerprint, generation_status: 'PENDING' })
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') return { ok: false, reason: 'DUPLICATE_ACTIVE' };
        throw error;
      }
      return { ok: true, id: (data as { id: string }).id };
    },
    async markRunning(id) {
      // Conditional on the row still being PENDING -- an ordinary UPDATE
      // by id alone would happily "succeed" even if the row had already
      // moved to RUNNING or a terminal status, which is exactly the
      // ambiguity this method's contract (see the interface doc comment)
      // exists to remove. `.select().single()` after the UPDATE reports
      // PostgREST's "no rows matched" as an error (PGRST116) rather than
      // silently returning no data, which is what lets this distinguish
      // "I just claimed it" from "someone/something already did".
      const { data, error } = await client
        .from('editorial_generations')
        .update({ generation_status: 'RUNNING' })
        .eq('id', id)
        .eq('generation_status', 'PENDING')
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === 'PGRST116') return { claimed: false };
        throw error;
      }
      return { claimed: Boolean(data) };
    },
    async markTerminal(id, patch) {
      const { error } = await client.from('editorial_generations').update(patch).eq('id', id);
      if (error) throw error;
    },
    async updateProgress(id, patch) {
      const { error } = await client.from('editorial_generations').update(patch).eq('id', id);
      if (error) throw error;
    },
    async reclaimStale(fingerprint, staleBeforeIso) {
      // Best-effort cleanup -- a failure here doesn't block tryAcquire,
      // which will surface its own error if the table is unreachable.
      await client
        .from('editorial_generations')
        .update({
          generation_status: 'GENERATION_FAILED',
          error_category: 'TIMEOUT',
          failure_reason: 'Abandoned: exceeded the expected generation window without completing (process likely crashed or restarted mid-run).',
        })
        .eq('request_fingerprint', fingerprint)
        .in('generation_status', ['PENDING', 'RUNNING'])
        .lt('created_at', staleBeforeIso);
    },
  };
}
