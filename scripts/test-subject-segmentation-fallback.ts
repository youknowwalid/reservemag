// Exercises subjectSegmentation.ts's fallback guarantee -- "never throws,
// always degrades cleanly to no compositing" -- against the REAL,
// shipped segmentSubject() function, not a re-implementation of its
// logic. Run with `npm run test:subject-segmentation-fallback`.
//
// This can only test the failure path, honestly: subjectSegmentation.ts
// is browser-only code (it uses `document`, `Image`, and the MediaPipe
// WASM runtime, none of which exist in Node), and this project
// deliberately does not add a jsdom/browser-emulation dependency to
// simulate them -- that's the exact dependency class that caused a real
// production outage earlier in this project's history. Plain Node's own
// absence of `document`/browser globals is used here as a genuine,
// real induced failure (not a mock), which is exactly the kind of
// failure segmentSubject() must survive (its try/catch has no way to
// distinguish "document is undefined" from "MediaPipe/WASM/network
// failed" -- both are just exceptions thrown during the same code path),
// so this is real coverage of the catch-and-fallback behavior, not a
// simulation of it. The "happy path" (successful segmentation producing
// a real cutout) genuinely requires a browser and is not covered here;
// see the final report for how that was verified instead (real WASM/
// model URL checks, real API shape verification against the installed
// package's type definitions, and manual admin-UI testing).

import { segmentSubject } from '../src/lib/subjectSegmentation';

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

async function main() {
  console.log('\n=== segmentSubject() never throws when browser APIs are unavailable ===');

  // A stand-in for an HTMLImageElement -- segmentSubject() only reads
  // .naturalWidth/.width/.height off it before browser APIs
  // (document.createElement, the dynamic MediaPipe import, etc.) are
  // reached, all of which are genuinely absent in this plain Node
  // process, so calling the real function here really does exercise its
  // catch block via a real thrown error, not a simulated one.
  const fakeImg = { naturalWidth: 800, naturalHeight: 1200, width: 800, height: 1200 } as unknown as HTMLImageElement;

  let threw = false;
  let result: HTMLCanvasElement | null = null;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    result = await segmentSubject(fakeImg);
  } catch {
    threw = true;
  } finally {
    console.warn = originalWarn;
  }

  assert(!threw, 'segmentSubject() did not throw despite every browser API being unavailable');
  assert(result === null, 'segmentSubject() returned null (the documented fallback signal)', result);
  assert(warnings.length > 0, 'a console.warn was emitted so the fallback is visible during testing/debugging', warnings);
  assert(
    warnings.some((args) => String(args[0]).includes('[Instagram Banner]')),
    'the warning is clearly attributed to this feature, not a generic/unlabeled error',
  );

  console.log('\n=== calling it twice in a row is still safe (no leaked state/crash on repeat failure) ===');
  let secondThrew = false;
  let secondResult: HTMLCanvasElement | null = null;
  try {
    secondResult = await segmentSubject(fakeImg);
  } catch {
    secondThrew = true;
  }
  assert(!secondThrew, 'a second call after a failure still does not throw');
  assert(secondResult === null, 'a second call after a failure still returns null');

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  console.log('\nNote: this suite covers the failure/fallback path only -- see this file\'s header comment for why the happy path (real segmentation) requires a browser and is not covered here.');
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
