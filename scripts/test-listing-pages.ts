// Guards the wiring behind audit NAV-01 (nine dead "Explore All" buttons)
// and NAV-04 (dead "Digital Archive" footer link) now pointing at real
// destinations. Run with `npm run test:listing-pages`.
//
// Two things are checked here, deliberately not overlapping with
// test-server-routing.ts (which already proves the *destinations* work --
// real HTTP 200s for /category/<real-slug> and /archive, real 404 for a
// fake category): the slugify() function both the client (CategorySection,
// CategoryPage) and server (getCategoryByNameSlugServer) rely on to agree
// on the same URL for the same category name, and that the actual click
// targets (CategorySection's link, Footer's fallback URL, App.tsx's
// routes) are still wired to those destinations in source. This repo has
// no browser-automation devDependency (see test-hero-header-clearance.ts's
// header comment for why), so a real click-through was done manually this
// session instead and is reported in the fix's commit message, not
// re-derived here.

import fs from 'fs';
import path from 'path';
import { slugify } from '../src/lib/slug';

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

function main() {
  console.log('\n=== slugify() matches the real category names seen in production ===');
  const realCategoryNames = ['Business', 'Cinema', 'Culture', 'Fashion', 'Influence', 'Leadership', 'Luxury', 'Sports', 'Wellness'];
  const expectedSlugs = ['business', 'cinema', 'culture', 'fashion', 'influence', 'leadership', 'luxury', 'sports', 'wellness'];
  realCategoryNames.forEach((name, i) => {
    assert(slugify(name) === expectedSlugs[i], `slugify(${JSON.stringify(name)}) === ${JSON.stringify(expectedSlugs[i])}`, slugify(name));
  });

  console.log('\n=== slugify() handles punctuation/whitespace the same way category names actually contain it ===');
  // src/lib/slug.ts is a deliberate duplicate of articleService.generateSlug's
  // algorithm, not a shared import (see that file's header comment for
  // why) -- can't exercise the real articleService here since it drags
  // in lib/supabase.ts's import.meta.env access, which doesn't exist
  // under plain tsx (only under Vite). These are the same literal
  // expressions both functions are built from, checked directly here
  // instead.
  assert(slugify("Rasina Uberoi Bajaj's Case") === 'rasina-uberoi-bajajs-case', "apostrophes are dropped, not turned into a stray hyphen", slugify("Rasina Uberoi Bajaj's Case"));
  assert(slugify('Multiple   Spaces--Here') === 'multiple-spaces-here', 'runs of whitespace/hyphens collapse to one hyphen', slugify('Multiple   Spaces--Here'));
  assert(slugify('  Leading and trailing  ') === 'leading-and-trailing', 'leading/trailing hyphens are stripped', slugify('  Leading and trailing  '));

  console.log('\n=== CategorySection\'s "Explore All" is a real Link, not the old dead <button> ===');
  const categorySectionSrc = fs.readFileSync(path.resolve('src/components/CategorySection.tsx'), 'utf-8');
  assert(
    /<Link\s+to=\{`\/category\/\$\{slugify\(category\)\}`\}/.test(categorySectionSrc),
    '"Explore All" links to /category/${slugify(category)}',
  );
  assert(!/<button[^>]*>\s*Explore All/.test(categorySectionSrc), 'the old dead <button>Explore All</button> is gone');

  console.log('\n=== Footer\'s "Digital Archive" has a real fallback URL ===');
  const footerSrc = fs.readFileSync(path.resolve('src/components/Footer.tsx'), 'utf-8');
  assert(/'Digital Archive':\s*'\/archive'/.test(footerSrc), "FOOTER_LABEL_FALLBACK_URLS['Digital Archive'] === '/archive'");

  console.log('\n=== App.tsx registers both new routes ===');
  const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
  assert(appSrc.includes('path="/category/:categorySlug"') && appSrc.includes('element={<CategoryPage />}'), 'route registered: /category/:categorySlug -> CategoryPage');
  assert(appSrc.includes('path="/archive"') && appSrc.includes('element={<ArchivePage />}'), 'route registered: /archive -> ArchivePage');

  console.log('\n=== ArticleListing\'s <title>/meta are gated behind its own loading state ===');
  // Regression guard for the exact bug found and fixed this session:
  // App.tsx's GlobalMeta also renders a <Helmet><title>, and
  // react-helmet-async resolves conflicts by which Helmet instance most
  // recently committed, not tree position -- an unconditional Helmet
  // here mounts before GlobalMeta's async siteSettings fetch resolves on
  // a fresh navigation, and silently loses. Confirmed via document.title
  // polling across a real fresh load (see the fix's commit message);
  // this only guards the source-level fix from being quietly reverted.
  const listingSrc = fs.readFileSync(path.resolve('src/components/ArticleListing.tsx'), 'utf-8');
  assert(/\{!loading\s*&&\s*\(\s*<Helmet>/.test(listingSrc), '<Helmet> is only rendered once `!loading`');

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
