// Turns an approved contributor Submission into an `articles` row --
// server-only (imported by server.ts's review route), and deliberately
// NOT importing articleService.ts or src/lib/supabase.ts: those use
// `import.meta.env.VITE_*`, which only Vite's browser/build pipeline
// defines. server.ts is bundled by esbuild with no import.meta.env
// shim (only process.env.NODE_ENV, see package.json's build script) --
// importing anything in that chain here would silently read undefined
// env vars at runtime. This mirrors why server-supabase.ts exists as its
// own server-safe file instead of reusing lib/supabase.ts; the actual
// insert happens through server-supabase.ts's insertArticleServer(),
// using the admin's already-verified client from verifyAdminRequest --
// see server.ts's review route.
//
// Pure and DOM/network-free (just builds a plain object), so it's
// directly unit-tested (scripts/test-submission-review.ts) without a
// real database.

import type { Contributor, ContentBlock, Submission } from '../types';

/**
 * Row -> Submission/Contributor mappers -- deliberately duplicated from
 * submissionService.ts/contributorService.ts's equivalents (same
 * server/client import-chain separation as generateSlugFromTitle above:
 * those files import src/lib/supabase.ts, which reads
 * import.meta.env.VITE_*, undefined in server.ts's esbuild bundle).
 * Only the columns server.ts's review route actually reads are mapped.
 */
export function rowToSubmission(row: Record<string, any>): Submission {
  return {
    id: row.id,
    contributorId: row.contributor_id,
    contentType: row.content_type,
    title: row.title,
    body: row.body ?? null,
    caption: row.caption ?? null,
    mediaUrls: row.media_urls ?? [],
    status: row.status,
    feedbackNote: row.feedback_note ?? null,
    publishedArticleId: row.published_article_id ?? null,
    revisionOf: row.revision_of ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToContributorForPublish(row: Record<string, any>): Contributor {
  return {
    id: row.id,
    accountType: row.account_type,
    authUserId: row.auth_user_id ?? null,
    email: row.email ?? '',
    fullName: row.full_name,
    phoneNumber: row.phone_number ?? '',
    category: row.category,
    profilePhotoUrl: row.profile_photo_url,
    bio: row.bio ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
    specialtyTags: row.specialty_tags ?? [],
    socialMediaUrls: row.social_media_urls ?? {},
    legacyDesignation: row.legacy_designation ?? null,
    legacyRole: row.legacy_role ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Same trivial slug logic as articleService.generateSlug -- duplicated intentionally (server/client code-path separation, see this file's header), not extracted into a shared import that would drag lib/supabase.ts's browser-only env access along with it. */
export function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Word-count-based estimate, same formula as EditorialGenerationPanel.tsx's estimateReadTime -- duplicated for the same server/client separation reason. Empty/whitespace-only text still returns "1 min" rather than "0 min" or NaN. */
export function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 220))} min`;
}

const DEFAULT_BLOCK_STYLE = { bold: false, italic: false, underline: false, fontSize: 'medium' as const, alignment: 'left' as const };

/**
 * Builds the `content` block array for the submission's contentType.
 * 'article': body text split into paragraph blocks (same blank-line
 * splitting EditorialGenerationPanel.tsx uses for AI-generated articles).
 * 'photo_story': every uploaded photo becomes an image block, in
 * upload order, each with its own caption if one was given. 'video':
 * the one uploaded video becomes a single video block. These are the
 * two block types added in Stage 2 specifically so this reuses the
 * existing content/RichTextRenderer pipeline instead of a parallel one
 * -- see ContentBlock's doc comment in types.ts.
 */
export function buildContentBlocks(submission: Submission): ContentBlock[] {
  if (submission.contentType === 'article') {
    const paragraphs = (submission.body || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paragraphs.map((text, index) => ({
      id: `${submission.id}-${index}`,
      type: 'paragraph' as const,
      text,
      style: DEFAULT_BLOCK_STYLE,
    }));
  }

  if (submission.contentType === 'photo_story') {
    return submission.mediaUrls.map((item, index) => ({
      id: `${submission.id}-${index}`,
      type: 'image' as const,
      url: item.url,
      caption: item.caption,
    }));
  }

  // 'video' -- exactly one media item expected (enforced at submission
  // time by the upload UI, not re-validated here -- an empty mediaUrls
  // array just produces an empty content array, matching this codebase's
  // "never throws for a missing field" convention rather than failing
  // the whole publish).
  const video = submission.mediaUrls[0];
  if (!video) return [];
  return [{ id: `${submission.id}-0`, type: 'video' as const, url: video.url, caption: video.caption ?? submission.caption ?? undefined }];
}

/**
 * The full `articles` insert payload (snake_case, matching the table's
 * actual columns -- this goes straight to insertArticleServer(), not
 * through articleService.ts's articleToRow(), for the same
 * server/client separation reason as above) for an approved submission.
 * `source: 'contributor'` and `author_id: contributor.id` are the two
 * fields that distinguish this from an admin-authored article --
 * `author_id` is the EXISTING link into the unified `contributors` table
 * (nothing new there, just reused), not a duplicate relationship.
 */
export function buildArticleRowFromSubmission(submission: Submission, contributor: Contributor): Record<string, unknown> {
  const now = new Date();
  const blocks = buildContentBlocks(submission);
  const bodyText = submission.contentType === 'article' ? submission.body || '' : '';
  const excerpt = (submission.caption || bodyText.slice(0, 220)).trim();
  const heroImageUrl = submission.mediaUrls[0]?.url || '';
  // Suffixed with a slice of the submission's own uuid (guaranteed
  // unique, unlike Date.now() alone -- two approvals processed within
  // the same millisecond, e.g. an admin clearing a queue quickly, would
  // otherwise collide on an identical slug; caught by
  // scripts/test-submission-review.ts's slug-uniqueness test). Same
  // "append a suffix to dedupe the title" precedent as
  // EditorialGenerationPanel.tsx's generateEditorialSlug, just a
  // collision-safe source for it.
  const slug = `${generateSlugFromTitle(submission.title)}-${submission.id.replace(/-/g, '').slice(0, 8)}`;

  return {
    slug,
    title: submission.title,
    excerpt,
    content: blocks,
    category: 'Culture',
    status: 'published',
    featured: false,
    author: contributor.fullName,
    author_id: contributor.id,
    source: 'contributor',
    image: { url: heroImageUrl, credit: contributor.fullName, source: '' },
    mobile_image: { url: heroImageUrl, credit: contributor.fullName, source: '' },
    mobile_crop_x: 50,
    read_time: submission.contentType === 'article' ? estimateReadTime(bodyText) : '2 min',
    date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    publish_date: now.toISOString(),
    seo: { metaTitle: submission.title, metaDescription: excerpt, socialImage: heroImageUrl },
  };
}
