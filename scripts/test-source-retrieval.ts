// Safe, permanent smoke test for the Source Retrieval Engine
// (src/services/research/). Run with `npm run test:source-retrieval`.
//
// Uses only public, real-world URLs (Wikipedia, MDN, httpbin.org status
// endpoints) plus one inline HTML fixture for the "poor markup" case,
// which is tested by calling the HTML cleaner directly -- going through
// retrieveSource() would require a localhost/private-IP target, which the
// service's SSRF protection correctly refuses to fetch (that refusal is
// exercised separately, in TEST 6).
//
// Never touches Tabitoken or any credential -- this module has nothing to
// do with the AI provider.

import { retrieveSource, retrieveSources } from '../src/services/research/sourceRetrievalService';
import { extractCleanArticle } from '../src/services/research/sourceCleaner';
import type { RetrievedSource } from '../src/services/research/sourceTypes';

function summarize(label: string, source: RetrievedSource, latencyMs?: number) {
  console.log(`\n=== ${label} ===`);
  console.log('url            :', source.url);
  console.log('status         :', source.status);
  console.log('httpStatus     :', source.httpStatus);
  console.log('errorReason    :', source.errorReason);
  console.log('title          :', source.title);
  console.log('publisher      :', source.publisher);
  console.log('author         :', source.author);
  console.log('publishedAt    :', source.publishedAt);
  console.log('canonicalUrl   :', source.canonicalUrl);
  console.log('language       :', source.language);
  console.log('wordCount      :', source.wordCount);
  console.log('truncated      :', source.truncated);
  console.log('headings       :', source.headings.length);
  console.log('images         :', source.images.length, source.images[0] ? `(first: ${source.images[0].kind} ${source.images[0].imageUrl.slice(0, 80)}...)` : '');
  console.log('ogImage        :', source.ogImage);
  console.log('fromCache      :', source.fromCache);
  console.log('articleText[0:180]:', source.articleText?.slice(0, 180));
  if (latencyMs !== undefined) console.log('latencyMs      :', latencyMs);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

const POOR_HTML_FIXTURE = `<!doctype html>
<html><head><title>Broken Page</title>
<meta property="og:title" content="A Poorly Formed Article">
</head><body>
<div class="nav">Home | About | Contact</div>
<div id=content><p>This is <b>the first</b> paragraph of a badly nested document.
<p>Unclosed tag above. This is the second paragraph, which is long enough that a
density heuristic should recognize this block as the main article body rather
than the navigation links above it or the footer boilerplate below it. Article
extraction from imperfect markup is exactly the scenario Readability and the
heuristic fallback exist to handle gracefully instead of throwing.</p>
<p>A third paragraph, also reasonably long, to make sure the extracted word
count clears the minimum threshold the retrieval service uses to decide
whether a page actually contains a readable article at all.</div>
<div class="footer">Copyright 2026. All rights reserved. Privacy Policy.</div>
</body></html>`;

async function main() {
  // TEST 1 -- a normal, well-formed article page.
  {
    const { result, latencyMs } = await timed(() => retrieveSource('https://en.wikipedia.org/wiki/Magazine'));
    summarize('TEST 1: normal article page', result, latencyMs);
  }

  // TEST 2 -- a page with strong OpenGraph metadata.
  {
    const { result, latencyMs } = await timed(() => retrieveSource('https://developer.mozilla.org/en-US/docs/Web/HTML'));
    summarize('TEST 2: OpenGraph metadata', result, latencyMs);
  }

  // TEST 3 -- a page with multiple images.
  {
    const { result, latencyMs } = await timed(() => retrieveSource('https://en.wikipedia.org/wiki/Solar_System'));
    summarize('TEST 3: multiple images', result, latencyMs);
  }

  // TEST 4 -- poor/malformed HTML, tested directly against the cleaner
  // (retrieveSource() would refuse a localhost target -- see TEST 6).
  {
    console.log('\n=== TEST 4: poor HTML (direct cleaner test) ===');
    const cleaned = extractCleanArticle(POOR_HTML_FIXTURE, 'https://example.com/broken-page');
    console.log('usedScoredExtraction:', cleaned.usedScoredExtraction);
    console.log('title          :', cleaned.title);
    console.log('wordCount      :', cleaned.wordCount);
    console.log('articleText    :', cleaned.articleText.slice(0, 200));
  }

  // TEST 5 -- a URL that reliably returns a blocking status (403).
  {
    const { result, latencyMs } = await timed(() => retrieveSource('https://httpbin.org/status/403'));
    summarize('TEST 5: blocked URL (403)', result, latencyMs);
  }

  // TEST 6 -- invalid / disallowed URLs: malformed string, non-http
  // scheme, and SSRF targets (localhost, private IP, cloud metadata IP).
  {
    console.log('\n=== TEST 6: invalid / disallowed URLs ===');
    const invalidCases = [
      'not a url',
      'ftp://example.com/file.txt',
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/',
    ];
    for (const url of invalidCases) {
      const source = await retrieveSource(url);
      console.log(`  ${JSON.stringify(url).padEnd(45)} -> status=${source.status}, reason="${source.errorReason}"`);
    }
  }

  // TEST 7 -- multiple URLs in one job, mixing success and failure.
  {
    console.log('\n=== TEST 7: multiple URLs in one job ===');
    const { result: job, latencyMs } = await timed(() =>
      retrieveSources([
        'https://en.wikipedia.org/wiki/Web_scraping',
        'https://httpbin.org/status/404',
        'not a url',
      ]),
    );
    console.log('job status      :', job.status);
    console.log('succeededCount  :', job.succeededCount);
    console.log('failedCount     :', job.failedCount);
    console.log('latencyMs       :', latencyMs);
    for (const s of job.sources) {
      console.log(`  - ${s.url} -> ${s.status}${s.title ? ` ("${s.title}")` : ''}`);
    }
  }

  // TEST 8 -- caching: same URL requested twice should miss then hit. Uses
  // a URL not touched by any earlier test in this run, so the first call
  // is guaranteed to be a genuine cache miss.
  {
    console.log('\n=== TEST 8: cache miss then cache hit ===');
    const url = 'https://en.wikipedia.org/wiki/Data_cleansing';
    const first = await timed(() => retrieveSource(url));
    const second = await timed(() => retrieveSource(url));
    console.log('first  fromCache:', first.result.fromCache, ' latencyMs:', first.latencyMs);
    console.log('second fromCache:', second.result.fromCache, ' latencyMs:', second.latencyMs);
  }

  console.log('\nAll source retrieval tests completed.');
}

main().catch((error) => {
  console.error('Source retrieval test run failed:', error?.message || error);
  process.exit(1);
});
