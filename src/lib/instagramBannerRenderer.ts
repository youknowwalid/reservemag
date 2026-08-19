// Instagram Banner Automation -- client-side (browser Canvas) renderer for
// THE RESERVE's approved editorial banner template. Runs entirely in the
// admin's browser: no new server dependency, no Vercel serverless-runtime
// risk (directly avoiding a repeat of the jsdom/ESM incident two prior
// passes had to fix). Fonts: Inter (kicker/subtitle/credit line) is the
// one already loaded site-wide (src/index.css); Bodoni Moda (masthead +
// headline) is loaded specifically by this module -- see
// ensureBodoniModaStylesheetInjected() below -- because the reference
// masthead is a genuine high-contrast Didone/Bodoni-style face, which
// Playfair Display (the site's own display serif) does not reproduce
// closely enough. Scoped to this module rather than added to the global
// stylesheet so it doesn't add a font request to every page on the site,
// only when the banner tool is actually used.
//
// FIXED TEMPLATE, NOT A REDESIGN: every proportion, weight, and color
// below was measured directly off the approved reference banner files
// (colors via programmatic pixel sampling -- see the CREAM/GOLD doc
// comments below for exact source coordinates and sampled values) and is
// meant to stay fixed. Only the inputs (background image, kicker,
// subtitle, headline, credit line) are dynamic -- see
// InstagramBannerPanel.tsx, which is the only caller and owns turning an
// editorial generation's fields into these parameters.
//
// Reference layout (1080x1350, Instagram 4:5 portrait), top to bottom:
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

export const BANNER_WIDTH = 1080;
export const BANNER_HEIGHT = 1350;

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

const FONT_DISPLAY = 'Bodoni Moda'; // masthead + headline only
const FONT_SANS = 'Inter'; // kicker, subtitle, credit line -- unchanged, already loaded site-wide

const LOGO_ASSET_SRC = '/assets/reserve-mark.png';

export interface InstagramBannerParams {
  /** A same-origin-safe image URL -- an object URL from the image proxy, or a data: URL. Never draw a raw cross-origin source URL directly (canvas export would throw). */
  imageSrc: string;
  /** Short tracked label, e.g. "LUXE". */
  kicker: string;
  /** One or two lines, e.g. "THE HIGH JEWELRY ISSUE" / "PARIS COUTURE WEEK". A literal "\n" forces the line break; otherwise this wraps automatically at up to 2 lines. */
  subtitle: string;
  /** The large cover headline, e.g. "PURE OPULENCE". Auto-sized to fit. */
  headline: string;
  /** Small centered credit line, e.g. "PHOTO: JANE DOE // COURTESY: THE RESERVE". */
  creditLine: string;
  /** Cover-fit focal point, 0-100 per axis (same semantics as CSS object-position -- 50/50 is centered, matching the article editor's crop tool). Defaults to 50/50 when omitted. */
  focalX?: number;
  focalY?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

const BODONI_MODA_STYLESHEET_ID = 'reserve-banner-bodoni-moda-font';
const BODONI_MODA_STYLESHEET_URL = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@800&display=swap';

let bodoniModaStylesheetPromise: Promise<void> | null = null;

/**
 * Injects the Bodoni Moda Google Fonts stylesheet once (idempotent),
 * scoped to this module rather than added to src/index.css -- see this
 * file's header comment for why. `document.fonts.load()` can only
 * resolve a font whose @font-face rule is already registered in the
 * CSSOM, so this must complete (the <link> itself finish loading) before
 * ensureFontsReady() calls document.fonts.load() for Bodoni Moda, or
 * that call has nothing to resolve against yet.
 */
function ensureBodoniModaStylesheetInjected(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  const existing = document.getElementById(BODONI_MODA_STYLESHEET_ID) as HTMLLinkElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }
  if (bodoniModaStylesheetPromise) return bodoniModaStylesheetPromise;

  bodoniModaStylesheetPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = BODONI_MODA_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = BODONI_MODA_STYLESHEET_URL;
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
  return bodoniModaStylesheetPromise;
}

/**
 * Waits for the exact font weights this template draws with to be ready,
 * so canvas text never silently falls back to a system font before the
 * webfont finishes loading -- then explicitly *confirms* Bodoni Moda
 * actually loaded (document.fonts.check()), rather than assuming the
 * await above means it worked. A failed confirmation is logged loudly:
 * if fonts.googleapis.com is unreachable, the masthead/headline would
 * otherwise silently render in a fallback serif with no visible error.
 */
