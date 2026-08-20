// Subject-over-text compositing for the Instagram Banner Automation --
// isolates the person in the source photo from its background so the
// banner renderer can composite them on top of the "RESERVE" masthead
// and other text, matching a premium magazine cover's layered look
// (hair/head naturally overlapping the wordmark) instead of the text
// always sitting flat on top of the whole photo.
//
// LIBRARY CHOICE: MediaPipe Tasks Vision's ImageSegmenter, using Google's
// official "selfie segmenter" model -- purpose-built for exactly this
// (isolating a person from their background), actively maintained (the
// current, non-legacy MediaPipe API), and runs entirely client-side via
// WASM -- no server, no native Node dependency, consistent with this
// codebase's established Canvas-over-server-rendering choice and the
// prior effort spent avoiding native/ESM dependency risk (the
// jsdom/ERR_REQUIRE_ESM incident two passes ago). Verified sizes (fetched
// once per browser session, then cached by the browser -- never part of
// the site-wide JS bundle, since everything here is loaded via dynamic
// import() only when the Instagram Banner panel actually segments an
// image): the model itself is ~244KB, the WASM runtime ~9.4MB, the JS
// loader glue ~137KB -- a few seconds on first use, which is explicitly
// an acceptable one-time cost for this admin-only tool.
//
// This module is the ONLY place that imports "@mediapipe/tasks-vision",
// and only via a lazy dynamic import() inside getSegmenter() below --
// never at module scope -- so simply importing this file doesn't trigger
// any of it; only actually calling segmentSubject() does.

const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

// Below this fraction of confidently-subject pixels, treat the result as
// "no real subject found" (e.g. a landscape/product photo, or a failed
// inference) and fall back rather than compositing a near-blank or noisy
// cutout.
const MIN_CONFIDENT_SUBJECT_RATIO = 0.02;
const CONFIDENCE_THRESHOLD = 0.5;
const MODEL_LOAD_TIMEOUT_MS = 15_000;

let segmenterPromise: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((error) => {
      // Don't cache a failed load -- a transient issue (a flaky network
      // request for the WASM/model files, a momentary browser hiccup)
      // shouldn't permanently disable this feature for the rest of the
      // admin's session. The next segmentSubject() call gets a fresh
      // attempt instead of immediately re-rejecting with this same
      // stale error forever.
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms)),
  ]);
}

/**
 * Runs subject segmentation on `img` and returns a same-size canvas where
 * the subject's original pixels are opaque and everything else is fully
 * transparent -- ready to be drawn with the identical transform used for
 * the background photo so it aligns pixel-for-pixel regardless of crop or
 * focal point (see instagramBannerRenderer.ts step 9).
 *
 * Never throws. Returns `null` on ANY failure -- model load timeout,
 * inference error, or a low-confidence/empty result (no person detected)
 * -- so the caller can fall back cleanly to the plain, non-composited
 * banner. Always logs a console.warn when it returns null, so the
 * fallback is visible during testing without surfacing a raw error to
 * the admin.
 */
export async function segmentSubject(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  let result: import('@mediapipe/tasks-vision').ImageSegmenterResult | null = null;
  try {
    const segmenter = await withTimeout(getSegmenter(), MODEL_LOAD_TIMEOUT_MS, 'Subject segmentation model load');

    // segment() runs synchronously (it's a blocking WASM inference call,
    // not a Promise) -- once the model itself has loaded above, a single
    // image's inference is expected to complete in well under a second,
    // so this isn't separately wrapped in a timeout race the way the
    // async model load is.
    result = segmenter.segment(img);
    const mask = result.confidenceMasks?.[0];
    if (!mask) {
      console.warn('[Instagram Banner] Segmentation returned no confidence mask -- falling back to a plain (non-composited) banner.');
      return null;
    }

    const values = mask.getAsFloat32Array();
    const maskWidth = mask.width;
    const maskHeight = mask.height;

    let confidentPixels = 0;
    for (let i = 0; i < values.length; i++) if (values[i] > CONFIDENCE_THRESHOLD) confidentPixels++;
    const confidentRatio = confidentPixels / values.length;

    if (confidentRatio < MIN_CONFIDENT_SUBJECT_RATIO) {
      console.warn(
        `[Instagram Banner] Segmentation found no confident subject (${(confidentRatio * 100).toFixed(2)}% of pixels above threshold) -- falling back to a plain (non-composited) banner.`,
      );
      return null;
    }

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const cutout = document.createElement('canvas');
    cutout.width = width;
    cutout.height = height;
    const ctx = cutout.getContext('2d');
    if (!ctx) {
      console.warn('[Instagram Banner] Canvas 2D context unavailable while building the subject cutout -- falling back to a plain (non-composited) banner.');
      return null;
    }
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // The mask's resolution is the model's own fixed output size, almost
    // always smaller than the source photo, so it's resampled to the
    // image's actual pixel dimensions with a simple nearest-neighbor
    // lookup -- sufficient for an alpha cutout at banner size, and
    // deliberately not more sophisticated per this pass's own scope
    // ("do not over-engineer edge refinement").
    for (let y = 0; y < height; y++) {
      const my = Math.min(maskHeight - 1, Math.floor((y / height) * maskHeight));
      for (let x = 0; x < width; x++) {
        const mx = Math.min(maskWidth - 1, Math.floor((x / width) * maskWidth));
        const confidence = values[my * maskWidth + mx];
        const alphaIndex = (y * width + x) * 4 + 3;
        imageData.data[alphaIndex] = confidence > CONFIDENCE_THRESHOLD ? Math.round(confidence * 255) : 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return cutout;
  } catch (error) {
    console.warn('[Instagram Banner] Subject segmentation failed -- falling back to a plain (non-composited) banner.', error);
    return null;
  } finally {
    // Frees the WASM-backed mask/category buffers -- MediaPipe's
    // documented cleanup step, not optional garbage collection.
    result?.close();
  }
}
