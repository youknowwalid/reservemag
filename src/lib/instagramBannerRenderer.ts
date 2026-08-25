// Instagram Banner Automation -- client-side (browser Canvas) renderer for
// THE RESERVE's banner templates. Runs entirely in the admin's browser: no
// new server dependency, no Vercel serverless-runtime risk (directly
// avoiding a repeat of the jsdom/ESM incident two prior passes had to
// fix). Fonts: Inter (already loaded site-wide, src/index.css) is used at
// its normal weights for the editorial template's kicker/subtitle/credit
// line, AND at a heavier 800 weight for the news template's headline;
// Bodoni Moda is loaded specifically here for the editorial masthead +
// headline -- see ensureBannerFontsStylesheetInjected() below. Both extra
// weights/families are loaded via one scoped Google Fonts request (not
// added to the global stylesheet) so they don't cost every page on the
// site a font request, only when the banner tool is actually used.
//
// TWO TEMPLATES, ONE RENDERER: `renderInstagramBanner()` dispatches on
// `params.template` ('editorial' | 'news', defaults to 'editorial') to
// renderEditorialTemplate() or renderNewsTemplate() below. They share the
// canvas setup, image/font loading, and the cover-fit crop math
// (computeCoverFit) -- only the actual layout/drawing differs per
// template. InstagramBannerPanel.tsx is still the only caller, and owns
// turning a generation's fields into these parameters for whichever
// template is active.
//
// EDITORIAL TEMPLATE -- FIXED, NOT A REDESIGN: every proportion, weight,
// and color below was measured directly off the approved reference banner
// files (colors via programmatic pixel sampling -- see the CREAM/GOLD doc
// comments below for exact source coordinates and sampled values) and is
// meant to stay fixed. Only the inputs (background image, kicker,
// subtitle, headline, credit line) are dynamic.
//
// Editorial reference layout (1080x1350, Instagram 4:5 portrait), top to bottom:
//   "THE" (small tracked label) -> "RESERVE" (huge Bodoni Moda wordmark)
//   kicker (tracked, gold)
//   subtitle, up to 2 lines (tracked, cream)
//   [photo fills the frame behind all of the above and below]
//   headline, auto-sized to fit up to 3 lines (huge Bodoni Moda, cream)
//   credit line, centered (small tracked, muted cream)
//   "R." logo mark, bottom-right -- a fixed raster asset
//   (public/assets/reserve-mark.png), drawn via drawImage, never redrawn
//   with text or shapes (the real mark is a circular badge with its own
//   metallic texture, embedded wordmark, and separate gold accent dot --
//   nothing a font could reproduce).
// A dark top-and-bottom gradient sits between the photo and the text so
// every line stays legible regardless of what's in the source image.
//
// NEWS TEMPLATE -- see its own section below for layout + the important
// PLACEHOLDER COLORS note (no reference image was available when this was
// built).

export const BANNER_WIDTH = 1080;
export const BANNER_HEIGHT = 1350;

export type BannerTemplate = 'editorial' | 'news';

const MARGIN = 64;

// Colors below were sampled programmatically from the two approved
// reference files (the full banner template and the logo mark), not
// eyeballed. Method: decode each file's actual pixel data, then take the
// per-channel median over a filtered region of each element -- filtering
// out anti-aliased edge pixels (e.g. "bright enough to be interior fill,
// not a partial-coverage edge pixel") so the result reflects each
// element's true flat fill color rather than an edge blend.
//   CREAM -- median of the "RESERVE" masthead's letter interiors
//     (reference banner, x:20-900 y:70-165, filtered to r,g,b>210/210/195)
//     => rgb(241,238,225) / #F1EEE1, cross-checked against the logo
//     mark's "R." letter interior (x:600-1300 y:600-1300, filtered
//     r,g,b>200) => rgb(241,242,235) / #F1F2EB. The two are within a few
//     values of each other; CREAM below is their average.
//   GOLD -- median of the "LUXE" kicker's letter interiors (reference
//     banner, x:150-600 y:280-335, filtered to isolate gold-toned
//     pixels) => rgb(191,160,118) / #BFA076. (The logo mark's separate
//     gold accent dot samples brighter, rgb(221,190,104) -- that pixel
//     data is now part of the raster asset itself, not a color this file
//     draws, so it isn't used here.)
// Old (eyeballed, pre-fix) values were CREAM #F5F1E8, GOLD #C9A668 -- both
// close, but not the reference's actual sampled values.
const CREAM = '#F1F0E6';
const GOLD = '#BFA076';

/** Sampled brand defaults for the editorial template's three color-pickable text elements (see the CREAM/GOLD doc comment above). Exported so InstagramBannerPanel.tsx's color pickers default to -- and "Reset to Auto" restores -- these exact values rather than a hardcoded duplicate. The masthead and logo are intentionally absent: the masthead stays auto-fixed to CREAM per the earlier decision, and the logo is a raster asset with no drawable color. */
export const EDITORIAL_DEFAULT_COLORS: Record<'kicker' | 'subtitle' | 'headline', string> = {
  kicker: GOLD,
  subtitle: CREAM,
  headline: CREAM,
};

const FONT_DISPLAY = 'Bodoni Moda'; // editorial masthead + headline only
const FONT_SANS = 'Inter'; // both templates -- editorial's kicker/subtitle/credit line at normal weights, news's headline at 800

