// Regression guard for unifying focal-point/crop positioning (X/Y/Zoom)
// across the four surfaces that need it: the Instagram Banner tool
// (shared by Editorial Factory and News Factory), the article editor's
// mobile hero image (previously X-only), and the article editor's desktop
// hero image (previously had NO positioning control at all). Run with
// `npm run test:focal-point-zoom`.
//
// Like scripts/test-quick-wins-audit.ts and
// scripts/test-hero-header-clearance.ts, this is a source-level check, not
// a re-verification of real rendered geometry -- this repo has no
// browser-automation devDependency. computeCoverFit's zoom arithmetic
// (the one piece of this that's genuinely pure/testable logic) has its own
// dynamic tests in scripts/test-news-banner-template.ts; this script
// exists so a later edit doesn't silently drop the zoom control from one
// of the four surfaces, or reintroduce the old bug where a single shared
// <img>/style let mobileCropX leak into the desktop crop.

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

/** Strips both /* ... *\/ block comments and // line comments -- several of these files' own explanatory comments quote the exact old markup/props being asserted on (e.g. "<picture><source>", "mobileCropX/Y/Zoom"), which would otherwise make a literal-string/regex check pass or fail on prose instead of code. Line-comment stripping is deliberately naive (no string-literal awareness) -- fine here since we only ever test for the ABSENCE of a marker string, and a false "still present" from a URL containing "//" would only make the check stricter, never silently pass a real regression. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function main() {
  const focalPointEditorSrc = read('src/components/admin/shared/FocalPointEditor.tsx');
  const bannerPanelSrc = read('src/components/admin/InstagramBannerPanel.tsx');
  const storiesSectionSrc = read('src/components/admin/StoriesSection.tsx');
  const articlePageSrc = read('src/pages/ArticlePage.tsx');
  const responsiveImageSrc = read('src/components/ui/ResponsiveImage.tsx');
  const rendererSrc = read('src/lib/instagramBannerRenderer.ts');
  const typesSrc = read('src/types.ts');
  const articleServiceSrc = read('src/services/articleService.ts');

  console.log('\n=== FocalPointEditor: zoom is an opt-in prop, not forced on every caller ===');
  assert(/onZoomChange\?:/.test(focalPointEditorSrc), 'onZoomChange is optional -- a caller that omits it gets no zoom control');
  assert(/const showZoom = onZoomChange !== undefined/.test(focalPointEditorSrc), 'the zoom UI only renders when a caller actually opts in');
  assert(/Reset Zoom/.test(focalPointEditorSrc), 'zoom has its own reset affordance, independent of "Reset to Center" (X/Y)');
  assert(/upscale the source photo/.test(focalPointEditorSrc), 'the soft native-resolution upscale warning is present');

  console.log('\n=== Instagram Banner tool (Editorial Factory + News Factory): one shared component, now wired for zoom ===');
  assert(
    !/defaultTemplate\s*=\s*['"](editorial|news)['"]/.test(bannerPanelSrc) || /defaultTemplate\?:\s*BannerTemplate/.test(bannerPanelSrc),
    'InstagramBannerPanel remains the single component both Factories mount (toggled by defaultTemplate/template), not two separate implementations',
  );
  assert(/zoom={zoom}/.test(bannerPanelSrc) && /onZoomChange={setZoom}/.test(bannerPanelSrc), 'the panel wires its zoom state into the shared FocalPointEditor');
  assert(/targetWidth=\{template === 'news' \? NEWS_PHOTO_BOX\.width : BANNER_WIDTH\}/.test(bannerPanelSrc), 'the upscale warning gets the correct fixed output size per template (banner canvas is a real pixel target, unlike the fluid article hero)');
  assert(/zoom\?: number;/.test(bannerPanelSrc), 'SavedBannerConfig.zoom is optional -- a banner saved before zoom existed still restores fine (falls back to 100)');

  console.log('\n=== instagramBannerRenderer.ts: zoom composes into the existing cover-fit math, backward-compatibly ===');
  assert(/zoomMultiplier\s*:\s*number\s*=\s*1/.test(rendererSrc), 'computeCoverFit defaults zoomMultiplier to 1 -- every pre-zoom call site (including the unit tests) is unaffected');
  assert(/Math\.max\(destW \/ imgW, destH \/ imgH\) \* zoomMultiplier/.test(rendererSrc), 'zoom multiplies the base cover-fit scale rather than replacing it');
  assert((rendererSrc.match(/computeCoverFit\([^)]*zoom \/ 100\)/g) || []).length === 2, 'both templates (editorial full-canvas photo, news boxed photo) pass params.zoom through -- exactly one computeCoverFit implementation, not a divergent copy per template', rendererSrc.match(/computeCoverFit\([^)]*\)/g));

  console.log('\n=== Article editor: Desktop Hero Image now has a positioning tool (previously had none) ===');
  // Match the whole <FocalPointEditor ... /> tag that contains this title,
  // not a fixed character window forward from the title string -- prop
  // order puts several props (x/y/onChange/zoom) BEFORE the title prop.
  const desktopBlockMatch = storiesSectionSrc.match(/<FocalPointEditor[\s\S]*?title="Desktop Hero Crop Position"[\s\S]*?\/>/);
  assert(!!desktopBlockMatch, '"Desktop Hero Crop Position" FocalPointEditor block exists in StoriesSection.tsx');
  assert(!!desktopBlockMatch && /aspectRatio="21\/9"/.test(desktopBlockMatch[0]), 'its preview frame uses 21/9 -- matching the live desktop hero crop (ArticlePage.tsx), not an arbitrary ratio', desktopBlockMatch?.[0]);
  assert(!!desktopBlockMatch && /desktopCropX/.test(desktopBlockMatch[0]) && /desktopCropY/.test(desktopBlockMatch[0]) && /desktopZoom/.test(desktopBlockMatch[0]), 'it reads/writes desktopCropX/Y/Zoom', desktopBlockMatch?.[0]);

  console.log('\n=== Article editor: Mobile Hero Crop Position extended from X-only to full X/Y/Zoom ===');
  const mobileBlockMatch = storiesSectionSrc.match(/<FocalPointEditor[\s\S]*?title="Mobile Hero Crop Position"[\s\S]*?\/>/);
  assert(!!mobileBlockMatch, '"Mobile Hero Crop Position" FocalPointEditor block exists');
  assert(!!mobileBlockMatch && /axis="both"/.test(mobileBlockMatch[0]), 'the mobile tool now runs in axis="both" mode (was axis="horizontal")', mobileBlockMatch?.[0]);
  assert(!!mobileBlockMatch && /mobileCropY/.test(mobileBlockMatch[0]) && /mobileZoom/.test(mobileBlockMatch[0]), 'it reads/writes mobileCropY/mobileZoom', mobileBlockMatch?.[0]);

  console.log('\n=== types.ts / articleService.ts: new fields plumbed end-to-end (model <-> DB row) ===');
  for (const field of ['mobileCropY', 'mobileZoom', 'desktopCropX', 'desktopCropY', 'desktopZoom']) {
    assert(new RegExp(`${field}\\?: number`).test(typesSrc), `Article.${field} is declared in types.ts`);
  }
  for (const [camel, snake] of [
    ['mobileCropY', 'mobile_crop_y'],
    ['mobileZoom', 'mobile_zoom'],
    ['desktopCropX', 'desktop_crop_x'],
    ['desktopCropY', 'desktop_crop_y'],
    ['desktopZoom', 'desktop_zoom'],
  ]) {
    assert(articleServiceSrc.includes(`row.${snake}`), `articleService.ts reads ${snake} off the DB row into ${camel}`);
    assert(articleServiceSrc.includes(`row.${snake} = article.${camel}`), `articleService.ts writes article.${camel} back to ${snake} on save`);
  }

  console.log('\n=== ArticlePage.tsx: desktop and mobile hero images are independently positioned (no more shared-<img> bleed) ===');
  assert(!/<picture/.test(stripComments(articlePageSrc)), 'the old single <picture><source> hero markup is gone from actual code (comments aside) -- desktop and mobile are now genuinely separate elements, not one <img> whose style had to serve both breakpoints');
  assert(/desktopCropX/.test(articlePageSrc) && /desktopCropY/.test(articlePageSrc) && /desktopZoom/.test(articlePageSrc), 'the desktop hero <img> reads desktopCropX/Y/Zoom');
  assert(/mobileCropX/.test(articlePageSrc) && /mobileCropY/.test(articlePageSrc) && /mobileZoom/.test(articlePageSrc), 'the mobile hero <img>(s) read mobileCropX/Y/Zoom');
  assert(/hidden md:block/.test(articlePageSrc) && /md:hidden/.test(articlePageSrc), 'desktop/mobile visibility is CSS-breakpoint-gated (hidden/md:block, block/md:hidden), each carrying its own independent transform');
  assert(/--hero-hover-zoom/.test(articlePageSrc), 'the pre-existing hover-zoom effect (group-hover:scale-105) is preserved by composing with the configured zoom via a CSS custom property, rather than a literal inline transform silently overriding it');

  console.log('\n=== ResponsiveImage.tsx (homepage hero + every article card): same X/Y/Zoom fields applied, not left on the old mobileCropX-only path ===');
  assert(!/<picture/.test(stripComments(responsiveImageSrc)), 'ResponsiveImage no longer uses a single <picture><source> in actual code (comments aside) -- same independent-breakpoint split as the article hero');
  assert(/desktopCropX/.test(responsiveImageSrc) && /desktopZoom/.test(responsiveImageSrc), 'its default (desktop) image applies desktopCropX/Y/Zoom');
  assert(/mobileCropY/.test(responsiveImageSrc) && /mobileZoom/.test(responsiveImageSrc), 'its mobile-breakpoint image applies mobileCropX/Y/Zoom');

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
