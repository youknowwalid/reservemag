// Cloudflare R2 client -- server-only. Stores exactly one thing: the
// final rendered Instagram banner PNG (InstagramBannerPanel.tsx's
// "Upload Banner" step), so its public URL can be fed into
// instagramGraphService.ts's image_url field. Nothing else in the app
// uses R2 -- the admin Media Library (mediaService.ts), the article
// image proxy, and every DB record stay on Supabase exactly as before;
// this is a storage-layer swap for one specific upload, not a platform
// migration.
//
// R2 is S3-compatible, so this uses the standard @aws-sdk/client-s3
// package against R2's S3 API endpoint
// (https://developers.cloudflare.com/r2/api/s3/api/) rather than a
// Cloudflare-specific SDK.
//
// Never import this from client code -- R2_ACCESS_KEY_ID/
// R2_SECRET_ACCESS_KEY must never reach the browser bundle. Routes call
// this from server.ts, gated by verifyAdminRequest() same as every other
// admin/AI/source/Instagram route.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/** The subset of S3Client this module actually calls -- lets tests inject a hand-rolled fake `{ send: async (cmd) => {...} }` instead of a real network client, matching this codebase's existing dependency-injection test pattern (see editorialGenerationService.ts's `generate`/`retrieveSources` params and scripts/test-editorial-cost-safety.ts). */
export interface MinimalS3Client {
  send(command: PutObjectCommand): Promise<unknown>;
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL,
  );
}

/**
 * Uploads `bytes` to R2 under `key` and returns its public URL --
 * `R2_PUBLIC_BASE_URL` + `/` + `key`, matching the exact shape the rest
 * of the app already expects from the Supabase Storage
 * getPublicUrl() call this replaces (a plain fetchable https:// URL,
 * nothing more). `deps.client` is test-only -- production callers never
 * pass it, and get the lazily-constructed real S3Client above.
 */
export async function uploadBannerToR2(
  bytes: Buffer,
  contentType: string,
  key: string,
  deps: { client?: MinimalS3Client } = {},
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error(
      'Cloudflare R2 is not configured on the server -- set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL.',
    );
  }

  const client = deps.client ?? getClient();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    // Wrapped (not rethrown as-is) so the admin sees a specific,
    // recognizable message instead of a raw AWS SDK exception -- same
    // intent as instagramGraphService.ts's Graph API error wrapping.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload the banner to Cloudflare R2: ${detail}`);
  }

  const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/${key}`;
}