const LOGO_ASSET_SRC = '/assets/reserve-mark.png';

/**
 * Manual per-element adjustment, layered on top of a template's auto
 * layout -- never a replacement for it. `fontSize` overrides the
 * element's auto-computed size; `offsetX`/`offsetY` are pixel deltas
 * applied on top of the auto-computed position, not absolute
 * coordinates, so "reset to auto" is simply omitting the override (or
 * setting all four back to undefined/0) rather than needing to know what
 * the auto position was. `color` works the same way -- undefined means
 * "use this element's sampled/brand default" (see
 * EDITORIAL_DEFAULT_COLORS / NEWS_DEFAULT_COLORS below).
 */
export interface ElementOverride {
  fontSize?: number;
  offsetX?: number;
  offsetY?: number;
  color?: string;
}

export interface InstagramBannerOverrides {
  /** Editorial only. */
  kicker?: ElementOverride;
  /** Editorial only. */
  subtitle?: ElementOverride;
  /** Both templates -- editorial's cover headline, or news's black headline (whose `color` sets the non-emphasized word color). */
  headline?: ElementOverride;
  /** Both templates -- editorial's bottom-right mark, or news's top-left lockup mark. Only fontSize/offsetX/offsetY are read (no color -- it's a raster asset). */
  logo?: ElementOverride;
  /** News only -- only `color` is read (the admin-selected emphasis phrase's color). Font size/position ride along with the headline's own run, since it's inline text within the same wrapped block, not a separately-positioned element. */
  emphasis?: ElementOverride;
}

export interface InstagramBannerParams {
  /** Which layout to draw. Defaults to 'editorial'. */
  template?: BannerTemplate;
  /** A same-origin-safe image URL -- an object URL from the image proxy, or a data: URL. Never draw a raw cross-origin source URL directly (canvas export would throw). */
  imageSrc: string;
  /** Editorial only. Short tracked label, e.g. "LUXE". */
  kicker: string;
  /** Editorial only. One or two lines, e.g. "THE HIGH JEWELRY ISSUE" / "PARIS COUTURE WEEK". A literal "\n" forces the line break; otherwise this wraps automatically at up to 2 lines. */
  subtitle: string;
  /** Both templates. The large headline -- editorial's cover headline, or news's black/red headline. Auto-sized to fit. */
  headline: string;
  /** Both templates. Editorial: small centered credit line (forced uppercase). News: small bottom-left source line, drawn exactly as typed -- see the news section below for why it's not forced/prefixed. */
  creditLine: string;
  /** News only. The exact substring of `headline` the admin wants rendered in red -- case-insensitive match, whole-word (never splits a word across two colors). Not found / empty => the whole headline draws in the base color. This is what makes the emphasis admin-controlled rather than a "last N words" heuristic -- see tokenizeWithEmphasis(). */
  emphasisPhrase?: string;
  /** News only. Which side the text column sits on -- 'text-left' (text column left, photo column right) or 'text-right' (mirrored). Defaults to 'text-left'. Only swaps the two content columns; the header (logo/URL/divider) and footer (source line) never move regardless of this setting. */
  newsLayout?: 'text-left' | 'text-right';
  /** Cover-fit focal point, 0-100 per axis (same semantics as CSS object-position -- 50/50 is centered, matching the article editor's crop tool). Defaults to 50/50 when omitted. */
  focalX?: number;
  focalY?: number;
  /** 100-200 (percent, same units as FocalPointEditor's zoom slider). Multiplies the cover-fit scale computed around focalX/focalY -- see computeCoverFit's zoomMultiplier param. Defaults to 100 (no zoom) when omitted. */
  zoom?: number;
  /** Manual per-element font-size/position/color adjustments -- see ElementOverride. Never applies to the editorial masthead, which stays auto-fixed. */
  overrides?: InstagramBannerOverrides;
  /**
   * Editorial only. Pre-computed subject cutout -- same pixel dimensions
   * as the original, unscaled background image -- composited on top of
   * the "RESERVE" masthead ONLY, using the identical cover-fit/focal-point
   * transform as the background photo (see subjectSegmentation.ts, which
   * produces this). Every other text layer is drawn AFTER the cutout and
   * always renders fully on top of it. This module never imports the
   * segmentation library itself -- that's loaded lazily by the caller
   * (InstagramBannerPanel.tsx) so it's never part of the site-wide
   * bundle. Optional; when omitted or null, the banner renders exactly as
   * before (photo fully behind every layer, including the masthead).
   */
  subjectCutout?: HTMLCanvasElement | null;
}

/** Loads an <img> from any URL (including a blob: object URL) -- exported so subjectSegmentation.ts's caller (InstagramBannerPanel.tsx) can load the same image for segmentation without duplicating this. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

const BANNER_FONTS_STYLESHEET_ID = 'reserve-banner-fonts';
// Bodoni Moda 800 (editorial masthead/headline) + Inter 800 (news
// headline) in one request -- Inter's normal weights are already loaded
// site-wide (src/index.css); this only adds the one heavier weight this
// module needs, scoped here rather than the global stylesheet so it's
// never fetched by pages that never open the banner tool.
const BANNER_FONTS_STYLESHEET_URL = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@800&family=Inter:wght@800&display=swap';

let bannerFontsStylesheetPromise: Promise<void> | null = null;

/**
 * Injects the banner-fonts Google Fonts stylesheet once (idempotent),
 * scoped to this module rather than added to src/index.css -- see this
 * file's header comment for why. `document.fonts.load()` can only
 * resolve a font whose @font-face rule is already registered in the
 * CSSOM, so this must complete (the <link> itself finish loading) before
 * ensureFontsReady() calls document.fonts.load() for these weights, or
 * those calls have nothing to resolve against yet.
 */
