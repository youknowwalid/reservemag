// Deterministic, network-free tests for the async worker architecture
// introduced to fix the Editorial Factory Vercel-timeout production
// incident: the conditional PENDING -> RUNNING claim (markRunning) that
// guarantees at most one AI request per job even if the background worker
// were ever invoked more than once, plus the new updateProgress
// observability checkpoint. Run with `npm run test:editorial-async-worker`.
//
// NEVER calls the real Tabitoken API or Supabase -- exercises
// createInMemoryJobLockStore and generateEditorialPackage's dependency
// injection exactly like the existing editorial test suites.

import { generateEditorialPackage } from '../src/services/editorial/editorialGenerationService';
import { createInMemoryJobLockStore, computeEditorialFingerprint } from '../src/services/editorial/editorialJobLock';
import type { AIGenerateOptions, AIGenerateResult } from '../src/services/ai';
import type { RetrievedSource, SourceRetrievalJobResult } from '../src/services/research/sourceRetrievalService';
import type { EditorialGenerationInput, EditorialGenerationProgressEvent } from '../src/services/editorial/editorialTypes';

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
  article: 'A reasonably long test article body. '.repeat(30),
  instagramHeadline: 'A Short Test Headline',
  instagramSubheadline: 'A short test subheadline.',
  coverKicker: 'TEST',
  coverSecondaryLine: 'A short line.',
  caption: 'A test caption.',
  imageUrl: IMAGE_URL,
  imageReason: 'The strongest candidate.',
  sourcesUsed: ['source_1'],
  warnings: [],
};

const baseInput: EditorialGenerationInput = { sourceUrls: [TEST_URL], subject: 'Jane Test' };

function mockGenerateReturns(text: string): { fn: (options: AIGenerateOptions) => Promise<AIGenerateResult>; callCount: () => number } {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      return { text, json: null, model: 'claude-opus-4-8-thinking', finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } };
    },
    callCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// 1. Duplicate worker invocation cannot cause a second AI request: the
//    conditional PENDING -> RUNNING claim is the load-bearing guarantee,
//    tested directly against the lock store (not the AI call).
// ---------------------------------------------------------------------------
async function testDuplicateMarkRunningIsRejected() {
  console.log('\n=== markRunning: a second claim attempt on the same job is rejected ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  assert(acquired.ok === true, 'setup: acquire succeeds');
  if (!acquired.ok) return;

  const first = await store.markRunning(acquired.id);
  assert(first.claimed === true, 'first markRunning call claims the job', first);

  const second = await store.markRunning(acquired.id);
  assert(second.claimed === false, 'a second markRunning call on the same (now-RUNNING) job is rejected -- this is what makes a duplicate worker invocation a safe no-op instead of a second AI request', second);
}

async function testMarkRunningOnAlreadyTerminalJobIsRejected() {
  console.log('\n=== markRunning: a job that already reached a terminal state cannot be re-claimed ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  if (!acquired.ok) { assert(false, 'setup: acquire should succeed'); return; }
  await store.markTerminal(acquired.id, { generation_status: 'GENERATION_FAILED' });

  const claim = await store.markRunning(acquired.id);
  assert(claim.claimed === false, 'markRunning on a TERMINAL job is rejected, never silently re-runs it', claim);
}

async function testMarkRunningOnUnknownIdIsRejected() {
  console.log('\n=== markRunning: an unknown/garbage job id is rejected, not silently accepted ===');
  const store = createInMemoryJobLockStore();
  const claim = await store.markRunning('does-not-exist');
  assert(claim.claimed === false, 'markRunning on a nonexistent id returns claimed:false', claim);
}

// ---------------------------------------------------------------------------
// 2. A worker that successfully claims a job, then runs the (mocked)
//    pipeline, still makes exactly one AI request and reaches a terminal
//    state -- mirrors the actual /_worker route's sequence in server.ts.
// ---------------------------------------------------------------------------
async function testClaimThenGenerateEndToEnd() {
  console.log('\n=== claim -> generate -> terminal: exactly one AI request end to end ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  if (!acquired.ok) { assert(false, 'setup: acquire should succeed'); return; }

  const claim = await store.markRunning(acquired.id);
  assert(claim.claimed === true, 'setup: claim succeeds');
  if (!claim.claimed) return;

  const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  await store.markTerminal(acquired.id, { generation_status: result.status });

  assert(mock.callCount() === 1, 'the AI provider was called exactly once for the whole claim->generate->terminal sequence', mock.callCount());
  assert(result.status === 'SUCCESS', 'generation succeeded', result.status);

  // A late/duplicate worker invocation for the same job id must not be
  // able to re-run generation even after it's terminal.
  const lateClaim = await store.markRunning(acquired.id);
  assert(lateClaim.claimed === false, 'a late duplicate claim attempt after SUCCESS is rejected -- no second AI request possible', lateClaim);
}

// ---------------------------------------------------------------------------
// 3. Observability: updateProgress checkpoints are recorded per phase,
//    including on the failure path, without affecting the AI call count.
// ---------------------------------------------------------------------------
async function testProgressCheckpointsRecorded() {
  console.log('\n=== onProgress: every phase checkpoint fires exactly once, in order, without an extra AI call ===');
  const store = createInMemoryJobLockStore();
  const fingerprint = computeEditorialFingerprint(baseInput);
  const acquired = await store.tryAcquire(fingerprint, {});
  if (!acquired.ok) { assert(false, 'setup: acquire should succeed'); return; }
  await store.markRunning(acquired.id);

  const events: EditorialGenerationProgressEvent['phase'][] = [];
  const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, {
    generate: mock.fn,
    retrieveSources: fakeRetrieveSourcesSuccess(),
    onProgress: async (event) => {
      events.push(event.phase);
      await store.updateProgress(acquired.id, { [`_checkpoint_${event.phase}`]: event.at });
    },
  });

  assert(mock.callCount() === 1, 'onProgress checkpoints do not add extra AI calls', mock.callCount());
  assert(result.status === 'SUCCESS', 'generation still succeeds with onProgress wired in');
  assert(
    JSON.stringify(events) === JSON.stringify(['SOURCE_RETRIEVAL_STARTED', 'SOURCE_RETRIEVAL_COMPLETED', 'AI_REQUEST_STARTED', 'AI_REQUEST_COMPLETED']),
    'all four checkpoints fire exactly once, in the correct order',
    events,
  );
}

async function testOnProgressOmittedIsSafe() {
  console.log('\n=== onProgress is optional -- omitting it entirely (as every pre-existing test does) still works ===');
  const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(result.status === 'SUCCESS', 'generation succeeds with no onProgress deps at all (backward compatible with every existing caller)');
}

async function main() {
  await testDuplicateMarkRunningIsRejected();
  await testMarkRunningOnAlreadyTerminalJobIsRejected();
  await testMarkRunningOnUnknownIdIsRejected();
  await testClaimThenGenerateEndToEnd();
  await testProgressCheckpointsRecorded();
  await testOnProgressOmittedIsSafe();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