async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;

  await ensureBodoniModaStylesheetInjected();
  await Promise.all([
    document.fonts.load(`800 100px "${FONT_DISPLAY}"`),
    document.fonts.load(`600 32px "${FONT_SANS}"`),
    document.fonts.load(`500 16px "${FONT_SANS}"`),
  ]);
  await document.fonts.ready;

  if (!document.fonts.check(`800 100px "${FONT_DISPLAY}"`)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Instagram Banner] "${FONT_DISPLAY}" did not report as loaded -- the masthead/headline will likely render in a fallback serif instead. Check network access to fonts.googleapis.com.`,
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

/** Wraps `text` at explicit "\n" breaks first, then word-wraps each resulting segment, capped at `maxLines` total (extra lines are dropped -- used for the subtitle block, which the template gives a fixed two-line slot). */
function wrapWithExplicitBreaks(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const segments = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const lines = segments.flatMap((seg) => wrapText(ctx, seg, maxWidth));
  return lines.slice(0, maxLines);
}

/** Shrinks the headline font size until it wraps within `maxLines`, down to `minSize`. Never truncates the text itself -- if it still doesn't fit at `minSize`, it's drawn at `minSize` with however many lines that takes rather than dropping words. */
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
 * Renders THE RESERVE's Instagram banner template onto `canvas` (sized to
 * BANNER_WIDTH x BANNER_HEIGHT internally, regardless of the canvas
 * element's CSS display size). Never throws for a missing/short text
 * field -- an empty string simply draws nothing for that line, so a
 * partially-filled preview still renders instead of failing outright.
 */
export async function renderInstagramBanner(canvas: HTMLCanvasElement, params: InstagramBannerParams): Promise<void> {
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available in this browser.');

  const [img, logoImg] = await Promise.all([loadImage(params.imageSrc), loadImage(LOGO_ASSET_SRC)]);
  await ensureFontsReady();

  // 1. Background image, cover-fit, cropped around the given focal point
  // (defaults to centered -- same 0-100/axis semantics as CSS
  // object-position, matching the article editor's crop tool so the two
  // features share one mental model even though this one draws via
  // Canvas instead of CSS).
  const scale = Math.max(BANNER_WIDTH / img.width, BANNER_HEIGHT / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const focalX = params.focalX ?? 50;
  const focalY = params.focalY ?? 50;
  const drawX = -(drawWidth - BANNER_WIDTH) * (focalX / 100);
  const drawY = -(drawHeight - BANNER_HEIGHT) * (focalY / 100);
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

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

  // 3. "THE" / "RESERVE" wordmark -- fixed brand text, never dynamic.
  ctx.fillStyle = 'rgba(241,240,230,0.9)';
  ctx.font = `600 20px "${FONT_SANS}"`;
  drawTrackedText(ctx, 'THE', MARGIN, cursorY, 6);
  cursorY += 92;

  ctx.fillStyle = CREAM;
  ctx.font = `800 100px "${FONT_DISPLAY}"`;
  ctx.fillText('RESERVE', MARGIN, cursorY);
  cursorY += 56;

  // 4. Kicker (gold).
  if (params.kicker.trim()) {
    ctx.fillStyle = GOLD;
    ctx.font = `600 28px "${FONT_SANS}"`;
    drawTrackedText(ctx, params.kicker.trim().toUpperCase(), MARGIN, cursorY, 5);
    cursorY += 46;
  }

  // 5. Subtitle (cream, up to 2 lines).
  if (params.subtitle.trim()) {
    ctx.fillStyle = CREAM;
    ctx.font = `600 32px "${FONT_SANS}"`;
    const subtitleLines = wrapWithExplicitBreaks(ctx, params.subtitle.trim().toUpperCase(), contentWidth, 2);
    for (const line of subtitleLines) {
      ctx.fillText(line, MARGIN, cursorY);
      cursorY += 38;
    }
  }

  // 6. Headline -- auto-fit, anchored to the bottom of its reserved
  // region so a shorter headline sits lower (matching the reference),
  // and a longer one grows upward without colliding with the subtitle.
  const creditY = BANNER_HEIGHT - 40;
  const headlineBottom = creditY - 56;
  if (params.headline.trim()) {
    ctx.fillStyle = CREAM;
    const { fontSize, lines } = fitHeadline(ctx, params.headline.trim().toUpperCase(), contentWidth, 3, 96, 52, 800);
    ctx.font = `800 ${fontSize}px "${FONT_DISPLAY}"`;
    const lineHeight = fontSize * 1.04;
    let y = headlineBottom - (lines.length - 1) * lineHeight;
    for (const line of lines) {
      ctx.fillText(line, MARGIN, y);
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
  // produced from the approved reference file (circular badge, embedded
  // "THE RESERVE" wordmark, separate gold accent dot, all baked into the
  // asset's own pixels) -- never recreated with text or shapes.
  const logoSize = 84;
  const logoX = BANNER_WIDTH - MARGIN - logoSize;
  const logoY = creditY - logoSize + 12;
  ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
}

/** Converts the rendered canvas to a PNG Blob (used for both the Supabase Storage upload and the manual download button). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode the banner as PNG.'));
    }, 'image/png');
  });
}