function ensureBannerFontsStylesheetInjected(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  const existing = document.getElementById(BANNER_FONTS_STYLESHEET_ID) as HTMLLinkElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }
  if (bannerFontsStylesheetPromise) return bannerFontsStylesheetPromise;

  bannerFontsStylesheetPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = BANNER_FONTS_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = BANNER_FONTS_STYLESHEET_URL;
    link.onload = () => {
      link.dataset.loaded = 'true';
      resolve();
    };
    // A blocked/failed font stylesheet request shouldn't hang banner
    // rendering forever -- fall through and let the explicit
    // document.fonts.check() below warn instead of silently retrying.
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return bannerFontsStylesheetPromise;
}

/**
 * Waits for the exact font weights either template draws with to be
 * ready, so canvas text never silently falls back to a system font
 * before the webfont finishes loading -- then explicitly *confirms* both
 * heavy weights actually loaded (document.fonts.check()), rather than
 * assuming the await above means it worked. A failed confirmation is
 * logged loudly: if fonts.googleapis.com is unreachable, the affected
 * text would otherwise silently render in a fallback/synthetic-bold face
 * with no visible error. Inter's own normal weights are already
 * confirmed-loaded site-wide, so a failed Inter 800 load still falls back
 * to a real (if lighter) Inter rather than a completely different font.
 */
async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;

  await ensureBannerFontsStylesheetInjected();
  await Promise.all([
    document.fonts.load(`800 100px "${FONT_DISPLAY}"`),
    document.fonts.load(`800 100px "${FONT_SANS}"`),
    document.fonts.load(`600 32px "${FONT_SANS}"`),
    document.fonts.load(`500 16px "${FONT_SANS}"`),
  ]);
  await document.fonts.ready;

  if (!document.fonts.check(`800 100px "${FONT_DISPLAY}"`)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Instagram Banner] "${FONT_DISPLAY}" did not report as loaded -- the editorial masthead/headline will likely render in a fallback serif instead. Check network access to fonts.googleapis.com.`,
    );
  }
  if (!document.fonts.check(`800 100px "${FONT_SANS}"`)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Instagram Banner] "${FONT_SANS}" at weight 800 did not report as loaded -- the news headline will likely render in a synthetically-bolded lighter weight instead. Check network access to fonts.googleapis.com.`,
    );
  }
}

/** Greedy word-wrap for canvas text -- ctx.font must already be set before calling. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** Wraps `text` at explicit "\n" breaks first, then word-wraps each resulting segment, capped at `maxLines` total (extra lines are dropped -- used for the editorial subtitle block, which the template gives a fixed two-line slot). */
function wrapWithExplicitBreaks(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const segments = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const lines = segments.flatMap((seg) => wrapText(ctx, seg, maxWidth));
  return lines.slice(0, maxLines);
}

/** Shrinks the editorial headline font size until it wraps within `maxLines`, down to `minSize`. Never truncates the text itself -- if it still doesn't fit at `minSize`, it's drawn at `minSize` with however many lines that takes rather than dropping words. */
function fitHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  weight: number,
): { fontSize: number; lines: string[] } {
  for (let size = maxSize; size >= minSize; size -= 4) {
    ctx.font = `${weight} ${size}px "${FONT_DISPLAY}"`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { fontSize: size, lines };
  }
  ctx.font = `${weight} ${minSize}px "${FONT_DISPLAY}"`;
  return { fontSize: minSize, lines: wrapText(ctx, text, maxWidth) };
}

function drawTrackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number): number {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + letterSpacing;
  }
  return cursor - letterSpacing;
}

/**
 * Finds the font size at which `text` measures as close as possible to
 * `targetWidth` (clamped to [minSize, maxSize]). Used for the editorial
 * "RESERVE" masthead, which the reference spans nearly the full canvas
 * width at -- a fixed font size can't guarantee that (measured width
 * scales with the actual glyphs, not a size chosen by eye), so this
 * measures at a reference size and scales proportionally, matching how
 * fitHeadline() already shrinks-to-fit the bottom headline, just solving
 * for width instead of line count.
 */
function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  targetWidth: number,
  weight: number,
  fontFamily: string,
  minSize: number,
  maxSize: number,
): number {
  const referenceSize = 100;
  ctx.font = `${weight} ${referenceSize}px "${fontFamily}"`;
  const referenceWidth = ctx.measureText(text).width;
  if (referenceWidth <= 0) return maxSize;
  const fitted = (targetWidth / referenceWidth) * referenceSize;
  return Math.max(minSize, Math.min(maxSize, fitted));
}

export interface CoverFit {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
}

