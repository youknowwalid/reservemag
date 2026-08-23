import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, FileText, Settings, LogOut,
  ChevronRight, Shield, Layout as HomepageIcon,
  Circle, Mail, Briefcase, Video, Layers, Database,
  Newspaper, Rss, UserPlus, Inbox, Users
} from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { logout } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';

// Admin Sections
import OverviewSection from './admin/OverviewSection';
import StoriesSection from './admin/StoriesSection';
import HomepageSection from './admin/HomepageSection';
import SettingsSection from './admin/SettingsSection';
import NewsletterSection from './admin/NewsletterSection';
import LeadSection from './admin/LeadSection';
import VideoSection from './admin/VideoSection';
import CategorySection from './admin/CategorySection';
// AuthorsSection (the old standalone byline registry) is intentionally
// no longer imported/routed here -- ContributorsSection below replaced
// it (migration: merge_legacy_authors_into_contributors). The file,
// authorService.ts, and the `authors` DB table are all left completely
// untouched as a rollback path -- re-adding a nav entry for it is a
// one-line revert if ever needed.
import BulkImportSection from './admin/BulkImportSection';
import SpreadsheetImportSection from './admin/SpreadsheetImportSection';
import AIConnectionTestPanel from './admin/AIConnectionTestPanel';
import SourceRetrievalTestPanel from './admin/SourceRetrievalTestPanel';
import EditorialGenerationPanel from './admin/EditorialGenerationPanel';
import ContributorsSection from './admin/ContributorsSection';
import SubmissionsSection from './admin/SubmissionsSection';
import EditorialBoardSection from './admin/EditorialBoardSection';

export default function AdminPanel() {
  const { user } = useSupabase();
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'stories', label: 'Stories', icon: FileText },
    { id: 'editorial-factory', label: 'Editorial Factory', icon: Newspaper },
    { id: 'news-factory', label: 'News Factory', icon: Rss },
    { id: 'bulk-import', label: 'Bulk Import', icon: Database },
    { id: 'categories', label: 'Categories', icon: Layers },
    // Nav-facing label is "Authors" (final name, per decision) -- it now
    // covers both real signed-up contributors and the migrated legacy
    // byline registry. Internal id/route/component/table names stay
    // "contributors" (renaming those too would touch far more files for
    // a purely cosmetic change -- see migration:
    // merge_legacy_authors_into_contributors).
    { id: 'contributors', label: 'Authors', icon: UserPlus },
    // The site's editorial masthead (/editorial-board) -- deliberately
    // separate from "Authors" above, which is the contributor/byline
    // registry, not the board.
    { id: 'editorial-board', label: 'Editorial Board', icon: Users },
    // A review queue (what's submitted), not a people directory (who the
    // people are) -- deliberately separate from "Authors" above.
    { id: 'submissions', label: 'Submissions', icon: Inbox },
    { id: 'videos', label: 'Video Interviews', icon: Video },
    { id: 'leads', label: 'Lead Requests', icon: Briefcase },
    { id: 'newsletter', label: 'Newsletter', icon: Mail },
    { id: 'homepage', label: 'Homepage Control', icon: HomepageIcon },
    { id: 'settings', label: 'Registry Settings', icon: Settings },
  ] as const;

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <OverviewSection />;
      case 'stories': return <StoriesSection />;
      case 'editorial-factory': return (
        <div className="space-y-12">
          <EditorialGenerationPanel factoryKind="editorial" />
          <SourceRetrievalTestPanel />
        </div>
      );
      // Same generation pipeline, publish flow, and component as Editorial
      // Factory above -- only factoryKind differs, which selects the News
      // banner template and passes bannerTemplate: 'news' with the
      // generation request. See EditorialGenerationPanel.tsx's factoryKind
      // doc comment.
      case 'news-factory': return (
        <div className="space-y-12">
          <EditorialGenerationPanel factoryKind="news" />
        </div>
      );
      case 'bulk-import': return (
        <div className="space-y-12">
          <SpreadsheetImportSection />
          <AIConnectionTestPanel />
          <BulkImportSection />
        </div>
      );
      case 'categories': return <CategorySection />;
      case 'contributors': return <ContributorsSection />;
      case 'editorial-board': return <EditorialBoardSection />;
      case 'submissions': return <SubmissionsSection />;
      case 'videos': return <VideoSection />;
      case 'newsletter': return <NewsletterSection />;
      case 'leads': return <LeadSection />;
      case 'homepage': return <HomepageSection />;
      case 'settings': return <SettingsSection />;
      default: return <OverviewSection />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex font-sans">
      <aside className="w-80 border-r border-white/5 flex flex-col fixed inset-y-0 left-0 bg-zinc-950 z-20">
        <div className="p-10 border-b border-white/5">
          <h1 className="text-sm font-serif tracking-[0.3em] font-bold flex items-center gap-3">
            <Shield className="text-reserve-accent" size={16} /> RESERVE ADMIN
          </h1>
        </div>

        <nav className="flex-1 p-6 space-y-2 mt-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-6 py-4 transition-all ${
                activeTab === item.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              <item.icon size={18} className={activeTab === item.id ? 'text-reserve-accent' : 'text-inherit'} />
              <span className="text-[11px] uppercase tracking-[0.2em] font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-white/5 bg-black/40">
          <Link to="/" target="_blank" className="block w-full py-3 border border-white/10 text-[10px] text-center uppercase tracking-widest hover:bg-white/5">
            Visit Site
          </Link>
          <button onClick={handleLogout} className="w-full mt-4 py-3 text-[10px] text-zinc-500 uppercase hover:text-reserve-accent">
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-80 min-h-screen">
        <div className="p-12 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
