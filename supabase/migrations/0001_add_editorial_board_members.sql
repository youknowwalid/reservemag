-- migration: add_editorial_board_members
--
-- Admin-managed, publicly readable list powering the /editorial-board
-- page's dynamic "Board Members" section (see
-- src/pages/EditorialBoardPage.tsx and
-- src/components/admin/EditorialBoardSection.tsx). This project has no
-- checked-in migrations directory yet -- every prior schema change
-- (add_contributors, add_submissions_and_notifications,
-- expand_contributor_profile_and_removal_lock, etc.) was applied
-- directly against the live Supabase project and is only referenced by
-- name in code comments. This file starts one, since a schema change
-- this significant deserves a durable, reviewable record; it does not
-- retroactively add files for the earlier migrations named above.
--
-- Apply this against the project referenced in MIGRATION_NOTES.md
-- (joqcgjpcvatnmjbzvhde) via the Supabase SQL editor, the Supabase CLI,
-- or the Supabase MCP connector once authorized -- the application code
-- that reads/writes this table (editorialBoardService.ts) degrades
-- gracefully (empty list, not a crash) until this has been run.
--
-- Public SELECT (no auth required) mirrors the existing pattern for
-- other admin-managed reference lists shown on the public site
-- (categories, video_interviews): this table has no draft/publish
-- state of its own -- the admin simply doesn't add a member until
-- they're ready to be public, the same way a new category or video
-- interview works today. All writes require is_admin(), the same
-- Postgres function every other admin-only RLS policy in this project
-- checks (see is_admin()'s own definition from the add_contributors-era
-- migrations for the exact bootstrap-owner-email-or-admin_users-row
-- logic it implements).

create table if not exists public.editorial_board_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  bio text not null default '',
  photo_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editorial_board_members_display_order_idx
  on public.editorial_board_members (display_order);

alter table public.editorial_board_members enable row level security;

create policy "editorial_board_members_public_read"
  on public.editorial_board_members
  for select
  using (true);

create policy "editorial_board_members_admin_insert"
  on public.editorial_board_members
  for insert
  with check (is_admin());

create policy "editorial_board_members_admin_update"
  on public.editorial_board_members
  for update
  using (is_admin())
  with check (is_admin());

create policy "editorial_board_members_admin_delete"
  on public.editorial_board_members
  for delete
  using (is_admin());