/**
 * Cover-fit math (crop-to-fill, like CSS `object-fit: cover`) for placing
 * an `imgW`x`imgH` image into a `destW`x`destH` box, cropped around a
 * 0-100/axis focal point (50/50 = centered) -- same semantics as CSS
 * object-position and the article editor's crop tool. Returns coordinates
 * relative to the destination box's own origin (0,0 = the box's top-left,
 * NOT the canvas) -- callers translate by the box's own position before
 * drawImage. Shared by both templates (editorial's full-canvas photo,
 * news's boxed photo) so there's exactly one cover-fit implementation.
 * Pure and canvas-free (just arithmetic), so it's exported for direct
 * unit testing (scripts/test-news-banner-template.ts) alongside
 * tokenizeWithEmphasis below.
 *
 * `zoomMultiplier` (default 1 = no zoom, i.e. exactly the prior
 * behavior) scales the cover-fit result further around the same focal
 * point -- pass e.g. 1.5 for a 150% zoom. It's a plain multiplier here
 * (not the 100-200 percent used by FocalPointEditor's zoom prop/params.zoom
 * above) so this stays simple arithmetic independent of any UI's units;
 * callers convert (params.zoom ?? 100) / 100 before calling in.
 */
export function computeCoverFit(imgW: number, imgH: number, destW: number, destH: number, focalX: number, focalY: number, zoomMultiplier: number = 1): CoverFit {
  const scale = Math.max(destW / imgW, destH / imgH) * zoomMultiplier;
  const drawWidth = imgW * scale;
  const drawHeight = imgH * scale;
  const drawX = -(drawWidth - destW) * (focalX / 100);
  const drawY = -(drawHeight - destH) * (focalY / 100);
  return { drawX, drawY, drawWidth, drawHeight };
}

// ============================================================================
// EDITORIAL TEMPLATE
// ============================================================================

function renderEditorialTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  logoImg: HTMLImageElement,
  params: InstagramBannerParams,
): void {
  // 1. Background image, cover-fit, cropped around the given focal point.
  const focalX = params.focalX ?? 50;
  const focalY = params.focalY ?? 50;
  const zoom = params.zoom ?? 100;
  const fit = computeCoverFit(img.width, img.height, BANNER_WIDTH, BANNER_HEIGHT, focalX, focalY, zoom / 100);
  ctx.drawImage(img, fit.drawX, fit.drawY, fit.drawWidth, fit.drawHeight);

  // 2. Top and bottom dark gradients so the wordmark/kicker/subtitle and
  // the headline/credit line stay legible over any source photo.
  const topGradient = ctx.createLinearGradient(0, 0, 0, BANNER_HEIGHT * 0.42);
  topGradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  topGradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT * 0.42);

  const bottomGradient = ctx.createLinearGradient(0, BANNER_HEIGHT * 0.55, 0, BANNER_HEIGHT);
  bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGradient.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, BANNER_HEIGHT * 0.55, BANNER_WIDTH, BANNER_HEIGHT * 0.45);

  ctx.textBaseline = 'alphabetic';
  const contentWidth = BANNER_WIDTH - MARGIN * 2;
  let cursorY = MARGIN + 20;

  // 3. "THE" / "RESERVE" wordmark -- fixed brand text, never dynamic
  // content, but the masthead's SIZE is fit to width: the reference spans
  // nearly the full canvas width, and a fixed pixel size can't guarantee
  // that. Every gap below it is computed as a multiple of the ACTUAL
  // fitted size (not a flat pixel constant), so spacing stays correct
  // regardless of how large the fitted masthead turns out to be.
  // `ascent(size)` approximates a serif font's cap-height.
  const ascent = (size: number) => size * 0.72;

  ctx.fillStyle = 'rgba(241,240,230,0.9)';
  ctx.font = `600 20px "${FONT_SANS}"`;
  drawTrackedText(ctx, 'THE', MARGIN, cursorY, 6);

  const mastheadSize = fitTextToWidth(ctx, 'RESERVE', contentWidth * 0.97, 800, FONT_DISPLAY, 80, 260);
  cursorY += 20 + ascent(mastheadSize);
  ctx.fillStyle = CREAM;
  ctx.font = `800 ${mastheadSize}px "${FONT_DISPLAY}"`;
  ctx.fillText('RESERVE', MARGIN, cursorY);

  // 3b. Subject-over-text compositing -- drawn HERE specifically, right
  // after the masthead and before every other text layer, so the subject
  // can only ever sit in front of "THE"/"RESERVE" and never in front of
  // the kicker, subtitle, headline, credit line, or logo drawn below.
  // Uses the exact same fit transform that placed the background photo in
  // step 1, so it always lines up pixel-for-pixel regardless of crop.
  if (params.subjectCutout) {
    ctx.drawImage(params.subjectCutout, fit.drawX, fit.drawY, fit.drawWidth, fit.drawHeight);
  }

  // 4. Kicker (gold). Gap below the masthead scales with its actual size.
  // `offsetX`/`offsetY` (manual overrides) only nudge where THIS element
  // draws -- they never feed back into cursorY, so a manual nudge on one
  // element can't cascade into misplacing the elements after it.
  const overrides = params.overrides ?? {};
  cursorY += mastheadSize * 0.22;
  if (params.kicker.trim()) {
    const kickerSize = overrides.kicker?.fontSize ?? 28;
    cursorY += ascent(kickerSize);
    ctx.fillStyle = overrides.kicker?.color ?? GOLD;
    ctx.font = `600 ${kickerSize}px "${FONT_SANS}"`;
    drawTrackedText(
      ctx,
      params.kicker.trim().toUpperCase(),
      MARGIN + (overrides.kicker?.offsetX ?? 0),
      cursorY + (overrides.kicker?.offsetY ?? 0),
      5,
    );
    cursorY += kickerSize * 0.5;
  }

  // 5. Subtitle (cream, up to 2 lines).
  if (params.subtitle.trim()) {
    const subtitleSize = overrides.subtitle?.fontSize ?? 32;
    cursorY += ascent(subtitleSize);
    ctx.fillStyle = overrides.subtitle?.color ?? CREAM;
    ctx.font = `600 ${subtitleSize}px "${FONT_SANS}"`;
    const subtitleLines = wrapWithExplicitBreaks(ctx, params.subtitle.trim().toUpperCase(), contentWidth, 2);
    const subtitleX = MARGIN + (overrides.subtitle?.offsetX ?? 0);
    const subtitleYOffset = overrides.subtitle?.offsetY ?? 0;
    for (const line of subtitleLines) {
      ctx.fillText(line, subtitleX, cursorY + subtitleYOffset);
      cursorY += subtitleSize * 1.18;
    }
  }

  // 6. Headline -- auto-fit (or a manual font-size override), anchored to
  // the bottom of its reserved region so a shorter headline sits lower
  // (matching the reference), and a longer one grows upward without
  // colliding with the subtitle.
  const creditY = BANNER_HEIGHT - 40;
  const headlineBottom = creditY - 56;
  if (params.headline.trim()) {
    ctx.fillStyle = overrides.headline?.color ?? CREAM;
    const headlineText = params.headline.trim().toUpperCase();
    let fontSize: number;
    let lines: string[];
    if (overrides.headline?.fontSize) {
      fontSize = overrides.headline.fontSize;
      ctx.font = `800 ${fontSize}px "${FONT_DISPLAY}"`;
      lines = wrapText(ctx, headlineText, contentWidth);
    } else {
      ({ fontSize, lines } = fitHeadline(ctx, headlineText, contentWidth, 3, 96, 52, 800));
    }
    ctx.font = `800 ${fontSize}px "${FONT_DISPLAY}"`;
    const lineHeight = fontSize * 1.04;
    const headlineX = MARGIN + (overrides.headline?.offsetX ?? 0);
    let y = headlineBottom - (lines.length - 1) * lineHeight + (overrides.headline?.offsetY ?? 0);
    for (const line of lines) {
      ctx.fillText(line, headlineX, y);
      y += lineHeight;
    }
  }

  // 7. Credit line, centered.
  if (params.creditLine.trim()) {
    ctx.fillStyle = 'rgba(241,240,230,0.75)';
    ctx.font = `500 15px "${FONT_SANS}"`;
    const text = params.creditLine.trim().toUpperCase();
    // Centered tracked text: measure the tracked width first, then start from the centered x.
    const spacing = 2;
    let trackedWidth = 0;
    for (const char of text) trackedWidth += ctx.measureText(char).width + spacing;
    trackedWidth -= spacing;
    drawTrackedText(ctx, text, (BANNER_WIDTH - trackedWidth) / 2, creditY, spacing);
  }

  // 8. "R." logo mark, bottom-right -- the fixed raster asset
  // (public/assets/reserve-mark.png), placed via drawImage exactly as
  // produced from the approved reference file -- never recreated with
  // text or shapes. `fontSize` doubles as the logo's edge length here (no
  // font involved).
  const logoSize = overrides.logo?.fontSize ?? 84;
  const logoX = BANNER_WIDTH - MARGIN - logoSize + (overrides.logo?.offsetX ?? 0);
  const logoY = creditY - logoSize + 12 + (overrides.logo?.offsetY ?? 0);
  ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
}

// ============================================================================
// NEWS TEMPLATE -- second banner layout, selected via params.template === 'news'
// ============================================================================
//
// ⚠️ PLACEHOLDER COLORS -- NOT SAMPLED. Every other color constant in this
// file (CREAM, GOLD above) was measured from an approved reference file
// via the pixel-sampling method described in their own doc comment. No
// reference image was received for the news template when this was
// built, so NEWS_BG / NEWS_BLACK / NEWS_RED below are provisional,
// deliberately plain choices (a warm off-white, near-black, and a common
// editorial red) rather than sampled values -- do not treat them as final
// brand colors. NEWS_MUTED/NEWS_DIVIDER are derived from NEWS_BLACK and
// should be re-derived if NEWS_BLACK changes. Once the reference image is
// available, replace these constants (color-sample the same rigorous way
// as CREAM/GOLD) -- everything downstream (DEFAULT colors, overrides,
// tests) reads from these three names, so no other code needs to change.
const NEWS_BG = '#F4F1EA';
const NEWS_BLACK = '#111111';
const NEWS_RED = '#C8102E';
const NEWS_MUTED = 'rgba(17,17,17,0.55)';
const NEWS_DIVIDER = 'rgba(17,17,17,0.15)';

/** Sampled(-pending) brand defaults for the news template's two color-pickable elements. See the PLACEHOLDER COLORS note above -- these are provisional. Exported for the same reason as EDITORIAL_DEFAULT_COLORS: the color picker's default and "Reset to Auto" both read from here, never a hardcoded duplicate. */
export const NEWS_DEFAULT_COLORS: Record<'headline' | 'emphasis', string> = {
  headline: NEWS_BLACK,
  emphasis: NEWS_RED,
};

