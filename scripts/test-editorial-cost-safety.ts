// Deterministic, network-free tests for the Reserve Editorial Intelligence
// Engine's cost-safety hardening: confirmation gating, duplicate-
// submission locking, and no-retry-on-403/timeout/malformed-output. Run
// with `npm run test:editorial-cost-safety`.
//
// NEVER calls the real Tabitoken API or the real Source Retrieval Engine
// -- both are replaced with in-memory fakes via generateEditorialPackage's
// dependency-injection parameter (see editorialGenerationService.ts) and
// the in-memory lock store (editorialJobLock.ts). Safe to run with no
// TABITOKEN_API_KEY configured at all.

import { generateEditorialPackage } from '../src/services/editorial/editorialGenerationService';
import { validateGenerationRequestBody } from '../src/services/editorial/editorialRequestGuard';
import { computeEditorialFingerprint, createInMemoryJobLockStore } from '../src/services/editorial/editorialJobLock';
import { AIProviderError } from '../src/services/ai';
import type { AIGenerateOptions, AIGenerateResult } from '../src/services/ai';
import type { RetrievedSource, SourceRetrievalJobResult } from '../src/services/research/sourceRetrievalService';
import type { EditorialGenerationInput } from '../src/services/editorial/editorialTypes';

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_URL = 'https://example.com/test-article';
const IMAGE_URL = 'https://example.com/hero.jpg';

function fakeSuccessSource(): RetrievedSource {
  return {
    url: TEST_URL,
    canonicalUrl: TEST_URL,
    status: 'SUCCESS',
    errorReason: null,
    httpStatus: 200,
    title: 'Test Article',
    subheadline: 'A test subheadline',
    author: 'Jane Test',
    publisher: 'Example Publisher',
    publishedAt: '2026-01-01T00:00:00.000Z',
    description: 'A test description.',
    language: 'en',
    articleText: 'Paragraph one of the test article.\n\nParagraph two of the test article, with more detail.',
    headings: [{ level: 2, text: 'A Heading' }],
    images: [{ imageUrl: IMAGE_URL, sourcePageUrl: TEST_URL, altText: 'hero', caption: null, width: 1200, height: 630, position: 0, kind: 'og' }],
    ogImage: IMAGE_URL,
    twitterImage: null,
    wordCount: 16,
    truncated: false,
    retrievedAt: new Date().toISOString(),
    fromCache: false,
    contentHash: 'fakehash',
  };
}

function fakeRetrieveSourcesSuccess(): (urls: string[]) => Promise<SourceRetrievalJobResult> {
  return async (urls: string[]) => {
    const sources = urls.map(() => fakeSuccessSource());
    return { sources, succeededCount: sources.length, failedCount: 0, status: 'SUCCESS' };
  };
}

const VALID_PACKAGE = {
  title: 'A Test Headline',
  subtitle: 'A test subtitle',
  article:
    'A test introduction paragraph with enough content to be meaningful for the deterministic QA check that flags an unrealistically short article. '.repeat(3) +
    '\n\n' +
    'A section body with enough content to be meaningful for the deterministic QA check that flags an unrealistically short article, repeated a few times so the total word count clears the warning threshold as well as the hard failure floor. '.repeat(
      10,
    ) +
    '\n\n' +
    'A test conclusion paragraph with enough content to be meaningful for the QA length check. '.repeat(3),
  instagramHeadline: 'A Short Test Headline',
  instagramSubheadline: 'A short test subheadline for the cover.',
  coverKicker: 'TEST KICKER',
  coverSecondaryLine: 'A short secondary line.',
  caption: 'A test caption for the post.',
  imageUrl: IMAGE_URL,
  imageReason: 'The strongest available candidate.',
  sourcesUsed: ['source_1'],
  warnings: [],
};

function okAiResult(text: string): AIGenerateResult {
  return { text, json: null, model: 'claude-opus-4-8-thinking', finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } };
}

/** Counts calls and always throws the given error -- used to prove no-retry behavior: exactly one call, then a hard failure. */
function mockGenerateThrowsOnce(error: Error): { fn: (options: AIGenerateOptions) => Promise<AIGenerateResult>; callCount: () => number } {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      throw error;
    },
    callCount: () => calls,
  };
}

