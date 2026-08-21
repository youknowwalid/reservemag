// Deterministic, network-free tests for the Stage 2 submission-review
// publish logic (src/services/submissionPublishService.ts). Run with
// `npm run test:submission-review`.
//
// What this covers: buildContentBlocks/buildArticleRowFromSubmission --
// the pure mapping from an approved Submission into the exact `articles`
// row the review route inserts (server.ts's /api/admin/submissions/review),
// for all three content types. This IS "draft -> submit -> approve"'s
// actual logic, deterministically exercised without a database.
//
// What this does NOT cover, and why: the immutability guarantee ("a
// contributor cannot edit a submitted/approved piece via any code path,
// including direct API calls") is enforced entirely by Postgres RLS
// (migration: add_submissions_and_notifications's "contributor updates
// own draft only" policy), not by application code -- there is no pure
// function to unit-test for it. It WAS verified live, at the API level,
// directly against the real database, before any application code was
// written for this stage:
//   1. Created a throwaway auth user + contributor + a draft submission.
//   2. As that contributor: draft -> submitted succeeded (1 row).
//   3. As that SAME contributor: tried to edit the now-submitted row's
//      title, AND tried to self-approve (status -> approved_published).
//      Both were silently no-op'd by RLS -- re-selecting the row
//      afterward showed the ORIGINAL title and status still
//      'submitted', proving neither attack changed anything.
//   4. As an admin: submitted -> under_review succeeded, proving the
//      admin path still works.
//   5. Cleaned up.
// This is a stronger proof than an httpclient-level test would be: the
// Supabase JS client is a thin wrapper over these exact same Postgres
// policies, so directly exercising the policy IS exercising the actual
// enforcement mechanism, not a client-side approximation of it. Not
// re-encoded as an automated script here because doing so would need a
// live network connection and would leave test rows in the real
// database on every run -- this codebase's test scripts are
// deterministic and network-free by design (see every other
// scripts/test-*.ts's own header comment), and the live proof above is
// already fully reproducible from this conversation's transcript.

import { buildContentBlocks, buildArticleRowFromSubmission, generateSlugFromTitle, estimateReadTime } from '../src/services/submissionPublishService';
import type { Submission, Contributor } from '../src/types';

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

function fakeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub_1',
    contributorId: 'contrib_1',
    contentType: 'article',
    title: 'A Test Submission',
    body: null,
    caption: null,
    mediaUrls: [],
    status: 'submitted',
    feedbackNote: null,
    publishedArticleId: null,
    revisionOf: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeContributor(overrides: Partial<Contributor> = {}): Contributor {
  return {
    id: 'contrib_1',
    accountType: 'registered',
    authUserId: 'auth_1',
    email: 'jane@example.com',
    fullName: 'Jane Contributor',
    phoneNumber: '+1-555-0100',
    category: 'journalist',
    profilePhotoUrl: 'https://example.com/jane.jpg',
    socialMediaUrls: { instagram: 'https://instagram.com/jane' },
    legacyDesignation: null,
    legacyRole: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildContentBlocks
// ---------------------------------------------------------------------------

function testArticleBlocksFromBody() {
  console.log('\n=== article submission: body text splits into paragraph blocks ===');
  const submission = fakeSubmission({ contentType: 'article', body: 'First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.' });
  const blocks = buildContentBlocks(submission);
  assert(blocks.length === 3, 'three paragraphs from the blank-line-separated body', blocks);
  assert(blocks.every((b) => b.type === 'paragraph'), 'every block is type paragraph', blocks);
  assert(blocks[0].type === 'paragraph' && blocks[0].text === 'First paragraph.', 'first block text matches', blocks[0]);
  assert(blocks[2].type === 'paragraph' && blocks[2].text === 'Third paragraph.', 'extra blank lines between paragraphs are collapsed, not producing empty blocks', blocks[2]);
}

function testArticleBlocksEmptyBody() {
  console.log('\n=== article submission: empty/missing body never throws ===');
  assert(buildContentBlocks(fakeSubmission({ contentType: 'article', body: null })).length === 0, 'null body produces zero blocks, not a crash');
  assert(buildContentBlocks(fakeSubmission({ contentType: 'article', body: '   ' })).length === 0, 'whitespace-only body produces zero blocks');
}

function testPhotoStoryBlocksFromMedia() {
  console.log('\n=== photo_story submission: every uploaded photo becomes an image block, in order, with its own caption ===');
  const submission = fakeSubmission({
    contentType: 'photo_story',
    mediaUrls: [
      { url: 'https://example.com/1.jpg', caption: 'First shot' },
      { url: 'https://example.com/2.jpg' },
      { url: 'https://example.com/3.jpg', caption: 'Last shot' },
    ],
  });
  const blocks = buildContentBlocks(submission);
  assert(blocks.length === 3, 'one image block per uploaded photo', blocks.length);
  assert(blocks.every((b) => b.type === 'image'), 'every block is type image', blocks);
  assert(blocks[0].type === 'image' && blocks[0].url === 'https://example.com/1.jpg' && blocks[0].caption === 'First shot', 'first block preserves url + caption, in upload order', blocks[0]);
  assert(blocks[1].type === 'image' && blocks[1].caption === undefined, 'a photo with no caption produces an uncaptioned block, not a crash', blocks[1]);
  assert(blocks[2].type === 'image' && blocks[2].url === 'https://example.com/3.jpg', 'order is preserved through to the last photo', blocks[2]);
}

function testVideoBlockFromMedia() {
  console.log('\n=== video submission: the one uploaded video becomes a single video block ===');
  const submission = fakeSubmission({ contentType: 'video', mediaUrls: [{ url: 'https://example.com/clip.mp4' }], caption: 'Behind the scenes' });
  const blocks = buildContentBlocks(submission);
  assert(blocks.length === 1, 'exactly one block for a video submission', blocks.length);
  assert(blocks[0].type === 'video' && blocks[0].url === 'https://example.com/clip.mp4', 'video block carries the uploaded url', blocks[0]);
  assert(blocks[0].type === 'video' && blocks[0].caption === 'Behind the scenes', 'falls back to the submission caption when the media item has none of its own', blocks[0]);
}

function testVideoBlockMissingMediaNeverThrows() {
  console.log('\n=== video submission with no uploaded media: empty content, never throws ===');
  const blocks = buildContentBlocks(fakeSubmission({ contentType: 'video', mediaUrls: [] }));
  assert(blocks.length === 0, 'no media -> zero blocks, matching this codebase\'s never-throws-on-missing-field convention');
}

// ---------------------------------------------------------------------------
// buildArticleRowFromSubmission
// ---------------------------------------------------------------------------

function testArticleRowShape() {
  console.log('\n=== buildArticleRowFromSubmission: source/author link + status, for an article submission ===');
  const submission = fakeSubmission({ contentType: 'article', title: 'Breaking: Something Happened', body: 'Paragraph one with enough words to matter here today.' });
  const contributor = fakeContributor();
  const row = buildArticleRowFromSubmission(submission, contributor);

  assert(row.source === 'contributor', 'source is tagged "contributor", distinguishing it from admin-authored articles', row.source);
  assert(row.author_id === contributor.id, 'author_id reuses the EXISTING contributors link -- not a new/duplicate relationship', row.author_id);
  assert(row.author === contributor.fullName, 'author display text matches the contributor\'s name', row.author);
  assert(row.status === 'published', 'approval makes it a real published article, not a draft', row.status);
  assert(typeof row.slug === 'string' && (row.slug as string).startsWith('breaking-something-happened'), 'slug is derived from the title', row.slug);
  assert(Array.isArray(row.content) && (row.content as unknown[]).length === 1, 'content contains the article\'s paragraph block(s)', row.content);
}

function testPhotoStoryRowUsesFirstPhotoAsHero() {
  console.log('\n=== buildArticleRowFromSubmission: photo_story uses its first photo as the hero image ===');
  const submission = fakeSubmission({
    contentType: 'photo_story',
    title: 'A Day in Pictures',
    caption: 'A photo essay.',
    mediaUrls: [{ url: 'https://example.com/hero.jpg' }, { url: 'https://example.com/second.jpg' }],
  });
  const row = buildArticleRowFromSubmission(submission, fakeContributor());
  const image = row.image as { url: string };
  assert(image.url === 'https://example.com/hero.jpg', 'hero image is the first uploaded photo', image);
  assert(row.excerpt === 'A photo essay.', 'excerpt comes from the submission caption', row.excerpt);
}

function testSlugsAreUnique() {
  console.log('\n=== buildArticleRowFromSubmission: two submissions with the same title never collide on slug ===');
  const submissionA = fakeSubmission({ id: 'a', title: 'Same Title' });
  const submissionB = fakeSubmission({ id: 'b', title: 'Same Title' });
  const rowA = buildArticleRowFromSubmission(submissionA, fakeContributor());
  const rowB = buildArticleRowFromSubmission(submissionB, fakeContributor());
  assert(rowA.slug !== rowB.slug, 'the submission-id-derived suffix prevents a slug collision between two same-titled approvals', { a: rowA.slug, b: rowB.slug });
}

function testGenerateSlugFromTitle() {
  console.log('\n=== generateSlugFromTitle: matches articleService.generateSlug\'s existing behavior ===');
  assert(generateSlugFromTitle('Hello, World!') === 'hello-world', 'punctuation stripped, spaces hyphenated', generateSlugFromTitle('Hello, World!'));
  assert(generateSlugFromTitle('  Leading And Trailing  ') === 'leading-and-trailing', 'leading/trailing whitespace collapsed', generateSlugFromTitle('  Leading And Trailing  '));
}

function testEstimateReadTime() {
  console.log('\n=== estimateReadTime: never returns 0 min, even for empty text ===');
  assert(estimateReadTime('') === '1 min', 'empty text floors at 1 min, not 0 or NaN', estimateReadTime(''));
  assert(estimateReadTime('word '.repeat(440)) === '2 min', '440 words rounds up to 2 min at the 220 wpm estimate', estimateReadTime('word '.repeat(440)));
}

async function main() {
  testArticleBlocksFromBody();
  testArticleBlocksEmptyBody();
  testPhotoStoryBlocksFromMedia();
  testVideoBlockFromMedia();
  testVideoBlockMissingMediaNeverThrows();
  testArticleRowShape();
  testPhotoStoryRowUsesFirstPhotoAsHero();
  testSlugsAreUnique();
  testGenerateSlugFromTitle();
  testEstimateReadTime();

  console.log(`\n=== SUMMARY === ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Test run crashed:', error?.message || error);
  process.exit(1);
});
