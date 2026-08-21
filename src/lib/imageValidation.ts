// Shared client-side upload validation -- built for the "Become a
// Contributor" profile photo (Stage 1) but deliberately generic/
// parameterized so Stage 2's content-photo upload can reuse the exact
// same functions with its own limits, rather than a copy-pasted second
// implementation. Two kinds of checks:
//   - Size/type: pure, synchronous, no DOM dependency -- takes a minimal
//     `{ size, type }` shape (not the full File type) specifically so
//     it's unit-testable with a plain object, no browser/File polyfill
//     needed. See scripts/test-contributor-signup.ts.
//   - Resolution: needs to actually decode the image to read its pixel
//     dimensions, which requires a real `Image()`/browser environment --
//     not unit-tested for the same reason instagramBannerRenderer.ts's
//     canvas drawing isn't (documented there and in
//     scripts/test-news-banner-template.ts's header comment); exercised
//     manually through the actual upload form.

export interface FileLike {
  size: number;
  type: string;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** Rejects anything that isn't an image/* MIME type. */
export function validateFileType(file: FileLike): ValidationResult {
  if (!file.type.startsWith('image/')) {
    return { ok: false, reason: 'Invalid file type. Please upload an image.' };
  }
  return { ok: true };
}

/** Rejects a file over `maxBytes`. `maxBytes` is a required, explicit parameter (no hidden default) so callers with different limits -- e.g. a future Stage 2 content-photo cap -- can never silently share a value they didn't intend to. */
export function validateFileSize(file: FileLike, maxBytes: number): ValidationResult {
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
    return { ok: false, reason: `File too large. Maximum size is ${maxMb}MB.` };
  }
  return { ok: true };
}

/** Combines the two synchronous checks above -- the full pre-upload gate that doesn't need to touch the network or decode the image. Resolution (validateImageResolution below) is checked separately, after this passes, since it's async and DOM-dependent. */
export function validateFileTypeAndSize(file: FileLike, maxBytes: number): ValidationResult {
  const typeResult = validateFileType(file);
  if (!typeResult.ok) return typeResult;
  return validateFileSize(file, maxBytes);
}

/**
 * Profile photos are capped more generously than Stage 2's planned
 * content-photo limit (2MB, per the brief -- there's only ever one photo
 * per contributor, vs. potentially many content photos) -- reusing the
 * same 5MB ceiling already established in ImageUploadForm.tsx for admin
 * article images, rather than inventing a third number.
 */
export const CONTRIBUTOR_PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Minimum acceptable profile-photo resolution -- "HD" is a loose term
 * for a single portrait/square headshot (unlike a 16:9 video frame), so
 * this uses 600x600 as a practical floor rather than literal 1280x720:
 * large enough to not look pixelated at typical author-card/dashboard
 * display sizes, small enough not to reject a normal phone-camera
 * headshot. Exported so it's visible/tunable in one place rather than a
 * magic number buried in a component.
 */
export const CONTRIBUTOR_PROFILE_PHOTO_MIN_WIDTH = 600;
export const CONTRIBUTOR_PROFILE_PHOTO_MIN_HEIGHT = 600;

/**
 * Decodes `file` in the browser and checks its natural pixel dimensions
 * against a minimum. Requires `Image()`/`URL.createObjectURL` (a real
 * DOM), so this is async and browser-only -- call validateFileTypeAndSize
 * first for the cheap synchronous checks. Always revokes the object URL
 * it creates, on both the resolve and reject paths.
 */
export function validateImageResolution(file: File, minWidth: number, minHeight: number): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      URL.revokeObjectURL(objectUrl);
      if (width < minWidth || height < minHeight) {
        resolve({ ok: false, reason: `Image resolution too low (${width}x${height}). Minimum is ${minWidth}x${minHeight}.` });
        return;
      }
      resolve({ ok: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ ok: false, reason: 'Could not read this image file. Please try a different photo.' });
    };
    img.src = objectUrl;
  });
}

/** Well-formed http(s) URL check for the social media fields -- rejects anything that isn't a parseable http/https URL (e.g. a bare handle like "@username" or a non-URL string), without requiring a specific domain (so instagram.com, instagr.am, or a custom link-in-bio URL all pass). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
