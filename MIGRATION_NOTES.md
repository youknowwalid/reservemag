# Firebase → Supabase Migration — Deploy Notes

This zip contains every file that changed to remove Firebase/Firestore/Firebase Auth
and replace it with Supabase (Postgres + Auth + Storage). It does **not** contain
the full repo — only changed and new files, with their paths preserved, so you can
drop them straight into your existing `youknowwalid/reservemag` checkout (or upload
each one via the GitHub web UI) without touching anything else.

## 1. Delete these files from the repo

They're Firebase-only and are no longer imported anywhere:

- `firebase-applet-config.json`
- `firebase-blueprint.json`
- `firestore.rules`
- `storage.rules`
- `src/context/FirebaseContext.tsx`
- `src/lib/firebase.ts`
- `src/lib/firebaseUtils.ts`

## 2. Set these Vercel environment variables

Add (Project Settings → Environment Variables, all environments):

```
VITE_SUPABASE_URL=https://joqcgjpcvatnmjbzvhde.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_0KeLp6MgaHjWOSx3ND9UKg_s_fvU6as
```

These are read by **both** the browser bundle (`import.meta.env.VITE_*`, via Vite)
and the Node server (`process.env.VITE_*`, in `server.ts` / `social-ssr.ts` /
`api/index.ts`) — no separate server-only key is needed. This is the public
anon/publishable key; it's safe to expose client-side, and every table's Row Level
Security policy already restricts what it can read/write server-side too.

Then remove the old Firebase variables, they're unused now:

```
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_PROJECT_ID
FIRESTORE_DATABASE_ID
```

(`GEMINI_API_KEY`, `GEMINI_MODEL`, `SITE_URL` stay exactly as they were.)

## 3. Admin login changed

The Google-popup sign-in is gone. `/admin/login` now sends a magic link by email
via Supabase Auth (`signInWithOtp`) — no OAuth app to configure. The bootstrap
owner account is still `walid.alpha101@gmail.com` (matches the `is_admin()`
Postgres function used by every RLS policy); any other email needs a row in the
`admin_users` table before it can sign in as an editor.

## 4. Data migration — still needs one action from you

The new Supabase project (`joqcgjpcvatnmjbzvhde`) has the full schema and security
policies applied, but it's **empty** — your existing Firestore content hasn't been
copied over yet.

I sent you a standalone tool earlier in this conversation
(`reservemag-export.html`) that runs entirely in your browser and reads your
existing Firestore data using your own network (this sandbox can't reach Firebase's
API directly). If you haven't run it yet:

1. Open that HTML file in your browser.
2. It'll connect to your Firebase project and export `articles`, `authors`,
   `categories`, `video_interviews`, `subscribers`, `featured_requests`, and
   `site_settings` to a downloadable JSON file.
3. Send that JSON file back in this conversation and I'll import it into Supabase,
   preserving IDs, slugs, and timestamps so nothing 404s.

Until that happens, the live site will render correctly (SSR, social previews,
admin panel) but with an empty article archive.

## 5. package.json dependency changes

- Removed: `firebase`, `firebase-admin`
- Added: `@supabase/supabase-js`

Your existing `npm install` step in Vercel's build will pick this up automatically
from the updated `package.json` in this zip — no manual action needed beyond
committing the new file.

## 6. What to review before merging

- `server-supabase.ts` is a **new** shared file — both `server.ts` and
  `social-ssr.ts` import from it for their Supabase article lookups. Make sure it
  lands in the repo root (same level as `server.ts`), not under `src/`.
- All admin-panel Firestore calls (categories, stories, authors, image uploads,
  bulk/spreadsheet import, AI content engine) now go through Supabase — RLS
  requires an authenticated session with `is_admin() = true`, exactly mirroring
  the old Firestore rules' intent.
- The "Restore Demo Content" button in the Overview tab was removed — the old
  Firestore-only demo-seeding function has no Supabase equivalent and wasn't part
  of the migration scope.
