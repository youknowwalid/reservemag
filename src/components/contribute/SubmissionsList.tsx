import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Submission } from '../../types';

const STATUS_STYLES: Record<Submission['status'], string> = {
  draft: 'border-zinc-500/20 text-zinc-500 bg-zinc-500/5',
  submitted: 'border-cyan-500/20 text-cyan-500 bg-cyan-500/5',
  under_review: 'border-amber-500/20 text-amber-500 bg-amber-500/5',
  approved_published: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5',
  rejected: 'border-rose-500/20 text-rose-500 bg-rose-500/5',
  needs_revision: 'border-amber-500/20 text-amber-500 bg-amber-500/5',
};

const CONTENT_TYPE_LABELS: Record<Submission['contentType'], string> = {
  article: 'Article',
  photo_story: 'Photo Story',
  video: 'Video',
};

interface SubmissionsListProps {
  submissions: Submission[];
  /** slug lookup for approved_published submissions, keyed by publishedArticleId -- the dashboard fetches this separately since submissions only stores the article's id, not its (possibly-later-changed) slug. */
  articleSlugsById: Record<string, string>;
  onRevise: (submission: Submission) => void;
}

/**
 * Read-only status list -- once submitted, a submission is never
 * editable here (see submissionService.submit's doc comment; this
 * component doesn't even attempt an edit action for non-draft rows,
 * consistent with RLS actually enforcing that server-side). The only
 * action offered is "Revise" on a needs_revision item, which opens
 * SubmissionForm as a FRESH submission (revisionOf set), never an edit
 * of this one.
 */
export default function SubmissionsList({ submissions, articleSlugsById, onRevise }: SubmissionsListProps) {
  if (submissions.length === 0) {
    return <p className="text-xs text-zinc-600">No submissions yet -- use "New Submission" above to create your first one.</p>;
  }

  return (
    <div className="space-y-3">
      {submissions.map((s) => (
        <div key={s.id} className="bg-zinc-900/40 border border-white/5 p-5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">{CONTENT_TYPE_LABELS[s.contentType]}</div>
            </div>
            <span className={`px-2 py-1 text-[9px] uppercase tracking-widest border shrink-0 ${STATUS_STYLES[s.status]}`}>
              {s.status.replace('_', ' ')}
            </span>
          </div>

          {s.feedbackNote && (s.status === 'rejected' || s.status === 'needs_revision') && (
            <div className="text-xs text-zinc-400 bg-black/30 border border-white/5 p-3">
              <span className="text-zinc-500 uppercase tracking-widest text-[9px] block mb-1">Feedback</span>
              {s.feedbackNote}
            </div>
          )}

          <div className="flex items-center gap-4 pt-1">
            {s.status === 'approved_published' && s.publishedArticleId && articleSlugsById[s.publishedArticleId] && (
              <a
                href={`/${articleSlugsById[s.publishedArticleId]}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-reserve-accent hover:text-white transition-colors"
              >
                <ExternalLink size={12} /> View Live
              </a>
            )}
            {s.status === 'needs_revision' && (
              <button
                onClick={() => onRevise(s)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white hover:text-reserve-accent transition-colors"
              >
                <RefreshCw size={12} /> Submit a Revision
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
