// Deterministic, network-free tests for the Cloudflare R2 banner-upload
// integration (src/services/r2StorageService.ts). Run with
// `npm run test:r2-banner-upload`.
//
// NEVER calls real R2 or constructs a real S3Client -- every test injects
// an in-memory fake via uploadBannerToR2's `deps.client` parameter (same
// dependency-injection pattern as editorialGenerationService.ts's
// `generate`/`retrieveSources`, see test-editorial-cost-safety.ts). This
// script intentionally does not load .env (see package.json's script
// entry -- no --env-file-if-exists flag), so it starts from a clean
// environment and sets/clears the R2_* vars itself per test rather than
// depending on whatever is (or isn't) configured locally.

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { isR2Configured, uploadBannerToR2, type MinimalS3Client } from '../src/services/r2StorageService';

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

const R2_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL'] as const;

function clearR2Env() {
  for (const key of R2_ENV_KEYS) delete process.env[key];
}

function setFakeR2Env() {
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_BUCKET_NAME = 'test-bucket';
  process.env.R2_PUBLIC_BASE_URL = 'https://pub-test.r2.dev';
}

/** Records every PutObjectCommand it receives; never touches the network. */
function fakeS3Client(sendImpl?: (command: PutObjectCommand) => Promise<unknown>): { calls: PutObjectCommand[]; client: MinimalS3Client } {
  const calls: PutObjectCommand[] = [];
  return {
    calls,
    client: {
      send: async (command: PutObjectCommand) => {
        calls.push(command);
        if (sendImpl) return sendImpl(command);
        return {};
      },
    },
  };
}

async function testNotConfigured() {
  console.log('\n=== not configured -- clear, specific error, no upload attempted ===');
  clearR2Env();
  assert(isR2Configured() === false, 'isR2Configured() is false with no env vars set');

  const fake = fakeS3Client();
  try {
    await uploadBannerToR2(Buffer.from('fake-png-bytes'), 'image/png', 'instagram-banners/test.png', { client: fake.client });
    assert(false, 'uploadBannerToR2 throws when R2 is not configured');
  } catch (error: any) {
    assert(true, 'uploadBannerToR2 throws when R2 is not configured');
    assert(
      /R2_ACCOUNT_ID/.test(error.message) && /R2_PUBLIC_BASE_URL/.test(error.message),
      'error message names the missing env vars specifically',
      error.message,
    );
  }
  assert(fake.calls.length === 0, 'no PutObjectCommand was sent when not configured', fake.calls.length);
}

async function testSuccessfulUpload() {
  console.log('\n=== configured + mocked S3 client -- successful upload ===');
  setFakeR2Env();
  assert(isR2Configured() === true, 'isR2Configured() is true once all five env vars are set');

  const fake = fakeS3Client();
  const key = 'instagram-banners/abc123-999.png';
  const bytes = Buffer.from('fake-png-bytes');
  const url = await uploadBannerToR2(bytes, 'image/png', key, { client: fake.client });

  assert(url === `https://pub-test.r2.dev/${key}`, 'returned URL is R2_PUBLIC_BASE_URL + "/" + key', url);
  assert(fake.calls.length === 1, 'exactly one PutObjectCommand was sent', fake.calls.length);
  const sent = fake.calls[0]?.input as { Bucket?: string; Key?: string; ContentType?: string; Body?: unknown };
  assert(sent?.Bucket === 'test-bucket', 'command targets the configured bucket', sent?.Bucket);
  assert(sent?.Key === key, 'command uses the exact key passed in', sent?.Key);
  assert(sent?.ContentType === 'image/png', 'command sets the PNG content type', sent?.ContentType);
  assert(sent?.Body === bytes, 'command body is the exact bytes passed in');
}

async function testPublicBaseUrlTrailingSlash() {
  console.log('\n=== R2_PUBLIC_BASE_URL with a trailing slash -- no double slash in the result ===');
  setFakeR2Env();
  process.env.R2_PUBLIC_BASE_URL = 'https://pub-test.r2.dev/';
  const fake = fakeS3Client();
  const url = await uploadBannerToR2(Buffer.from('x'), 'image/png', 'instagram-banners/x.png', { client: fake.client });
  assert(url === 'https://pub-test.r2.dev/instagram-banners/x.png', 'no double slash between base URL and key', url);
}

async function testUploadFailurePropagates() {
  console.log('\n=== S3 send() rejects -- wrapped, specific error, not silently swallowed ===');
  setFakeR2Env();
  const fake = fakeS3Client(async () => {
    throw new Error('SignatureDoesNotMatch');
  });
  try {
    await uploadBannerToR2(Buffer.from('x'), 'image/png', 'instagram-banners/x.png', { client: fake.client });
    assert(false, 'uploadBannerToR2 rejects when the S3 client rejects');
  } catch (error: any) {
    assert(true, 'uploadBannerToR2 rejects when the S3 client rejects');
    assert(/Cloudflare R2/.test(error.message), 'error message is wrapped with R2-specific context', error.message);
    assert(/SignatureDoesNotMatch/.test(error.message), 'original error detail is preserved, not swallowed', error.message);
  }
}

async function main() {
  await testNotConfigured();
  await testSuccessfulUpload();
  await testPublicBaseUrlTrailingSlash();
  await testUploadFailurePropagates();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
