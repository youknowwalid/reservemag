// Instagram Banner Automation -- client-side (browser Canvas) renderer for
// THE RESERVE's approved editorial banner template. Runs entirely in the
// admin's browser: no new server dependency, no Vercel serverless-runtime
// risk (directly avoiding a repeat of the jsdom/ESM incident two prior
// passes had to fix), and it reuses the exact fonts already loaded
// site-wide (Inter + Playfair Display, see src/index.css) so the banner
// stays visually consistent with the rest of THE RESERVE's identity
// without adding a single new font resource.
//
// FIXED TEMPLATE, NOT A REDESIGN: every proportion, weight, and color
// below was measured directly off the approved reference banner and is
// meant to stay fixed. Only the inputs (background image, kicker,
// subtitle, headline, credit line) are dynamic -- see
// InstagramBannerPanel.tsx, which is the only caller and owns turning an
// editorial generation's fields into these parameters.
//
// Reference layout (1080x1350, Instagram 4:5 portrait), top to bottom:
//   "THE" (small tracked label) -> "RESERVE" (huge serif wordmark)
//   kicker (tracked, gold)
//   subtitle, up to 2 lines (tracked, cream)
//   [photo fills the frame behind all of the above and below]
//   headline, auto-sized to fit up to 3 lines (huge serif, cream)
//   credit line, centered (small tracked, muted cream)
//   "R." monogram, bottom-right (serif, gold)
// A dark top-and-bottom gradient sits between the photo and the text so
// every line stays legible regardless of what's in the source image.

export const BANNER_WIDTH = 1080;
export const BANNER_HEIGHT = 1350;

const MARGIN = 64;
const CREAM = '#F5F1E8';
const GOLD = '#C9A668';

const FONT_SERIF = 'Playfair Display';
const FONT_SANS = 'Inter';

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
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load the banner image.'));
    img.src = src;
  });
}

/** Waits for the exact font weights this template draws with to be ready, so canvas text never silently falls back to a system font before the webfont finishes loading. */
async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all([
    document.fonts.load(`800 100px "${FONT_SERIF}"`),
    document.fonts.load(`600 32px "${FONT_SANS}"`),
    document.fonts.load(`500 16px "${FONT_SANS}"`),
  ]);
  await document.fonts.ready;
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
    ctx.font = `${weight} ${size}px "${FONT_SERIF}"`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { fontSize: size, lines };
  }
  ctx.font = `${weight} ${minSize}px "${FONT_SERIF}"`;
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

  const [img] = await Promise.all([loadImage(params.imageSrc), ensureFontsReady()]);

  // 1. Background image, cover-fit (fills the frame, cropped to center).
  const scale = Math.max(BANNER_WIDTH / img.width, BANNER_HEIGHT / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const drawX = (BANNER_WIDTH - drawWidth) / 2;
  const drawY = (BANNER_HEIGHT - drawHeight) / 2;
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
  ctx.fillStyle = 'rgba(245,241,232,0.9)';
  ctx.font = `600 20px "${FONT_SANS}"`;
  drawTrackedText(ctx, 'THE', MARGIN, cursorY, 6);
  cursorY += 92;

  ctx.fillStyle = CREAM;
  ctx.font = `800 100px "${FONT_SERIF}"`;
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
    ctx.font = `800 ${fontSize}px "${FONT_SERIF}"`;
    const lineHeight = fontSize * 1.04;
    let y = headlineBottom - (lines.length - 1) * lineHeight;
    for (const line of lines) {
      ctx.fillText(line, MARGIN, y);
      y += lineHeight;
    }
  }

  // 7. Credit line, centered.
  if (params.creditLine.trim()) {
    ctx.fillStyle = 'rgba(245,241,232,0.75)';
    ctx.font = `500 15px "${FONT_SANS}"`;
    const text = params.creditLine.trim().toUpperCase();
    // Centered tracked text: measure the tracked width first, then start from the centered x.
    const spacing = 2;
    let trackedWidth = 0;
    for (const char of text) trackedWidth += ctx.measureText(char).width + spacing;
    trackedWidth -= spacing;
    drawTrackedText(ctx, text, (BANNER_WIDTH - trackedWidth) / 2, creditY, spacing);
  }

  // 8. "R." monogram, bottom-right -- fixed brand mark, never dynamic.
  ctx.fillStyle = GOLD;
  ctx.font = `800 26px "${FONT_SERIF}"`;
  ctx.textAlign = 'right';
  ctx.fillText('R.', BANNER_WIDTH - MARGIN, creditY);
  ctx.textAlign = 'left';
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
