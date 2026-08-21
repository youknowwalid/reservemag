export type Category = string;
export type ArticleStatus = 'draft' | 'published' | 'scheduled';
export type ContentFontSize = 'small' | 'medium' | 'large' | 'xl';
export type ContentAlignment = 'left' | 'center' | 'right' | 'justify';

export interface ContentBlockStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough?: boolean;
  fontSize: ContentFontSize;
  alignment: ContentAlignment;
}

/**
 * A discriminated union, per PROJECT_ARCHITECTURE.md's "No keyword-based
 * UI logic. Rendering is driven by explicit properties in the
 * ContentBlock schema" -- image/video were added in Stage 2 (contributor
 * submissions) specifically so a photo_story/video submission publishes
 * through the SAME `articles`/`content` pipeline as a text article,
 * rather than a second parallel content system. RichTextRenderer.tsx
 * branches on `type`; RichTextEditor.tsx (the admin manual editor) only
 * ever constructs 'paragraph' blocks but must not crash when it
 * encounters the other two (e.g. reopening a contributor-approved
 * article) -- see its own handling.
 */
export type ContentBlock =
  | { id: string; type: 'paragraph'; text: string; style: ContentBlockStyle }
  | { id: string; type: 'image'; url: string; caption?: string }
  | { id: string; type: 'video'; url: string; caption?: string };

export interface Author {
  id?: string;
  name: string;
  designation: string;
  role: string;
  imageUrl?: string;
  active: boolean;
  createdAt?: any;
}

/** Single-select, confirmed with the requester rather than assumed multi-select. Matches the `contributors.category` check constraint (migration: add_contributors). */
export type ContributorCategory = 'journalist' | 'photographer' | 'videographer' | 'other';

/**
 * The single source of truth for both self-registered "Become a
 * Contributor" accounts AND the legacy manually-curated byline registry
 * (formerly `Author` above / the `authors` table, migrated in --
 * migration: merge_legacy_authors_into_contributors) -- distinguished by
 * `accountType`. Entirely separate from admin accounts
 * (`admin_users`/is_admin()) either way.
 *
 * `id` is this row's own primary key (a fresh uuid) -- NOT necessarily
 * the Supabase Auth uid. `authUserId` holds that instead, and is null
 * for legacy rows (they predate any login system and have no
 * auth.users account at all). A registered contributor's row is created
 * once, on profile completion (see contributorService.ts), with no
 * partial/draft state -- every non-legacy field is required together.
 * `status` defaults to 'active' (no vetting gate) and exists for a
 * future moderation stage that hasn't been built yet.
 */
export interface Contributor {
  id: string;
  accountType: 'legacy' | 'registered';
  /** Supabase Auth uid, or null for a legacy row (no login exists for it). */
  authUserId: string | null;
  /** Empty string for legacy rows -- they were never given an email. */
  email: string;
  fullName: string;
  /** Empty string for legacy rows. */
  phoneNumber: string;
  category: ContributorCategory | null;
  profilePhotoUrl: string | null;
  /** Keyed by platform so the public author card can render the right icon per URL without a schema change. `instagram` is required for a registered signup; every key is optional/absent for a legacy row (none had social links). */
  socialMediaUrls: {
    instagram?: string;
    twitter?: string;
    website?: string;
  };
  /** Legacy-only -- the old `authors.designation`/`authors.role` text, preserved verbatim so the existing Author Profile Card renders identically to before the migration. Always null for a registered account (category serves the equivalent purpose there). */
  legacyDesignation: string | null;
  legacyRole: string | null;
  status: string;
  createdAt: string;
}

export type SubmissionContentType = 'article' | 'photo_story' | 'video';
export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'approved_published' | 'rejected' | 'needs_revision';

/** One piece of uploaded media within a submission -- a photo (photo_story, one or more) or a video file (video, exactly one). Uploaded via r2StorageService.ts (the same R2 integration the Instagram banner upload uses), never Supabase Storage. */
export interface SubmissionMediaItem {
  url: string;
  caption?: string;
}

/**
 * A contributor's content submission. Immutable once its status leaves
 * 'draft' -- enforced by RLS (migration: add_submissions_and_notifications),
 * not just hidden in the UI; see submissionService.ts's doc comments for
 * the exact policy shape. A 'needs_revision' verdict is never edited in
 * place -- the contributor creates a fresh submission with `revisionOf`
 * pointing back at this one, so the original review history is never
 * overwritten.
 */
export interface Submission {
  id: string;
  contributorId: string;
  contentType: SubmissionContentType;
  title: string;
  /** Article body text -- only meaningful for contentType 'article'. */
  body: string | null;
  /** Caption -- only meaningful for 'photo_story'/'video' (an article's text lives in `body` instead). */
  caption: string | null;
  mediaUrls: SubmissionMediaItem[];
  status: SubmissionStatus;
  /** Required by the application layer (server.ts's review route) on reject/needs_revision -- never optional for those two verdicts. */
  feedbackNote: string | null;
  /** Set once approved -- the articles.id this became. */
  publishedArticleId: string | null;
  /** Points at the original submission this one revises, if any. */
  revisionOf: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Simple in-app read/unread notification, created only by the admin review action (never self-insertable -- see the add_submissions_and_notifications migration's RLS). */
export interface Notification {
  id: string;
  contributorId: string;
  submissionId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Article {
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  content: ContentBlock[];
  category: Category;
  status: ArticleStatus;
  featured: boolean;
  author: string;
  authorId?: string;
  /** 'admin' (Editorial/News Factory, or the manual Stories editor) or 'contributor' (published via the Stage 2 submission review workflow -- see submissionService.ts). Not to be confused with `image.source` below (an unrelated field -- that one's the photo's own credit-link URL). */
  source?: 'admin' | 'contributor';
  image: {
    url: string;
    credit: string;
    source?: string;
  };
  mobileImage?: {
    url: string;
    credit?: string;
    source?: string;
  };
  mobileCropX?: number;
  createdAt?: any;
  updatedAt?: any;
  readTime?: string;
  date?: string;
  publishDate?: any;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    socialImage?: string;
  };
}

export type MediaAsset = {
  id: string;
  url: string;
  fileName: string;
  uploadedAt: any;
  credit?: string;
  usageType?: 'cover' | 'inline' | 'social';
}

export interface FooterLink {
  label: string;
  url: string;
}

export interface SiteSettings {
  title: string;
  browserTitle?: string;
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  ctaButton: {
    text: string;
    url: string;
  };
  socialUrls: {
    facebook: string;
    instagram: string;
  };
  footerUrls: {
    [key: string]: string;
  };
  updatedAt?: any;
}

export interface Subscriber {
  id?: string;
  email: string;
  createdAt: any;
  source: string;
}

export interface HomepageConfig {
  heroArticleId: string;
  featuredArticleIds: string[]; // Exactly 6
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'writer';
}

export type FeaturedRequestStatus = 'New' | 'Contacted' | 'Closed';

export interface FeaturedRequest {
  id?: string;
  name: string;
  brand: string;
  email: string;
  whatsapp: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  industry: string;
  budget: string;
  message: string;
  status: FeaturedRequestStatus;
  createdAt: any;
}

export type VideoCategory = 
  | 'Business Leaders'
  | 'Entrepreneurs'
  | 'Sports Icons'
  | 'Fashion & Lifestyle'
  | 'Tech & Innovation'
  | 'Culture & Arts'
  | 'Exclusive Interviews';

export interface VideoInterview {
  id?: string;
  title: string;
  youtubeUrl: string;
  category: VideoCategory;
  featured: boolean;
  createdAt: any;
}