function mockGenerateReturns(text: string): { fn: (options: AIGenerateOptions) => Promise<AIGenerateResult>; callCount: () => number } {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      return okAiResult(text);
    },
    callCount: () => calls,
  };
}

const baseInput: EditorialGenerationInput = { sourceUrls: [TEST_URL], subject: 'Jane Test' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testConfirmationGating() {
  console.log('\n=== confirmed gating ===');
  const rejected = validateGenerationRequestBody({ sourceUrls: [TEST_URL], confirmed: false });
  assert(rejected.ok === false, 'confirmed=false is rejected', rejected);
  assert(rejected.ok === false && rejected.status === 400, 'confirmed=false rejection is HTTP 400');

  const missing = validateGenerationRequestBody({ sourceUrls: [TEST_URL] });
  assert(missing.ok === false, 'missing confirmed field is rejected (defaults closed, not open)', missing);

  const accepted = validateGenerationRequestBody({ sourceUrls: [TEST_URL], confirmed: true });
  assert(accepted.ok === true, 'confirmed=true is accepted', accepted);
  assert(accepted.ok === true && accepted.input.sourceUrls[0] === TEST_URL, 'accepted request carries the source URL through');

  const tooMany = validateGenerationRequestBody({ sourceUrls: [TEST_URL, TEST_URL, TEST_URL, TEST_URL], confirmed: true });
  assert(tooMany.ok === false, 'more than 3 source URLs is rejected');
}

async function testDuplicateLocking() {
  console.log('\n=== duplicate submission protection ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);

  const first = await store.tryAcquire(fingerprint, { note: 'first' });
  assert(first.ok === true, 'first acquire for a fresh fingerprint succeeds');

  // Still PENDING (never transitioned) -- a second acquire must be rejected.
  const duringPending = await store.tryAcquire(fingerprint, { note: 'duplicate-during-pending' });
  assert(duringPending.ok === false, 'duplicate acquire while PENDING is rejected');

  if (first.ok) await store.markRunning(first.id);
  const duringRunning = await store.tryAcquire(fingerprint, { note: 'duplicate-during-running' });
  assert(duringRunning.ok === false, 'duplicate acquire while RUNNING is rejected');

  if (first.ok) await store.markTerminal(first.id, { generation_status: 'SUCCESS' });
  const afterTerminal = await store.tryAcquire(fingerprint, { note: 'after-completion' });
  assert(afterTerminal.ok === true, 'a NEW acquire succeeds once the prior job reached a terminal state');

  const differentFingerprint = computeEditorialFingerprint({ sourceUrls: ['https://example.com/other-article'] });
  assert(differentFingerprint !== fingerprint, 'different source URLs produce a different fingerprint');

  const orderInsensitive = computeEditorialFingerprint({ sourceUrls: ['https://a.example.com/', 'https://b.example.com/'] });
  const orderInsensitive2 = computeEditorialFingerprint({ sourceUrls: ['https://b.example.com/', 'https://a.example.com/'] });
  assert(orderInsensitive === orderInsensitive2, 'fingerprint is order-insensitive on source URLs');
}

async function testStaleReclaim() {
  console.log('\n=== stale lock reclaim ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  assert(acquired.ok === true, 'setup: acquire succeeds');

  // Not stale yet (cutoff in the past) -- duplicate should still be rejected.
  await store.reclaimStale(fingerprint, new Date(Date.now() - 60_000).toISOString());
  const stillBlocked = await store.tryAcquire(fingerprint, {});
  assert(stillBlocked.ok === false, 'a non-stale PENDING lock is not reclaimed');

  // Stale now (cutoff in the future relative to when it was created).
  await store.reclaimStale(fingerprint, new Date(Date.now() + 60_000).toISOString());
  const nowFree = await store.tryAcquire(fingerprint, {});
  assert(nowFree.ok === true, 'a stale PENDING lock is reclaimed and a new acquire succeeds');
}

async function test403NoRetry() {
  console.log('\n=== simulated HTTP 403 -- no retry ===');
  const mock = mockGenerateThrowsOnce(new AIProviderError('Tabitoken gateway returned HTTP 403: forbidden', 'access_denied', { status: 403 }));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider was called exactly once', mock.callCount());
  assert(result.status === 'GENERATION_FAILED', 'result status is GENERATION_FAILED', result.status);
  assert(result.errorCategory === 'ACCESS_DENIED', 'error category is ACCESS_DENIED', result.errorCategory);
  assert(result.aiRequestAttempted === true, 'aiRequestAttempted is true (a request genuinely was made)');
  assert(
    result.failureReason === 'Tabitoken denied access to this request (HTTP 403). No automatic retry was attempted.',
    'failure message is specific and includes the HTTP status',
    result.failureReason,
  );
  assert(!String(result.failureReason).toLowerCase().includes('bearer'), 'failure message does not leak the Authorization header');
}

async function testTimeoutNoRetry() {
  console.log('\n=== simulated timeout -- no retry ===');
  const mock = mockGenerateThrowsOnce(new AIProviderError('Tabitoken request timed out after 240000ms.', 'timeout'));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider was called exactly once', mock.callCount());
  assert(result.status === 'GENERATION_FAILED', 'result status is GENERATION_FAILED', result.status);
  assert(result.errorCategory === 'TIMEOUT', 'error category is TIMEOUT', result.errorCategory);
  assert(
    result.failureReason === 'Tabitoken did not respond within the allotted time. No automatic retry was attempted.',
    'failure message matches the required admin-facing text',
    result.failureReason,
  );
}

async function testConfigErrorNoRequestAttempted() {
  console.log('\n=== simulated CONFIGURATION_ERROR (missing credentials) -- no request attempted ===');
  const mock = mockGenerateThrowsOnce(new AIProviderError('TABITOKEN_API_KEY is not set.', 'config_error'));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider entry point was called exactly once', mock.callCount());
  assert(result.status === 'GENERATION_FAILED', 'result status is GENERATION_FAILED', result.status);
  assert(result.errorCategory === 'CONFIGURATION_ERROR', 'error category is CONFIGURATION_ERROR', result.errorCategory);
  assert(result.aiRequestAttempted === false, 'aiRequestAttempted is FALSE -- a config error means no real HTTP request ever reached Tabitoken', result.aiRequestAttempted);
}

async function testSuccessfulFlow() {
  console.log('\n=== simulated success -- normal validation + QA flow ===');
  const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider was called exactly once', mock.callCount());
  assert(result.status === 'SUCCESS', 'result status is SUCCESS', result.status);
  assert(result.validation?.valid === true, 'validation passed');
  assert(result.qa !== null, 'QA ran');
  assert(result.qa?.overall === 'PASS', 'QA overall is PASS for a clean fixture', result.qa);
  assert(result.editorialPackage?.title === 'A Test Headline', 'editorial package content came through');
  assert(result.qa?.confidence !== undefined && result.qa!.confidence > 0, 'QA computed a deterministic confidence score', result.qa?.confidence);
}

async function testMalformedResponseNoRetry() {
  console.log('\n=== simulated malformed JSON -- no retry ===');
  const mock = mockGenerateReturns('this is not JSON at all {{{');
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider was called exactly once', mock.callCount());
  assert(result.status === 'GENERATION_FAILED', 'result status is GENERATION_FAILED', result.status);
  assert(result.errorCategory === 'MALFORMED_RESPONSE', 'error category is MALFORMED_RESPONSE', result.errorCategory);
}

async function testStructurallyInvalidResponseNoRetry() {
  console.log('\n=== simulated structurally-invalid JSON (fabricated image URL) -- no retry, validation catches it ===');
  const bad = { ...VALID_PACKAGE, imageUrl: 'https://not-a-real-candidate.example.com/fake.jpg' };
  const mock = mockGenerateReturns(JSON.stringify(bad));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, 'the mocked provider was called exactly once', mock.callCount());
  assert(result.status === 'VALIDATION_FAILED', 'result status is VALIDATION_FAILED', result.status);
  assert(result.errorCategory === 'VALIDATION_FAILED', 'error category is VALIDATION_FAILED', result.errorCategory);
  assert(
    (result.validation?.issues.length ?? 0) > 0 && result.validation!.issues.some((i) => i.field === 'imageUrl'),
    'validation flags the fabricated image URL specifically',
    result.validation?.issues,
  );
}

async function main() {
  await testConfirmationGating();
  await testDuplicateLocking();
  await testStaleReclaim();
  await test403NoRetry();
  await testTimeoutNoRetry();
  await testConfigErrorNoRequestAttempted();
  await testSuccessfulFlow();
  await testMalformedResponseNoRetry();
  await testStructurallyInvalidResponseNoRetry();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
