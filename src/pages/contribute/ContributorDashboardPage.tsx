import React, { useEffect, useMemo, useState } from 'react';
import { Instagram, Link as LinkIcon, Twitter, Facebook, Linkedin, BarChart3, Plus, MapPin } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { supabase } from '../../lib/supabase';
import { submissionService } from '../../services/submissionService';
import { notificationService } from '../../services/notificationService';
import { Submission } from '../../types';
import SubmissionForm from '../../components/contribute/SubmissionForm';
import SubmissionsList from '../../components/contribute/SubmissionsList';
import NotificationsList from '../../components/contribute/NotificationsList';

const CATEGORY_LABELS: Record<string, string> = {
  journalist: 'Journalist',
  photographer: 'Photographer',
  videographer: 'Videographer',
  other: 'Contributor',
};

type DashboardTab = 'overview' | 'submissions' | 'notifications';

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'notifications', label: 'Notifications' },
];

// Stage 2: real submissions + notifications, replacing Stage 1's
// placeholders. Analytics (reach/engagement stats) remains a genuine
// Stage 3 hook-in point -- nothing here fakes that data.
//
// Restructured into tabs (Overview / Submissions / Notifications) --
// Sign Out moved out of this page entirely, into the site header's
// ContributorAccountMenu (see Navbar.tsx), which is reachable from
// anywhere on the site, not just here.
export default function ContributorDashboardPage() {
  const { contributor } = useContributor();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [articleSlugsById, setArticleSlugsById] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof notificationService.getOwnNotifications>>>([]);
  const [showForm, setShowForm] = useState(false);
  const [revisionOf, setRevisionOf] = useState<Submission | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const load = async (contributorId: string) => {
    const subs = await submissionService.getOwnSubmissions(contributorId);
    setSubmissions(subs);

    // Look up slugs for approved/published submissions -- submissions
    // only stores the published article's id, not its slug (which could
    // change later), so this is resolved separately, on read.
    const publishedIds = subs.map((s) => s.publishedArticleId).filter((id): id is string => Boolean(id));
    if (publishedIds.length > 0) {
      const { data } = await supabase.from('articles').select('id, slug').in('id', publishedIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: any) => { map[row.id] = row.slug; });
      setArticleSlugsById(map);
    }

    setNotifications(await notificationService.getOwnNotifications(contributorId));
  };

  useEffect(() => {
    if (contributor) load(contributor.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the contributor identity itself changes, not on every render
  }, [contributor?.id]);

  // Real counts only -- pulled straight from `submissions`, this
  // contributor's own actual data (never estimated or fabricated; see
  // this page's header comment on Analytics below for the one section
  // that deliberately shows nothing rather than a fake number).
  const stats = useMemo(() => {
    const total = submissions.length;
    const published = submissions.filter((s) => s.status === 'approved_published').length;
    const pendingReview = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review').length;
    const needsRevision = submissions.filter((s) => s.status === 'needs_revision').length;
    return { total, published, pendingReview, needsRevision };
  }, [submissions]);

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  if (!contributor) return null; // ContributorProtectedRoute already guards this; guards against a render before context settles.

  const handleRevise = (submission: Submission) => {
    setRevisionOf(submission);
    setShowForm(true);
    setActiveTab('submissions');
  };

  const handleNewSubmission = () => {
    setRevisionOf(null);
    setShowForm(true);
    setActiveTab('submissions');
  };

  const handleFormDone = () => {
    setShowForm(false);
    setRevisionOf(null);
    load(contributor.id);
  };

  const locationLabel = [contributor.city, contributor.country].filter(Boolean).join(', ');

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-8">
        {/* "New Submission" stays reachable here regardless of which tab is active -- not buried inside the Submissions tab alone. */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-serif">Contributor Dashboard</h1>
          {!showForm && (
            <button
              onClick={handleNewSubmission}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-reserve-accent transition-colors shrink-0"
            >
              <Plus size={14} /> New Submission
            </button>
          )}
        </div>

        <div className="flex gap-8 border-b border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-4 text-[11px] uppercase tracking-widest transition-colors ${
                activeTab === tab.id ? 'text-reserve-accent' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.id === 'notifications' && unreadNotifications > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-reserve-accent text-black rounded-full align-middle">
                  {unreadNotifications}
                </span>
              )}
              {activeTab === tab.id && <span className="absolute left-0 right-0 -bottom-px h-px bg-reserve-accent" />}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-8 bg-zinc-950 border border-white/5 p-8">
              {contributor.profilePhotoUrl ? (
                <img
                  src={contributor.profilePhotoUrl}
                  alt={contributor.fullName}
                  className="w-32 h-32 object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-32 h-32 bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center text-zinc-600 font-serif text-3xl uppercase">
                  {contributor.fullName.charAt(0)}
                </div>
              )}
              <div className="space-y-3 min-w-0">
                <div>
                  <h2 className="text-xl font-serif">{contributor.fullName}</h2>
                  <span className="text-[10px] uppercase tracking-widest text-reserve-accent">{CATEGORY_LABELS[contributor.category || ''] || contributor.category}</span>
                </div>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>{contributor.email}</div>
                  <div>{contributor.phoneNumber}</div>
                  {locationLabel && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="shrink-0" /> {locationLabel}
                    </div>
                  )}
                </div>
                {contributor.bio && (
                  <p className="text-sm text-zinc-300 leading-relaxed max-w-xl">{contributor.bio}</p>
                )}
                {contributor.specialtyTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {contributor.specialtyTags.map((tag) => (
                      <span key={tag} className="px-2 py-1 border border-white/10 text-[9px] uppercase tracking-widest text-zinc-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 pt-2">
                  {contributor.socialMediaUrls.instagram && (
                    <a href={contributor.socialMediaUrls.instagram} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                      <Instagram size={16} />
                    </a>
                  )}
                  {contributor.socialMediaUrls.facebook && (
                    <a href={contributor.socialMediaUrls.facebook} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                      <Facebook size={16} />
                    </a>
                  )}
                  {contributor.socialMediaUrls.linkedin && (
                    <a href={contributor.socialMediaUrls.linkedin} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                      <Linkedin size={16} />
                    </a>
                  )}
                  {contributor.socialMediaUrls.twitter && (
                    <a href={contributor.socialMediaUrls.twitter} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                      <Twitter size={16} />
                    </a>
                  )}
                  {contributor.socialMediaUrls.website && (
                    <a href={contributor.socialMediaUrls.website} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                      <LinkIcon size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 border border-white/5">
              <div className="bg-reserve-bg p-6 text-center space-y-1">
                <div className="text-3xl font-serif">{stats.total}</div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">Total Submissions</div>
              </div>
              <div className="bg-reserve-bg p-6 text-center space-y-1">
                <div className="text-3xl font-serif text-emerald-400">{stats.published}</div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">Published</div>
              </div>
              <div className="bg-reserve-bg p-6 text-center space-y-1">
                <div className="text-3xl font-serif text-amber-400">{stats.pendingReview}</div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">Pending Review</div>
              </div>
              <div className="bg-reserve-bg p-6 text-center space-y-1">
                <div className="text-3xl font-serif text-reserve-accent">{stats.needsRevision}</div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">Needs Revision</div>
              </div>
            </div>

            {/* Stage 3 hook-in point -- performance analytics. Genuinely not built -- no fake numbers. */}
            <div className="bg-zinc-950/50 border border-white/5 border-dashed p-10 text-center space-y-2">
              <BarChart3 className="mx-auto text-zinc-700" size={24} />
              <h3 className="text-sm uppercase tracking-widest text-zinc-500">Analytics</h3>
              <p className="text-xs text-zinc-600">Reach and engagement stats for your published work will appear here in a future update.</p>
            </div>
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="space-y-4">
            {showForm && (
              <SubmissionForm
                contributorId={contributor.id}
                revisionOf={revisionOf?.id}
                onDone={handleFormDone}
                onCancel={() => { setShowForm(false); setRevisionOf(null); }}
              />
            )}

            <SubmissionsList submissions={submissions} articleSlugsById={articleSlugsById} onRevise={handleRevise} />
          </div>
        )}

        {activeTab === 'notifications' && (
          <NotificationsList notifications={notifications} onMarkedRead={() => load(contributor.id)} />
        )}
      </div>
      <Footer />
    </div>
  );
}
