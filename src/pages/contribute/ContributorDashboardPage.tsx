import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, Link as LinkIcon, Twitter, FileText, BarChart3 } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { logout } from '../../lib/supabase';

const CATEGORY_LABELS: Record<string, string> = {
  journalist: 'Journalist',
  photographer: 'Photographer',
  videographer: 'Videographer',
  other: 'Contributor',
};

// Stage 1's dashboard: just the contributor's own profile info + clearly
// -marked empty-state placeholders for what Stage 2 (submissions) and
// Stage 3 (analytics/public author card) will add here. No broken links,
// no fake data -- these sections genuinely don't exist yet.
export default function ContributorDashboardPage() {
  const { contributor } = useContributor();
  const navigate = useNavigate();

  if (!contributor) return null; // ContributorProtectedRoute already guards this; guards against a render before context settles.

  const handleLogout = async () => {
    await logout();
    navigate('/contribute');
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
          <img
            src={contributor.profilePhotoUrl}
            alt={contributor.fullName}
            className="w-32 h-32 object-cover border border-white/10 shrink-0"
          />
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-serif">{contributor.fullName}</h2>
              <span className="text-[10px] uppercase tracking-widest text-reserve-accent">{CATEGORY_LABELS[contributor.category] || contributor.category}</span>
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

        {/* Stage 2 hook-in point -- content submission list. Empty state
            only; no submission flow exists yet. */}
        <div className="bg-zinc-950/50 border border-white/5 border-dashed p-10 text-center space-y-2">
          <FileText className="mx-auto text-zinc-700" size={24} />
          <h3 className="text-sm uppercase tracking-widest text-zinc-500">Your Submissions</h3>
          <p className="text-xs text-zinc-600">Content submission opens in a future update. You'll be able to submit and track pieces here.</p>
        </div>

        {/* Stage 2/3 hook-in point -- performance analytics. */}
        <div className="bg-zinc-950/50 border border-white/5 border-dashed p-10 text-center space-y-2">
          <BarChart3 className="mx-auto text-zinc-700" size={24} />
          <h3 className="text-sm uppercase tracking-widest text-zinc-500">Analytics</h3>
          <p className="text-xs text-zinc-600">Reach and engagement stats for your published work will appear here once submissions are live.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