const NEWS_HEADLINE_WEIGHT = 800; // Inter 800 -- see ensureFontsReady()

// Two-column content area, between the fixed header (logo/URL/divider)
// and footer (source line) -- both columns span this ENTIRE height, not
// just a portion of it (the earlier bug: text and photo were both
// crammed into the top third with a large empty area below). Computed
// from fixed layout constants only (not from image/headline content), so
// they can be exported as plain numbers for InstagramBannerPanel.tsx's
// FocalPointEditor aspect ratio, same as the old fixed NEWS_PHOTO_BOX was.
const NEWS_HEADER_HEIGHT = 56 + 64 + 24; // topY + default logoSize + gap-to-divider, matches dividerY below when the logo isn't manually resized
const NEWS_CONTENT_TOP = NEWS_HEADER_HEIGHT + 48;
const NEWS_FOOTER_RESERVE = 100; // space reserved for the source line + bottom margin
const NEWS_CONTENT_BOTTOM = BANNER_HEIGHT - NEWS_FOOTER_RESERVE;
const NEWS_COLUMN_GAP = 40;
const NEWS_CONTENT_WIDTH = BANNER_WIDTH - MARGIN * 2;
export const NEWS_COLUMN_WIDTH = (NEWS_CONTENT_WIDTH - NEWS_COLUMN_GAP) / 2;
export const NEWS_COLUMN_HEIGHT = NEWS_CONTENT_BOTTOM - NEWS_CONTENT_TOP;

/** Photo column's box dimensions -- exported so InstagramBannerPanel.tsx's FocalPointEditor can be given this exact aspect ratio (rather than the full-canvas ratio the editorial template's crop uses), so the crop preview matches what actually renders. Kept as a named object (not just the two consts above) to minimize churn at that call site. */
export const NEWS_PHOTO_BOX = { width: NEWS_COLUMN_WIDTH, height: NEWS_COLUMN_HEIGHT };

/**
 * Resolves which side the text/photo columns sit on for a given
 * `newsLayout` value -- 'text-left' (default, including undefined) puts
 * the text column at MARGIN and the photo column to its right; 'text-right'
 * mirrors both. Pure arithmetic on fixed layout constants, no canvas
 * involved, so it's exported for direct unit testing
 * (scripts/test-news-banner-template.ts) alongside tokenizeWithEmphasis
 * and computeCoverFit -- the header/footer are never part of this, by
 * design (they're drawn at fixed positions regardless of newsLayout).
 */
export function computeNewsColumnPositions(newsLayout: 'text-left' | 'text-right' | undefined): { textColumnX: number; imageColumnX: number } {
  const textLeft = (newsLayout ?? 'text-left') !== 'text-right';
  return {
    textColumnX: textLeft ? MARGIN : MARGIN + NEWS_COLUMN_WIDTH + NEWS_COLUMN_GAP,
    imageColumnX: textLeft ? MARGIN + NEWS_COLUMN_WIDTH + NEWS_COLUMN_GAP : MARGIN,
  };
}

export interface EmphasisWord {
  word: string;
  emphasized: boolean;
}

/**
 * Splits `text` into uppercased words, flagging each whole word that
 * overlaps `emphasisPhrase` (case-insensitive substring match) as
 * emphasized -- this is what makes the red emphasis text admin-controlled
 * rather than a hardcoded "last N words" heuristic: the admin types or
 * pastes the exact phrase from the headline they want highlighted, and
 * this only ever colors that phrase. A word is marked emphasized if the
 * match touches ANY of its characters -- never splits a single word
 * across two colors. Falls back to "no emphasis" (every word
 * unemphasized) when `emphasisPhrase` is empty or isn't found anywhere in
 * `text` -- never throws, matching this module's existing
 * never-throws-on-a-missing-field convention.
 *
 * Pure and DOM/canvas-free by design, so it's independently unit-tested
 * (scripts/test-news-banner-template.ts) without needing a real canvas or
 * font metrics.
 */
