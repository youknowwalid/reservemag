// Deterministic, network-free tests for the simplified editorial AI
// request/response pipeline: plain-text JSON extraction (no
// `response_format` dependency), full provider error classification, the
// no-retry guarantee, and the PENDING -> RUNNING -> terminal database
// state flow. Run with `npm run test:editorial-provider`.
//
// NEVER calls the real Tabitoken API -- every provider response below is
// a hand-built fixture, either returned directly from a fake `generate`
// function (success/malformed-text cases) or thrown as an AIProviderError
// (HTTP-status cases, mirroring exactly what tabitokenProvider.ts throws
// for each status -- see its classifyHttpError()). Safe to run with no
// TABITOKEN_API_KEY configured at all.

import { generateEditorialPackage } from '../src/services/editorial/editorialGenerationService';
import { createInMemoryJobLockStore, computeEditorialFingerprint } from '../src/services/editorial/editorialJobLock';
import { extractJsonObject } from '../src/services/editorial/jsonExtraction';
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
const FAKE_API_KEY = 'sk-fake-test-key-should-never-appear-anywhere-downstream';

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

function mockGenerateThrows(error: Error): { fn: (options: AIGenerateOptions) => Promise<AIGenerateResult>; callCount: () => number } {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      throw error;
    },
    callCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// Part 8 -- robust JSON extraction, unit-tested directly
// ---------------------------------------------------------------------------

function testJsonExtractionShapes() {
  console.log('\n=== extractJsonObject: response shapes A-D ===');

  // A) pure JSON
  const a = extractJsonObject('{"title":"Test","article":"..."}');
  assert(a !== null && (a as any).title === 'Test', 'A) pure JSON parses', a);

  // B) JSON inside a ```json fence
  const b = extractJsonObject('```json\n{"title":"Test","article":"..."}\n```');
  assert(b !== null && (b as any).title === 'Test', 'B) fenced JSON parses', b);

  // C) JSON preceded by a short sentence
  const c = extractJsonObject('Here is the article:\n{"title":"Test","article":"..."}');
  assert(c !== null && (c as any).title === 'Test', 'C) JSON with a prefix sentence parses', c);

  // D) JSON followed by a short sentence
  const d = extractJsonObject('{"title":"Test","article":"..."}\nLet me know if you would like changes.');
  assert(d !== null && (d as any).title === 'Test', 'D) JSON with a suffix sentence parses', d);

  // JSON containing braces and punctuation inside string values -- the
  // case a naive first-{-to-last-} regex breaks on.
  const withBraces = extractJsonObject('{"title":"A {bracketed} headline, with punctuation: yes!","article":"Body {text} here."}');
  assert(withBraces !== null && (withBraces as any).title.includes('{bracketed}'), 'braces inside string values do not break extraction', withBraces);

  // Truncated / unterminated JSON -- must return null, not throw.
  const truncated = extractJsonObject('{"title":"Test","article":"unterminated');
  assert(truncated === null, 'truncated/unbalanced JSON returns null (no throw)', truncated);

  // No JSON at all.
  const none = extractJsonObject('I cannot help with that request.');
  assert(none === null, 'text with no JSON object returns null', none);
}

// ---------------------------------------------------------------------------
// Full-pipeline tests via generateEditorialPackage
// ---------------------------------------------------------------------------

async function testSuccessPlainJson() {
  console.log('\n=== SUCCESS: plain JSON text (no response_format) ===');
  const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(mock.callCount() === 1, 'provider called exactly once', mock.callCount());
  assert(result.status === 'SUCCESS', 'result status is SUCCESS', result.status);
  assert(result.qa?.confidence !== undefined, 'QA computed a confidence score');
}

async function testSuccessFencedJson() {
  console.log('\n=== SUCCESS: JSON inside a ```json fence ===');
  const mock = mockGenerateReturns('```json\n' + JSON.stringify(VALID_PACKAGE) + '\n```');
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(mock.callCount() === 1, 'provider called exactly once', mock.callCount());
  assert(result.status === 'SUCCESS', 'result status is SUCCESS despite the code fence', result.status);
}

