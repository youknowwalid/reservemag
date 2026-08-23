// Boots the real Express app (server.ts's createApp()) on an ephemeral
// local port and makes real HTTP requests against it, asserting on the
// actual response status code -- not client-rendered content. Run with
// `npm run test:server-routing`.
//
// This is the one test in this repo that deliberately DOES touch a
// listening server, because the bug it guards against (SEO-01: the
// server returning a real HTTP 404 for pages that ARE registered in the
// client-side router) can only be observed at the HTTP-status level.
// Every other script in scripts/ tests extracted, DOM/network-free logic
// on purpose -- this one exists because that approach cannot see what a
// crawler or link-preview bot actually receives.
//
// MUST run against a production build, not `npm run dev`: in dev mode,
// createApp() mounts Vite's own middleware with `appType: 'spa'`, which
// intercepts any unmatched HTML navigation with its own 200 SPA fallback
// BEFORE server.ts's catch-all route ever runs -- every route looks like
// it "passes" in dev mode regardless of whether the actual fix is
// correct. Run `npm run build` first; this script sets NODE_ENV=production
// (via a dynamic import, so it takes effect before server.ts's top-level
// `isProd` is evaluated) so createApp() skips Vite entirely and serves
// from dist/, exactly like the deployed Vercel function does.
//
// Article-slug SSR checks need a reachable Supabase project (same as
// `npm run dev`), so run this via `npm run test:server-routing`, which
// loads .env the same way `dev` does. If Supabase isn't reachable, the
// static-route and genuinely-unknown-route assertions still run (they
// don't depend on it) and only the article-SSR check is skipped with a
// clear message, rather than the whole run crashing.

import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'production';

const distIndexPath = path.resolve(process.cwd(), 'dist/index.html');
if (!fs.existsSync(distIndexPath)) {
  console.error(`Missing ${distIndexPath} -- run "npm run build" before "npm run test:server-routing".`);
  process.exit(1);
}

const { createApp } = await import('../server');
const { getPublishedArticleSlugsServer } = await import('../server-supabase');

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

// Every static page the fix in server.ts (KNOWN_STATIC_SLUGS) now
// recognizes -- mirrors src/App.tsx's <Route> list minus "/" and "/:slug"
// (already covered elsewhere) and minus /admin (already bypassed before
// this fix existed).
const STATIC_ROUTES_MUST_BE_200 = [
  '/privacy-policy',
  '/terms-of-service',
  '/legal',
  '/editorial-policy',
  '/advertising',
  '/editorial-board',
  '/contribute',
  '/get-featured',
];

// /archive is deliberately NOT in KNOWN_STATIC_SLUGS -- it isn't
// registered in src/App.tsx's router either (App.tsx's catch-all
// redirects it client-side to "/"), so it must keep 404ing server-side.
const GENUINELY_UNKNOWN_ROUTES = ['/archive', '/this-does-not-exist-xyz123'];

async function main() {
  const app = await createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind an ephemeral port for the test server.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    console.log('\n=== Homepage still returns 200 ===');
    const home = await fetch(`${baseUrl}/`);
    assert(home.status === 200, '"/" returns HTTP 200', home.status);

    console.log('\n=== Known static pages now return 200, not 404 (the actual bug fix) ===');
    for (const route of STATIC_ROUTES_MUST_BE_200) {
      const res = await fetch(`${baseUrl}${route}`);
      assert(res.status === 200, `${route} returns HTTP 200`, res.status);
      const body = await res.text();
      assert(!/Page Not Found/i.test(body), `${route} response body is not the "Page Not Found" template`, body.slice(0, 120));
    }

    console.log('\n=== Genuinely unrouted URLs still correctly 404 ===');
    for (const route of GENUINELY_UNKNOWN_ROUTES) {
      const res = await fetch(`${baseUrl}${route}`);
      assert(res.status === 404, `${route} still returns HTTP 404`, res.status);
    }

    console.log('\n=== Article-slug SSR is unaffected by the fix ===');
    const slugs = await getPublishedArticleSlugsServer();
    if (slugs.length === 0) {
      console.log('  SKIP -- no reachable Supabase project / no published articles; cannot verify article SSR from this environment.');
    } else {
      const slug = slugs[0];
      const res = await fetch(`${baseUrl}/${slug}`);
      assert(res.status === 200, `/${slug} (real article) returns HTTP 200`, res.status);
      const body = await res.text();
      assert(/<title>(?!THE RESERVE \| THE RESERVE)/i.test(body) && !/Page Not Found/i.test(body), `/${slug} renders real per-article metadata, not the generic/not-found title`, body.match(/<title>[^<]*<\/title>/)?.[0]);
    }

    console.log('\n=== sitemap.xml lists the same static pages the fix now serves ===');
    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
    assert(sitemapRes.status === 200, '/sitemap.xml returns HTTP 200', sitemapRes.status);
    const sitemapBody = await sitemapRes.text();
    for (const route of STATIC_ROUTES_MUST_BE_200) {
      assert(sitemapBody.includes(`<loc>`) && sitemapBody.includes(route), `sitemap.xml includes ${route}`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
