-- Editorial Factory production incident fix (2026-08-26).
--
-- 1) Fixes schema drift between src/services/editorial/editorialTypes.ts's
--    EditorialErrorCategory union and the live CHECK constraint on
--    editorial_generations.error_category. Confirmed via a real production
--    write failure (Postgres error 23514, "violates check constraint
--    editorial_generations_error_category_check") on 2026-08-19, when a
--    genuine CONFIGURATION_ERROR (missing TABITOKEN_API_KEY) could not be
--    persisted because the live constraint predates that category being
--    added to the application. The effect: a failed generation's terminal
--    state silently failed to save, leaving "Editorial Factory history"
--    unable to explain what happened -- exactly the diagnosability gap
--    this fix (and the new columns below) addresses.
--
--    Rebuilt with the full, current set of categories the application
--    actually emits (see EditorialErrorCategory), so no category the code
--    can produce is ever rejected by this constraint again.
--
-- 2) Adds nullable per-phase observability columns used by the new
--    asynchronous worker architecture (server.ts's /_worker route) so a
--    generation that never reaches a terminal state -- e.g. the platform
--    kills the function mid-request -- still leaves a diagnosable partial
--    trail (which phase it reached, and when) instead of a silent gap.
--
-- This repository has no automated migration runner wired to the live
-- Supabase project (this table itself predates migration tracking; see
-- 0001_add_editorial_board_members.sql, the only other file in this
-- directory, which is unrelated). Apply this manually: paste into the
-- Supabase SQL editor for this project, or `supabase db push` if the CLI
-- is linked locally. Safe to run more than once (drop-if-exists /
-- add-column-if-not-exists throughout).

alter table editorial_generations
  drop constraint if exists editorial_generations_error_category_check;

alter table editorial_generations
  add constraint editorial_generations_error_category_check
  check (
    error_category is null or error_category in (
      'SOURCE_RETRIEVAL',
      'TIMEOUT',
      'AUTHENTICATION_ERROR',
      'ACCESS_DENIED',
      'INVALID_REQUEST',
      'MODEL_ERROR',
      'RATE_LIMIT',
      'PROVIDER_ERROR',
      'MALFORMED_RESPONSE',
      'CONFIGURATION_ERROR',
      'UNKNOWN',
      'VALIDATION_FAILED'
    )
  );

alter table editorial_generations
  add column if not exists source_retrieval_started_at timestamptz,
  add column if not exists source_retrieval_completed_at timestamptz,
  add column if not exists ai_request_started_at timestamptz,
  add column if not exists ai_request_completed_at timestamptz,
  add column if not exists provider_http_status integer,
  add column if not exists provider_error_code text;
