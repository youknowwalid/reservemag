-- Unify hero-image positioning across the article editor and the
-- Instagram Banner tool (Editorial Factory / News Factory) with a shared
-- X/Y/Zoom focal-point control (see src/components/admin/shared/
-- FocalPointEditor.tsx).
--
-- articles.mobile_crop_x already existed (X-only, mobile hero image). This
-- adds:
--   - mobile_crop_y / mobile_zoom -- extends that same mobile control to
--     full X/Y/zoom.
--   - desktop_crop_x / desktop_crop_y / desktop_zoom -- entirely new: the
--     desktop/cinematic hero image previously had NO positioning control
--     at all (always rendered at a plain centered object-cover crop).
--
-- All six are nullable with defaults matching each field's actual prior
-- behavior (50 = centered, 100 = no zoom), so every already-published
-- article keeps rendering exactly as it does today -- `add column ...
-- default` backfills existing rows immediately, it does not leave them
-- NULL. instagram_banner_config (on both articles and
-- editorial_generations) is jsonb and needs no schema change -- its new
-- `zoom` key is handled entirely in application code (see
-- InstagramBannerPanel.tsx), the same way focalX/focalY already are.
--
-- This repository has no automated migration runner wired to the live
-- Supabase project (see 0002_fix_editorial_generations_schema.sql's doc
-- comment). Apply this manually: paste into the Supabase SQL editor for
-- this project, or `supabase db push` if the CLI is linked locally. Safe
-- to run more than once (add-column-if-not-exists throughout).

alter table articles
  add column if not exists mobile_crop_y numeric default 50,
  add column if not exists mobile_zoom numeric default 100,
  add column if not exists desktop_crop_x numeric default 50,
  add column if not exists desktop_crop_y numeric default 50,
  add column if not exists desktop_zoom numeric default 100;
