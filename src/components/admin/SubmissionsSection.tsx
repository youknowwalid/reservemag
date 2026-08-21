import React, { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { Submission, Contributor } from '../../types';
import { submissionService } from '../../services/submissionService';
import { contributorService } from '../../services/contributorService';
import RichTextRenderer from '../ui/RichTextRenderer';
import { buildContentBlocks } from '../../services/submissionPublishService';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'queue', label: 'Queue (Submitted + Under Review)' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved_published', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_revision', label: 'Needs Revision' },
  { value: 'draft', label: 'Draft (not yet submitted)' },
];

const CONTENT_TYPE_FILTERS = [
  { value: '', label: 'All Types' },
  { value: 'article', label: 'Article' },
  { value: 'photo_story', label: 'Photo Story' },
  { value: 'video', label: 'Video' },
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'border-zinc-500/20 text-zinc-500 bg-zinc-500/5',
  submitted: 'border-cyan-500/20 text-cyan-500 bg-cyan-500/5',
  under_review: 'border-amber-500/20 text-amber-500 bg-amber-500/5',
  approved_published: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5',
  rejected: 'border-rose-500/20 text-rose-500 bg-rose-500/5',
  needs_revision: 'border-amber-500/20 text-amber-500 bg-amber-500/5',
};

// Admin review queue for contributor submissions -- separate from the
// "Authors" (contributors) directory: this is what's IN the queue, not
// who the people ARE. Approve & Publish reuses the exact same `articles`
// table/RLS/rendering pipeline Editorial/News Factory publishes to (see
// submissionPublishService.ts + server.ts's /api/admin/submissions/review
// route) -- there is no second "contributor content" storage system.
export default function SubmissionsSection() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [contributorsById, setContributorsById] = useState<Record<string, Contributor>>({});
  const [statusFilter, setStatusFilter] = useState('queue');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);

  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [showFeedbackFor, setShowFeedbackFor] = useState<'reject' | 'revision' | null>(null);

  useEffect(() => {
    contributorService.getAllContributors().then((list) => {
      const map: Record<string, Contributor> = {};
      list.forEach((c) => { map[c.id] = c; });
      setContributorsById(map);
    });
  }, []);

  const load = async () => {
    setLoading(true);
    const status = statusFilter === 'queue' ? ['submitted', 'under_review'] : statusFilter;
    const data = await submissionService.getSubmissionsForReview({
      status,
      contentType: contentTypeFilter || undefined,
      contributorId: authorFilter || undefined,
    });
    setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on mount and whenever a filter changes; load() itself reads the latest filter state each call
  }, [statusFilter, contentTypeFilter, authorFilter]);

  const runReview = async (action: 'approve' | 'reject' | 'revision') => {
    if (!selected) return;
    if ((action === 'reject' || action === 'revision') && !feedbackNote.trim()) {
      setReviewError('A feedback note is required.');
      return;
    }
    setReviewing(true);
    setReviewError(null);
    try {
      await submissionService.review(selected.id, action, feedbackNote.trim() || undefined);
      setSelected(null);
      setFeedbackNote('');
      setShowFeedbackFor(null);
      load();
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to review this submission.');
    } finally {
      setReviewing(false);
    }
  };

  if (selected) {
    const contributor = contributorsById[selected.contributorId];
    const canReview = selected.status === 'submitted' || selected.status === 'under_review';

    return (
      <div className="space-y-8">
        <button
          onClick={() => { setSelected(null); setFeedbackNote(''); setShowFeedbackFor(null); setReviewError(null); }}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs uppercase tracking-widest"
        >
          <ChevronLeft size={16} /> Back to Queue
        </button>

        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h2 className="text-2xl font-serif">{selected.title}</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-2 py-1 text-[9px] uppercase tracking-widest border ${STATUS_STYLES[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{selected.contentType.replace('_', ' ')}</span>
            </div>
          </div>
          {contributor && (
            <div className="text-right">
              <div className="text-sm font-medium">{contributor.fullName}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">{contributor.category || contributor.accountType}</div>
            </div>
          )}
        </div>

        <div className="bg-zinc-900/30 border border-white/5 p-8">
          <RichTextRenderer blocks={buildContentBlocks(selected)} />
        </div>

        {canReview && (
          <div className="bg-zinc-900/30 border border-white/5 p-6 space-y-4">
            {showFeedbackFor && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">
                  Feedback note (required for {showFeedbackFor === 'reject' ? 'rejection' : 'requesting revision'})
                </label>
                <textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  rows={3}
                  className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
                  placeholder="Explain what needs to change or why this can't be published..."
                />
              </div>
            )}
            {reviewError && <div className="text-rose-400 text-xs">{reviewError}</div>}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => runReview('approve')}
                disabled={reviewing}
                className="px-6 py-3 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
              >
                {reviewing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Approve & Publish
              </button>
              <button
                onClick={() => (showFeedbackFor === 'revision' ? runReview('revision') : setShowFeedbackFor('revision'))}
                disabled={reviewing}
                className="px-6 py-3 border border-amber-500/30 text-amber-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-amber-500/10 transition-all disabled:opacity-50"
              >
                {reviewing && showFeedbackFor === 'revision' ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Request Revision
              </button>
              <button
                onClick={() => (showFeedbackFor === 'reject' ? runReview('reject') : setShowFeedbackFor('reject'))}
                disabled={reviewing}
                className="px-6 py-3 border border-rose-500/30 text-rose-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-rose-500/10 transition-all disabled:opacity-50"
              >
                {reviewing && showFeedbackFor === 'reject' ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />} Reject
              </button>
            </div>
          </div>
        )}

        {!canReview && selected.feedbackNote && (
          <div className="bg-zinc-900/30 border border-white/5 p-6">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">Feedback given</span>
            <p className="text-sm text-zinc-300">{selected.feedbackNote}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif">Submissions</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Contributor content review queue</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-zinc-900/30 p-4 border border-white/5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-black border border-white/10 p-2.5 text-xs focus:outline-none focus:border-reserve-accent">
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)} className="bg-black border border-white/10 p-2.5 text-xs focus:outline-none focus:border-reserve-accent">
          {CONTENT_TYPE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} className="bg-black border border-white/10 p-2.5 text-xs focus:outline-none focus:border-reserve-accent">
          <option value="">All Authors</option>
          {Object.values(contributorsById).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
        </select>
      </div>

      <div className="bg-zinc-900/30 border border-white/5 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="px-6 py-4 font-medium">Title</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Author</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-8 h-16 bg-white/5" />
                </tr>
              ))
            ) : submissions.length > 0 ? (
              submissions.map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)} className="group hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <td className="px-6 py-4 text-sm font-medium group-hover:text-reserve-accent transition-colors">{s.title}</td>
                  <td className="px-6 py-4 text-[10px] uppercase tracking-widest text-zinc-400">{s.contentType.replace('_', ' ')}</td>
                  <td className="px-6 py-4 text-xs text-zinc-400">{contributorsById[s.contributorId]?.fullName || '--'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-[9px] uppercase tracking-widest border ${STATUS_STYLES[s.status]}`}>{s.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm text-zinc-500">Nothing here right now.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
