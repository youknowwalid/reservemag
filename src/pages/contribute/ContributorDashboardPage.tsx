import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, Link as LinkIcon, Twitter, Facebook, Linkedin, BarChart3, Plus } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { logout, supabase } from '../../lib/supabase';
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

// Stage 2: real submissions + notifications, replacing Stage 1's
// placeholders. Analytics (reach/engagement stats) remains a genuine
// Stage 3 hook-in point -- nothing here fakes that data.
export default function ContributorDashboardPage() {
  const { contributor } = useContributor();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [articleSlugsById, setArticleSlugsById] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof notificationService.getOwnNotifications>>>([]);
  const [showForm, setShowForm] = useState(false);
  const [revisionOf, setRevisionOf] = useState<Submission | null>(null);

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

  if (!contributor) return null; // ContributorProtectedRoute already guards this; guards against a render before context settles.

  const handleLogout = async () => {
    await logout();
    navigate('/contribute');
  };

  const handleRevise = (submission: Submission) => {
    setRevisionOf(submission);
    setShowForm(true);
  };

  const handleFormDone = () => {
    setShowForm(false);
    setRevisionOf(null);
    load(contributor.id);
  };

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-serif">Contributor Dashboard</h1>
          <button onClick={handleLogout} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
            Sign Out
          </button>
        </div>

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
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-serif">{contributor.fullName}</h2>
              <span className="text-[10px] uppercase tracking-widest text-reserve-accent">{CATEGORY_LABELS[contributor.category || ''] || contributor.category}</span>
            </div>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>{contributor.email}</div>
              <div>{contributor.phoneNumber}</div>
            </div>
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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-widest text-zinc-500">Notifications</h3>
          </div>
          <NotificationsList notifications={notifications} onMarkedRead={() => load(contributor.id)} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-widest text-zinc-500">Your Submissions</h3>
            {!showForm && (
              <button
                onClick={() => { setRevisionOf(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-reserve-accent transition-colors"
              >
                <Plus size={14} /> New Submission
              </button>
            )}
          </div>

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

        {/* Stage 3 hook-in point -- performance analytics. Genuinely not built -- no fake numbers. */}
        <div className="bg-zinc-950/50 border border-white/5 border-dashed p-10 text-center space-y-2">
          <BarChart3 className="mx-auto text-zinc-700" size={24} />
          <h3 className="text-sm uppercase tracking-widest text-zinc-500">Analytics</h3>
          <p className="text-xs text-zinc-600">Reach and engagement stats for your published work will appear here in a future update.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
