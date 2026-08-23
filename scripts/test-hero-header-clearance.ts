// Guards against the Hero/Navbar collision regressing (audit RESP-01 /
// RESP-02: the hero headline overlapping the fixed header at short
// viewports -- 320x568 portrait, and any phone-landscape width past the
// md: breakpoint such as 844x390). Run with `npm run test:hero-clearance`.
//
// This is NOT a re-verification of real pixel geometry -- this repo has
// no browser-automation tooling (no Playwright/Puppeteer devDependency;
// every other script here is deliberately DOM/network-free, see e.g.
// test-subject-segmentation-fallback.ts's header comment), and jsdom
// doesn't compute real CSS layout, so there is no dependency-free way to
// call getBoundingClientRect() on real rendered output from this script.
//
// The actual geometry verification for this fix was done with a live
// browser at all nine viewports the audit + follow-up asked for (320x568,
// 360x640, 390x844, 393x852, 412x915, and their landscape equivalents,
// plus 844x390) -- overlap == 0 at every one, reported in the fix's
// commit message and PR description, not re-derived here.
//
// What this script CAN check without a browser, and does: that the two
// mechanisms the fix depends on are actually present and wired correctly
// in source, and that Tailwind's build output actually places the
// short: breakpoint rules where the cascade needs them. Both are the
// kind of thing a well-meaning future edit could silently break (e.g.
// reverting Hero.tsx's min-height back to a fixed height, or a Tailwind
// config change reordering custom variants) without any visual diff
// tool catching it, since the failure mode is "collides only below
// ~480px viewport height," not something a standard-size dev screenshot
// would ever show.

import fs from 'fs';
import path from 'path';

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
  const navbarSrc = fs.readFileSync(path.resolve('src/components/Navbar.tsx'), 'utf-8');
  const heroSrc = fs.readFileSync(path.resolve('src/components/Hero.tsx'), 'utf-8');

  console.log('\n=== Navbar publishes its real rendered height as --header-height ===');
  assert(navbarSrc.includes("navRef.current"), 'Navbar measures its own <nav> via a ref, not a guessed constant');
  assert(
    /setProperty\(\s*['"]--header-height['"]/.test(navbarSrc),
    'Navbar publishes the measurement to a --header-height CSS custom property',
  );
  assert(
    /ResizeObserver/.test(navbarSrc),
    'the measurement re-runs on resize (the nav\'s height differs between the scrolled/unscrolled and mobile/desktop layouts)',
  );

  console.log('\n=== Hero reserves header clearance instead of a hardcoded offset ===');
  assert(
    heroSrc.includes('min-h-[90vh]') && heroSrc.includes('md:min-h-screen'),
    'the hero section uses min-height (can grow to fit content) rather than a fixed height (would force overlap when content needs more room)',
  );
  assert(
    !heroSrc.includes('"relative h-[90vh]'),
    'the old fixed-height className ("relative h-[90vh] md:h-screen ...") is gone, not left alongside the new one',
  );
  assert(
    heroSrc.includes('pt-[var(--header-height'),
    'the hero content block reserves top padding equal to the live --header-height value, guaranteeing content can never render above it',
  );

  console.log('\n=== Hero headline shrinks under short-viewport conditions, independent of width ===');
  for (const cls of ['short:text-3xl', 'short:md:text-4xl', 'short:lg:text-5xl']) {
    assert(heroSrc.includes(cls), `headline includes ${cls}`);
  }

  console.log('\n=== The "short" variant is defined and only fires below tablet/landscape-laptop height ===');
  const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf-8');
  const shortVariantMatch = indexCss.match(/@custom-variant\s+short\s*\(@media\s*\(max-height:\s*(\d+)px\)\)/);
  assert(Boolean(shortVariantMatch), '@custom-variant short is defined in src/index.css');
  if (shortVariantMatch) {
    const threshold = Number(shortVariantMatch[1]);
    assert(threshold >= 430 && threshold <= 540, `threshold (${threshold}px) sits above every landscape-phone height and below tablet/laptop landscape`, threshold);
  }

  console.log('\n=== Built CSS: short: rules exist and win the cascade over md:/lg: at equal specificity ===');
  const distCssDir = path.resolve('dist/assets');
  if (!fs.existsSync(distCssDir)) {
    console.log('  SKIP -- dist/assets not found; run "npm run build" first to check the compiled cascade order.');
  } else {
    const cssFile = fs.readdirSync(distCssDir).find((f) => f.endsWith('.css'));
    if (!cssFile) {
      console.log('  SKIP -- no .css file found in dist/assets.');
    } else {
      const css = fs.readFileSync(path.join(distCssDir, cssFile), 'utf-8');
      const mdIdx = css.indexOf('md\\:text-8xl');
      const lgIdx = css.indexOf('lg\\:text-9xl');
      const shortIdx = css.indexOf('short\\:text-3xl');
      const shortMdIdx = css.indexOf('short\\:md\\:text-4xl');
      const shortLgIdx = css.indexOf('short\\:lg\\:text-5xl');
      assert(mdIdx !== -1 && shortIdx !== -1, 'both md:text-8xl and short:text-3xl are present in the compiled stylesheet', { mdIdx, shortIdx });
      assert(shortIdx > mdIdx, 'short:text-3xl is placed AFTER md:text-8xl -- at equal specificity, the later rule wins when a viewport matches both', { mdIdx, shortIdx });
      assert(shortMdIdx > mdIdx, 'short:md:text-4xl (the combined short+md override) is placed after md:text-8xl', { mdIdx, shortMdIdx });
      assert(shortLgIdx > lgIdx || lgIdx === -1, 'short:lg:text-5xl is placed after lg:text-9xl', { lgIdx, shortLgIdx });
      assert(css.includes('max-height:480px') || css.includes('max-height: 480px'), 'the compiled stylesheet contains the max-height:480px media query');
    }
  }

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
