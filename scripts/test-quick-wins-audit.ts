// Regression guard for the 7 independent quick-win fixes from audit
// Section 25 + the RESP-01/RESP-02 follow-up (see the fix's commit
// message for the full list of audit IDs -- A11Y-02, CONT-01, CONS-01,
// STATE-02, CONT-02, NAV-02, A11Y-01, plus the unlabeled header-collision
// follow-up). Run with `npm run test:quick-wins-audit`.
//
// Like scripts/test-hero-header-clearance.ts, this is a source-level
// check, not a re-verification of real rendered geometry or runtime
// behavior -- this repo has no browser-automation devDependency. Every
// item here (44x44 hit area + aria-label, 16px inputs, shared read-time
// value, translated OTP error copy, placeholder tracking exemption,
// scroll-lock mechanism, single <h1> per page, the lg: header breakpoint)
// was additionally verified with a live browser during the fix -- real
// getBoundingClientRect()/getComputedStyle() reads at the actual
// viewports the audit named, reported in the fix's commit message --
// this script exists so a later edit that silently reverts one of these
// (e.g. a merge conflict resolving back to `md:absolute`, or a
// `text-sm` creeping back onto a signup input) fails CI instead of
// waiting for the next manual pass to notice.
//
// describeOtpError() (STATE-02) has its own dedicated, fully dynamic
// tests in scripts/test-contributor-otp-verify.ts -- not duplicated here.

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

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(relPath), 'utf-8');
}

/** Strips /* ... *\/ block comments before a source file is pattern-matched below -- several of these files' own explanatory comments quote the exact old/new strings being asserted on (e.g. "no longer hardcodes 8 Min Read"), which would otherwise make a literal-string check pass or fail on prose instead of code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function main() {
  const navbarSrc = read('src/components/Navbar.tsx');
  const heroSrc = read('src/components/Hero.tsx');
  const signupSrc = read('src/pages/contribute/ContributorSignupPage.tsx');
  const verifyEmailSrc = read('src/pages/contribute/ContributorVerifyEmailPage.tsx');
  const articlePageSrc = read('src/pages/ArticlePage.tsx');

  console.log('\n=== A11Y-02: mobile hamburger button has a 44x44px hit area and an accessible name ===');
  const hamburgerMatch = navbarSrc.match(/<button[^>]*onClick=\{\(\) => setIsMenuOpen\(true\)\}[^>]*md:hidden[^>]*>/s);
  assert(!!hamburgerMatch, 'the mobile-only hamburger <button> (md:hidden) is present in source');
  const hamburgerTag = hamburgerMatch?.[0] || '';
  assert(/aria-label="Open menu"/.test(hamburgerTag), 'it carries aria-label="Open menu" -- previously icon-only with no accessible name', hamburgerTag);
  assert(/\bw-11\b/.test(hamburgerTag) && /\bh-11\b/.test(hamburgerTag), 'it reserves a w-11 h-11 (44x44px) box -- previously ~30x30px (p-1.5/p-2 around an 18-20px icon)', hamburgerTag);

  console.log('\n=== CONT-01: /contribute signup email + password inputs are >=16px (no iOS Safari auto-zoom) ===');
  const emailInputMatch = signupSrc.match(/<input\s+type="email"[\s\S]*?\/>/);
  const passwordInputMatch = signupSrc.match(/<input\s+type="password"[\s\S]*?\/>/);
  assert(!!emailInputMatch && /\btext-base\b/.test(emailInputMatch[0]) && !/\btext-sm\b/.test(emailInputMatch[0]), 'the email input computes at text-base (16px), not text-sm (14px)', emailInputMatch?.[0]);
  assert(!!passwordInputMatch && /\btext-base\b/.test(passwordInputMatch[0]) && !/\btext-sm\b/.test(passwordInputMatch[0]), 'the password input computes at text-base (16px), not text-sm (14px)', passwordInputMatch?.[0]);

  console.log('\n=== CONS-01: article page read-time comes from the same article.readTime the homepage card reads, not a hardcoded literal ===');
  const articlePageCode = stripComments(articlePageSrc);
  assert(!/8 Min Read/.test(articlePageCode), 'the old hardcoded "8 Min Read" literal is gone from actual code (comments aside)');
  assert(/\{article\.readTime[^}]*\}\s*Read/.test(articlePageCode), 'the metadata row now interpolates article.readTime (the same field ArticleCard.tsx renders) instead of a literal', articlePageCode.match(/<span[^>]*>\{article\.readTime[\s\S]{0,20}/)?.[0]);

  console.log('\n=== CONT-02: OTP input\'s placeholder is exempted from the wide-tracking treatment applied to its typed value ===');
  const otpInputMatch = verifyEmailSrc.match(/<input[\s\S]*?placeholder="Verification code"[\s\S]*?\/>/);
  assert(!!otpInputMatch, 'the OTP <input> with placeholder="Verification code" is present in source');
  assert(!!otpInputMatch && /tracking-\[0\.5em\]/.test(otpInputMatch[0]), 'it still applies tracking-[0.5em] to the typed code itself (unchanged, intentional)', otpInputMatch?.[0]);
  assert(!!otpInputMatch && /placeholder:tracking-normal/.test(otpInputMatch[0]), 'it now also carries placeholder:tracking-normal, overriding that tracking specifically on the placeholder text', otpInputMatch?.[0]);

  console.log('\n=== NAV-02: mobile menu locks background scroll for the duration it is mounted, and restores it on close ===');
  assert(/document\.body\.style\.position = 'fixed'/.test(navbarSrc), 'opening the menu pins the body with position:fixed (locks both scroll axes, not just overflow-x)');
  assert(/document\.body\.style\.top = `-\$\{scrollY\}px`/.test(navbarSrc), 'the current scroll offset is preserved via a negative top offset, so the page does not visually jump');
  assert(/window\.scrollTo\(0, scrollY\)/.test(navbarSrc), 'closing the menu (the effect\'s cleanup) restores the exact scroll position');

  console.log('\n=== A11Y-01: exactly one <h1> per page -- the shared header\'s wordmark is no longer one ===');
  const navbarCode = stripComments(navbarSrc);
  assert(!/<h1[\s>]/.test(navbarCode), 'Navbar.tsx (rendered on every page) no longer contains an <h1> for the site wordmark, in actual code (comments aside)');
  assert(/<h1[\s>]/.test(stripComments(heroSrc)), 'Hero.tsx (the homepage\'s own primary heading) now carries the page\'s one <h1> -- without this, demoting the wordmark would leave the homepage with zero <h1>s instead of two');

  console.log('\n=== Header-collision follow-up: logo centering is deferred to the lg breakpoint (1024px), not md (768px) ===');
  assert(!/md:absolute md:left-1\/2/.test(navbarCode), 'the logo no longer becomes absolutely centered at md (768px) -- that was the same breakpoint step its font size jumped, which is what caused the ~768-900px overlap with "Become a Contributor"');
  assert(/lg:absolute lg:left-1\/2 lg:-translate-x-1\/2/.test(navbarCode), 'centering now activates at lg (1024px+), confirmed clean by a live-browser sweep from 768px to 1920px');

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