async function testSuccessJsonWithPrefix() {
  console.log('\n=== SUCCESS: JSON with an explanatory prefix sentence ===');
  const mock = mockGenerateReturns('Here is the requested editorial package:\n\n' + JSON.stringify(VALID_PACKAGE));
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(mock.callCount() === 1, 'provider called exactly once', mock.callCount());
  assert(result.status === 'SUCCESS', 'result status is SUCCESS despite the leading sentence', result.status);
}

async function testProviderHttpError(status: number, code: 'invalid_request' | 'access_denied' | 'rate_limit' | 'provider_error', expectedCategory: string) {
  console.log(`\n=== HTTP ${status} provider error -- no retry ===`);
  const error = new AIProviderError(`Tabitoken gateway returned HTTP ${status}: simulated failure`, code, {
    status,
    responseBodySnippet: `simulated ${status} body (Authorization: Bearer ${FAKE_API_KEY} must never appear downstream)`,
  });
  const mock = mockGenerateThrows(error);
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });

  assert(mock.callCount() === 1, `provider called exactly once for HTTP ${status} (no automatic retry)`, mock.callCount());
  assert(result.status === 'GENERATION_FAILED', `result status is GENERATION_FAILED for HTTP ${status}`, result.status);
  assert(result.errorCategory === expectedCategory, `error category is ${expectedCategory} for HTTP ${status}`, result.errorCategory);
  assert(result.aiRequestAttempted === true, `aiRequestAttempted is true for HTTP ${status} (a real request was made)`);
  assert(String(result.failureReason).includes(String(status)), `failure message includes the HTTP status (${status})`, result.failureReason);
  assert(!String(result.failureReason).toLowerCase().includes('bearer'), 'failure message never contains "bearer"', result.failureReason);
  assert(!String(result.failureReason).includes(FAKE_API_KEY), 'failure message never contains the raw API key', result.failureReason);
}

async function testTimeout() {
  console.log('\n=== timeout -- no retry ===');
  const error = new AIProviderError('Tabitoken request timed out after 240000ms.', 'timeout');
  const mock = mockGenerateThrows(error);
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(mock.callCount() === 1, 'provider called exactly once for a timeout', mock.callCount());
  assert(result.errorCategory === 'TIMEOUT', 'error category is TIMEOUT', result.errorCategory);
  assert(result.aiRequestAttempted === true, 'aiRequestAttempted is true (a request was genuinely in flight)');
}

async function testMalformedJson() {
  console.log('\n=== malformed JSON in the response text -- no retry ===');
  const mock = mockGenerateReturns('I was unable to complete this request as JSON.');
  const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
  assert(mock.callCount() === 1, 'provider called exactly once for malformed output', mock.callCount());
  assert(result.status === 'GENERATION_FAILED', 'result status is GENERATION_FAILED', result.status);
  assert(result.errorCategory === 'MALFORMED_RESPONSE', 'error category is MALFORMED_RESPONSE', result.errorCategory);
  assert(result.aiRequestAttempted === true, 'aiRequestAttempted is true -- the request was made, just unusable');
}

// ---------------------------------------------------------------------------
// Database state transitions (PENDING -> RUNNING -> terminal), mirroring
// exactly what server.ts's route does, using the in-memory lock store so
// this stays network-free.
// ---------------------------------------------------------------------------

