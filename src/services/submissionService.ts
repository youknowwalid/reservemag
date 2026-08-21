import { supabase } from '../lib/supabase';
import { Submission, SubmissionContentType, SubmissionMediaItem } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'submissions';

function rowToSubmission(row: any): Submission {
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

export interface DraftInput {
  contentType: SubmissionContentType;
  title: string;
  body?: string;
  caption?: string;
  mediaUrls?: SubmissionMediaItem[];
  /** Set when this draft is a resubmission after a needs_revision verdict -- see Submission's revisionOf doc comment in types.ts (the original is never mutated). */
  revisionOf?: string;
}

export const submissionService = {
  /**
   * Uploads one photo/video to R2 via the contributor-gated server route
   * (server.ts's /api/contributor/submission-upload) -- the SAME R2
   * integration the Instagram banner upload uses
   * (src/services/r2StorageService.ts), not a second upload path. Client
   * -side size/type validation (src/lib/imageValidation.ts) must run
   * BEFORE calling this -- this only re-validates as a network-level
   * backstop via the server's own check, it doesn't duplicate the UX
   * gate.
   */
  async uploadMedia(file: File): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in to upload media.');

    const res = await fetch('/api/contributor/submission-upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, Authorization: `Bearer ${session.access_token}` },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Failed to upload the file (HTTP ${res.status}).`);
    return data.url as string;
  },

  /** Creates a new draft -- status defaults to 'draft' at the DB level. `contributorId` comes from the authenticated session (RLS requires it to match auth.uid() via the contributors table), never trusted from a caller-supplied value. */
  async createDraft(contributorId: string, input: DraftInput): Promise<string> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        contributor_id: contributorId,
        content_type: input.contentType,
        title: input.title,
        body: input.body ?? null,
        caption: input.caption ?? null,
        media_urls: input.mediaUrls ?? [],
        revision_of: input.revisionOf ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  },

  /** Edits a draft in place -- only works while status='draft' (RLS enforces this server-side regardless of what this function is told to do; see the add_submissions_and_notifications migration's "contributor updates own draft only" policy). */
  async updateDraft(id: string, input: Partial<DraftInput>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (input.title !== undefined) row.title = input.title;
    if (input.body !== undefined) row.body = input.body;
    if (input.caption !== undefined) row.caption = input.caption;
    if (input.mediaUrls !== undefined) row.media_urls = input.mediaUrls;
    const { error } = await supabase.from(TABLE).update(row).eq('id', id);
    if (error) throw error;
  },

  /** The one-way draft -> submitted transition. After this, RLS makes the row read-only to the contributor -- there is no code path (this function included) that can move it back to 'draft' for them. */
  async submit(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ status: 'submitted' }).eq('id', id);
    if (error) throw error;
  },

  async deleteDraft(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  /** The signed-in contributor's own submissions (RLS scopes this automatically -- passing a mismatched contributorId here would just return nothing, never another contributor's data). */
  async getOwnSubmissions(contributorId: string): Promise<Submission[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('contributor_id', contributorId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToSubmission);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, `${TABLE}/${contributorId}`);
      return [];
    }
  },

  /**
   * Admin-only in practice (RLS) -- the review queue. `filters` are
   * applied server-side so the queue doesn't need to fetch everything
   * and filter client-side. `status` accepts either one status (an
   * explicit filter -- e.g. reviewing already-decided history) or an
   * array (the queue's own default: submitted + under_review together,
   * per the brief).
   */
  async getSubmissionsForReview(filters: { status?: string | string[]; contentType?: string; contributorId?: string } = {}): Promise<Submission[]> {
    try {
      let query = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (Array.isArray(filters.status)) query = query.in('status', filters.status);
      else if (filters.status) query = query.eq('status', filters.status);
      if (filters.contentType) query = query.eq('content_type', filters.contentType);
      if (filters.contributorId) query = query.eq('contributor_id', filters.contributorId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(rowToSubmission);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  /** Approve & Publish / Reject / Request Revision -- always goes through server.ts's review route (never a direct client-side status update), since approval also has to create the published article. */
  async review(submissionId: string, action: 'approve' | 'reject' | 'revision', feedbackNote?: string): Promise<{ status: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your admin session has expired. Please sign in again.');

    const res = await fetch('/api/admin/submissions/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ submissionId, action, feedbackNote }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Failed to review this submission (HTTP ${res.status}).`);
    return data;
  },
};