export function tokenizeWithEmphasis(text: string, emphasisPhrase: string): EmphasisWord[] {
  const trimmed = text.trim();
  const phrase = emphasisPhrase.trim();
  const wordPattern = /\S+/g;

  const noEmphasis = () => trimmed.match(wordPattern)?.map((word) => ({ word: word.toUpperCase(), emphasized: false })) ?? [];

  if (!phrase) return noEmphasis();

  const matchIndex = trimmed.toUpperCase().indexOf(phrase.toUpperCase());
  if (matchIndex === -1) return noEmphasis();
  const matchEnd = matchIndex + phrase.length;

  const words: EmphasisWord[] = [];
  let m: RegExpExecArray | null;
  while ((m = wordPattern.exec(trimmed)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const emphasized = start < matchEnd && end > matchIndex;
    words.push({ word: m[0].toUpperCase(), emphasized });
  }
  return words;
}

/** Greedy word-wrap over pre-tokenized {word, emphasized} pairs -- same algorithm as wrapText(), just carrying the emphasis flag through instead of operating on a plain string. ctx.font must already be set before calling. */
function wrapEmphasisWordsToLines(ctx: CanvasRenderingContext2D, words: EmphasisWord[], maxWidth: number): EmphasisWord[][] {
  if (words.length === 0) return [];
  const lines: EmphasisWord[][] = [];
  let current: EmphasisWord[] = [words[0]];
  let currentText = words[0].word;
  for (let i = 1; i < words.length; i++) {
    const candidateText = `${currentText} ${words[i].word}`;
    if (ctx.measureText(candidateText).width <= maxWidth) {
      current.push(words[i]);
      currentText = candidateText;
    } else {
      lines.push(current);
      current = [words[i]];
      currentText = words[i].word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Finds the LARGEST font size (scanning down from maxSize) at which the
 * headline both wraps within `maxWidth` AND its full wrapped block --
 * `lines.length * lineHeight` -- fits within `maxHeight`. This is what
 * makes a short headline actually fill the column (a 2-word headline
 * gets a much larger size than a 12-word one, rather than both landing
 * on the same fixed size) instead of floating small at a size tuned for
 * the longest expected headline. If even `minSize` still overflows
 * `maxHeight`, that size is used anyway with however many lines it takes
 * -- never truncates the text, matching fitHeadline()'s existing
 * never-crop convention (the block will simply run past the column's
 * bottom edge into the footer's reserved margin in that extreme case,
 * rather than silently dropping words).
 */
function fitNewsHeadlineToColumn(
  ctx: CanvasRenderingContext2D,
  words: EmphasisWord[],
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
  minSize: number,
): { fontSize: number; lines: EmphasisWord[][]; lineHeight: number; blockHeight: number } {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${NEWS_HEADLINE_WEIGHT} ${size}px "${FONT_SANS}"`;
    const lines = wrapEmphasisWordsToLines(ctx, words, maxWidth);
    const lineHeight = size * 1.12;
    const blockHeight = lines.length * lineHeight;
    if (blockHeight <= maxHeight) return { fontSize: size, lines, lineHeight, blockHeight };
  }
  ctx.font = `${NEWS_HEADLINE_WEIGHT} ${minSize}px "${FONT_SANS}"`;
  const lines = wrapEmphasisWordsToLines(ctx, words, maxWidth);
  const lineHeight = minSize * 1.12;
  return { fontSize: minSize, lines, lineHeight, blockHeight: lines.length * lineHeight };
}

/** Draws one wrapped headline line, switching fillStyle per word run (base vs. emphasis color) -- a trailing space is included on every word but the line's last so runs of the same color still read as one continuous phrase, not visibly separate fillText calls. */
function drawEmphasisLine(ctx: CanvasRenderingContext2D, lineWords: EmphasisWord[], x: number, y: number, baseColor: string, emphasisColor: string): void {
  let cursorX = x;
  for (let i = 0; i < lineWords.length; i++) {
    const { word, emphasized } = lineWords[i];
    const text = i === lineWords.length - 1 ? word : `${word} `;
    ctx.fillStyle = emphasized ? emphasisColor : baseColor;
    ctx.fillText(text, cursorX, y);
    cursorX += ctx.measureText(text).width;
  }
}

function renderNewsTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  logoImg: HTMLImageElement,
  params: InstagramBannerParams,
): void {
  const overrides = params.overrides ?? {};

  // 1. Background -- light/off-white fill, not a full-bleed photo.
  ctx.fillStyle = NEWS_BG;
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  // 2. Top bar -- logo lockup (left) + site URL (right) + a thin divider
  // beneath both. Logo size/position reuses the `logo` override slot
  // (same one the editorial template's bottom-right mark uses) --
  // repositioned here, not a second control.
  const topY = 56;
  const logoSize = overrides.logo?.fontSize ?? 64;
  const logoX = MARGIN + (overrides.logo?.offsetX ?? 0);
  const logoYPos = topY + (overrides.logo?.offsetY ?? 0);
  ctx.drawImage(logoImg, logoX, logoYPos, logoSize, logoSize);

  const wordmarkX = MARGIN + logoSize + 16;
  ctx.fillStyle = NEWS_BLACK;
  ctx.font = `700 22px "${FONT_SANS}"`;
  ctx.fillText('THE RESERVE', wordmarkX, topY + logoSize * 0.42);
  ctx.fillStyle = NEWS_MUTED;
  ctx.font = `600 10px "${FONT_SANS}"`;
  drawTrackedText(ctx, 'MAGAZINE', wordmarkX, topY + logoSize * 0.42 + 18, 3);

  const siteUrl = 'WWW.THERESERVEMAG.COM';
  ctx.fillStyle = NEWS_MUTED;
  ctx.font = `500 13px "${FONT_SANS}"`;
  const siteUrlWidth = ctx.measureText(siteUrl).width;
  ctx.fillText(siteUrl, BANNER_WIDTH - MARGIN - siteUrlWidth, topY + logoSize * 0.5);

  const dividerY = topY + logoSize + 24;
  ctx.strokeStyle = NEWS_DIVIDER;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, dividerY);
  ctx.lineTo(BANNER_WIDTH - MARGIN, dividerY);
  ctx.stroke();

  // 3. Two full-height columns between the header and footer -- text and
  // photo each span the entire remaining height (NEWS_CONTENT_TOP to
  // NEWS_CONTENT_BOTTOM), not just the top portion. `newsLayout` decides
  // which side each sits on ('text-left' default, or 'text-right'
  // mirrored) -- the header/footer drawn above/below never move either
  // way, only these two columns swap.
  const { textColumnX, imageColumnX } = computeNewsColumnPositions(params.newsLayout);

  // 3a. Photo column -- full-bleed within its column (cover-fit + focal
  // point, same computeCoverFit() math as the editorial template's
  // full-canvas photo), spanning the column's entire height rather than a
  // small box floating near the top.
  const focalX = params.focalX ?? 50;
  const focalY = params.focalY ?? 50;
  const zoom = params.zoom ?? 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(imageColumnX, NEWS_CONTENT_TOP, NEWS_COLUMN_WIDTH, NEWS_COLUMN_HEIGHT);
  ctx.clip();
  const fit = computeCoverFit(img.width, img.height, NEWS_COLUMN_WIDTH, NEWS_COLUMN_HEIGHT, focalX, focalY, zoom / 100);
  ctx.drawImage(img, imageColumnX + fit.drawX, NEWS_CONTENT_TOP + fit.drawY, fit.drawWidth, fit.drawHeight);
  ctx.restore();
  ctx.strokeStyle = NEWS_BLACK;
  ctx.lineWidth = 2;
  ctx.strokeRect(imageColumnX, NEWS_CONTENT_TOP, NEWS_COLUMN_WIDTH, NEWS_COLUMN_HEIGHT);

  // 3b. Headline -- bold black all-caps sans, filling the text column's
  // full height/width (fitNewsHeadlineToColumn scales UP for a short
  // headline, down for a long one -- same auto-fit principle as the
  // editorial masthead's fitTextToWidth, tuned for a tall column instead
  // of a wide strip), vertically centered in the column rather than
  // pinned to the top. Admin-controlled emphasis phrase renders in red.
  if (params.headline.trim()) {
    const words = tokenizeWithEmphasis(params.headline, params.emphasisPhrase ?? '');
    let fontSize: number;
    let lines: EmphasisWord[][];
    let lineHeight: number;
    let blockHeight: number;
    if (overrides.headline?.fontSize) {
      fontSize = overrides.headline.fontSize;
      ctx.font = `${NEWS_HEADLINE_WEIGHT} ${fontSize}px "${FONT_SANS}"`;
      lines = wrapEmphasisWordsToLines(ctx, words, NEWS_COLUMN_WIDTH);
      lineHeight = fontSize * 1.12;
      blockHeight = lines.length * lineHeight;
    } else {
      ({ fontSize, lines, lineHeight, blockHeight } = fitNewsHeadlineToColumn(ctx, words, NEWS_COLUMN_WIDTH, NEWS_COLUMN_HEIGHT, 160, 32));
    }
    ctx.font = `${NEWS_HEADLINE_WEIGHT} ${fontSize}px "${FONT_SANS}"`;
    const headlineX = textColumnX + (overrides.headline?.offsetX ?? 0);
    const baseColor = overrides.headline?.color ?? NEWS_BLACK;
    const emphasisColor = overrides.emphasis?.color ?? NEWS_RED;
    // Vertically centered in the column: first baseline sits far enough
    // down from the centered block's top to clear the first line's
    // glyphs (the same cap-height rule of thumb as the editorial
    // template's ascent() helper), not at the block's raw top edge.
    let y = NEWS_CONTENT_TOP + (NEWS_COLUMN_HEIGHT - blockHeight) / 2 + fontSize * 0.78 + (overrides.headline?.offsetY ?? 0);
    for (const line of lines) {
      drawEmphasisLine(ctx, line, headlineX, y, baseColor, emphasisColor);
      y += lineHeight;
    }
  }

  // 5. Source line, bottom-left -- drawn exactly as typed, no forced
  // uppercase/prefix. InstagramBannerPanel.tsx seeds this field's default
  // text as "Source: <publisher>" (same seeding pattern as the editorial
  // template's "COURTESY: <publisher>" credit line), but the admin's own
  // edits are never rewritten by this renderer.
  if (params.creditLine.trim()) {
    ctx.fillStyle = NEWS_MUTED;
    ctx.font = `500 15px "${FONT_SANS}"`;
    ctx.fillText(params.creditLine.trim(), MARGIN, BANNER_HEIGHT - 40);
  }
}

// ============================================================================

/**
 * Renders THE RESERVE's Instagram banner (whichever template
 * `params.template` selects, defaulting to 'editorial') onto `canvas`
 * (sized to BANNER_WIDTH x BANNER_HEIGHT internally, regardless of the
 * canvas element's CSS display size). Never throws for a missing/short
 * text field -- an empty string simply draws nothing for that line, so a
 * partially-filled preview still renders instead of failing outright.
 */
export async function renderInstagramBanner(canvas: HTMLCanvasElement, params: InstagramBannerParams): Promise<void> {
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available in this browser.');

  const [img, logoImg] = await Promise.all([loadImage(params.imageSrc), loadImage(LOGO_ASSET_SRC)]);
  await ensureFontsReady();

  if ((params.template ?? 'editorial') === 'news') {
    renderNewsTemplate(ctx, img, logoImg, params);
  } else {
    renderEditorialTemplate(ctx, img, logoImg, params);
  }
}

/** Converts the rendered canvas to a PNG Blob (used for both the R2 banner upload and the manual download button). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode the banner as PNG.'));
    }, 'image/png');
  });
}