async function testDatabaseStateTransitionsOnSuccessAndFailure() {
  console.log('\n=== DB state transitions: PENDING -> RUNNING -> terminal (success and failure paths) ===');
  const store = createInMemoryJobLockStore();

  // Success path.
  {
    const input: EditorialGenerationInput = { sourceUrls: ['https://example.com/success-article'] };
    const fingerprint = computeEditorialFingerprint(input);
    const acquired = await store.tryAcquire(fingerprint, { source_urls: input.sourceUrls });
    assert(acquired.ok === true, 'PENDING row acquired before any AI call');
    if (!acquired.ok) return;
    await store.markRunning(acquired.id);

    const mock = mockGenerateReturns(JSON.stringify(VALID_PACKAGE));
    const result = await generateEditorialPackage(input, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
    await store.markTerminal(acquired.id, { generation_status: result.status });

    assert(result.status === 'SUCCESS', 'generation succeeded');
    const duplicateWhileNone = await store.tryAcquire(fingerprint, {});
    assert(duplicateWhileNone.ok === true, 'fingerprint is free again after a terminal (SUCCESS) state -- lock released correctly');
  }

  // Failure path -- the lock must still reach a terminal state (not stay
  // stuck PENDING/RUNNING forever) even when the AI call fails.
  {
    const input: EditorialGenerationInput = { sourceUrls: ['https://example.com/failure-article'] };
    const fingerprint = computeEditorialFingerprint(input);
    const acquired = await store.tryAcquire(fingerprint, { source_urls: input.sourceUrls });
    assert(acquired.ok === true, 'PENDING row acquired before the (about to fail) AI call');
    if (!acquired.ok) return;
    await store.markRunning(acquired.id);

    const mock = mockGenerateThrows(new AIProviderError('Tabitoken gateway returned HTTP 500: internal error', 'provider_error', { status: 500 }));
    const result = await generateEditorialPackage(input, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
    await store.markTerminal(acquired.id, { generation_status: result.status, error_category: result.errorCategory, failure_reason: result.failureReason });

    assert(result.status === 'GENERATION_FAILED', 'generation failed as expected');
    const duplicateAfterFailure = await store.tryAcquire(fingerprint, {});
    assert(duplicateAfterFailure.ok === true, 'fingerprint is free again after a terminal (GENERATION_FAILED) state -- a failed job does not permanently block retrying');
  }
}

// ---------------------------------------------------------------------------
// Frontend-safe error handling: every failure message this pipeline can
// produce must be a clean sentence, never a raw stack trace or credential.
// ---------------------------------------------------------------------------

async function testAllFailureMessagesAreSafe() {
  console.log('\n=== every failure message is frontend-safe (no stack traces, no credentials) ===');
  const scenarios: Array<{ label: string; error: Error }> = [
    { label: '400', error: new AIProviderError('x', 'invalid_request', { status: 400, responseBodySnippet: `key=${FAKE_API_KEY}` }) },
    { label: '401', error: new AIProviderError('x', 'authentication_error', { status: 401 }) },
    { label: '403', error: new AIProviderError('x', 'access_denied', { status: 403 }) },
    { label: '404 model', error: new AIProviderError('x', 'model_error', { status: 404 }) },
    { label: '429', error: new AIProviderError('x', 'rate_limit', { status: 429 }) },
    { label: '500', error: new AIProviderError('x', 'provider_error', { status: 500 }) },
    { label: 'network', error: new AIProviderError('x', 'network_error') },
    { label: 'config', error: new AIProviderError('x', 'config_error') },
    { label: 'unclassified JS error', error: new TypeError('some internal bug') },
  ];

  for (const { label, error } of scenarios) {
    const mock = mockGenerateThrows(error);
    const result = await generateEditorialPackage(baseInput, { generate: mock.fn, retrieveSources: fakeRetrieveSourcesSuccess() });
    const reason = String(result.failureReason ?? '');
    assert(reason.length > 0 && reason.length < 300, `[${label}] failure message is a short, present sentence`, reason);
    assert(!reason.includes('at '), `[${label}] failure message contains no stack-trace-like text`, reason);
    assert(!reason.toLowerCase().includes('bearer') && !reason.includes(FAKE_API_KEY), `[${label}] failure message never leaks credentials`, reason);
    assert(result.errorCategory !== null, `[${label}] a structured error category was assigned`, result.errorCategory);
  }
}

async function main() {
  testJsonExtractionShapes();
  await testSuccessPlainJson();
  await testSuccessFencedJson();
  await testSuccessJsonWithPrefix();
  await testProviderHttpError(400, 'invalid_request', 'INVALID_REQUEST');
  await testProviderHttpError(403, 'access_denied', 'ACCESS_DENIED');
  await testProviderHttpError(429, 'rate_limit', 'RATE_LIMIT');
  await testProviderHttpError(500, 'provider_error', 'PROVIDER_ERROR');
  await testTimeout();
  await testMalformedJson();
  await testDatabaseStateTransitionsOnSuccessAndFailure();
  await testAllFailureMessagesAreSafe();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
