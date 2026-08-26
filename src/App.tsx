import React, { useState, useMemo, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Helmet } from 'react-helmet-async';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MustReadSection from './components/MustReadSection';
import LatestStoriesSection from './components/LatestStoriesSection';
import CategorySection from './components/CategorySection';
import VideoSection from './components/VideoSection';
import Newsletter from './components/Newsletter';
import Footer from './components/Footer';
import AdminPanel from './components/AdminPanel';
import AdminLogin from './components/AdminLogin';
import ArticlePage from './pages/ArticlePage';
import GetFeaturedPage from './pages/GetFeaturedPage';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsOfServicePage from './pages/legal/TermsOfServicePage';
import EditorialPolicyPage from './pages/legal/EditorialPolicyPage';
import AdvertisingPage from './pages/legal/AdvertisingPage';
import LegalPage from './pages/legal/LegalPage';
import EditorialBoardPage from './pages/EditorialBoardPage';
import CategoryPage from './pages/CategoryPage';
import ArchivePage from './pages/ArchivePage';
import ContributorSignupPage from './pages/contribute/ContributorSignupPage';
import ContributorVerifyEmailPage from './pages/contribute/ContributorVerifyEmailPage';
import ContributorProfilePage from './pages/contribute/ContributorProfilePage';
import ContributorRemovedPage from './pages/contribute/ContributorRemovedPage';
import ContributorDashboardPage from './pages/contribute/ContributorDashboardPage';
import ContributorProtectedRoute from './components/contribute/ContributorProtectedRoute';
import { Article, Category, HomepageConfig } from './types';
import { SupabaseProvider, useSupabase } from './context/SupabaseContext';
import { ContributorProvider } from './context/ContributorContext';
import { articleService } from './services/articleService';
import { categoryService } from './services/categoryService';
import { settingsService } from './services/settingsService';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function GlobalMeta() {
  const { siteSettings } = useSupabase();
  if (!siteSettings) return null;
  
  return (
    <Helmet>
      <title>{siteSettings.browserTitle || siteSettings.title}</title>
      {siteSettings.faviconUrl && (
        <link rel="icon" type="image/x-icon" href={siteSettings.faviconUrl} />
      )}
    </Helmet>
  );
}

function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [config, setConfig] = useState<HomepageConfig | null>(null);
  const [categoryNames, setCategoryNames] = useState<Category[]>([]);

  // Categories are managed in the admin panel (categoryService), not
  // hardcoded here, so the homepage stays in sync with what admins configure.
  useEffect(() => {
    const unsubscribe = categoryService.subscribeToCategories((cats) => {
      setCategoryNames(cats.map((c) => c.name));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchArticles = async () => {
      setDbLoading(true);
      try {
        const homepageConfig = await settingsService.getHomepageConfig();

        const idsToFetch: string[] = [];
        if (homepageConfig?.heroArticleId) idsToFetch.push(homepageConfig.heroArticleId);
        if (homepageConfig?.featuredArticleIds?.length) {
          idsToFetch.push(...homepageConfig.featuredArticleIds);
        }

        const [configuredArticles, latestArticles] = await Promise.all([
          idsToFetch.length > 0 ? articleService.getArticlesByIds(idsToFetch) : Promise.resolve([]),
          articleService.getPublishedArticles(50) 
        ]);

        const combinedMap = new Map<string, Article>();
        configuredArticles.forEach(a => combinedMap.set(a.id as string, a));
        latestArticles.forEach(a => {
          if (!combinedMap.has(a.id as string)) combinedMap.set(a.id as string, a);
        });
        
        setArticles(Array.from(combinedMap.values()));
        setConfig(homepageConfig);
      } catch (error) {
        console.error("Home fetch error:", error);
      } finally {
        setDbLoading(false);
      }
    };

    fetchArticles();
  }, []);

  const featuredHero = useMemo(() => {
    if (config?.heroArticleId) {
      return articles.find(a => a.id === config.heroArticleId) || articles[0];
    }
    return articles.find(a => a.featured && a.status === 'published') || articles[0];
  }, [articles, config]);

  const featuredStrip = useMemo(() => {
    if (config?.featuredArticleIds?.length) {
      return articles.filter(a => config.featuredArticleIds.includes(a.id as string));
    }
    return articles.filter(a => !a.featured && a.id !== featuredHero?.id && a.status === 'published').slice(0, 6);
  }, [articles, config, featuredHero]);
  
  const publishedArticles = useMemo(() => articles.filter(a => a.status === 'published'), [articles]);

  const gridArticles = useMemo(() =>
    publishedArticles.filter(a =>
      a.id !== featuredHero?.id &&
      !featuredStrip.some(f => f.id === a.id)
    ).slice(0, 9),
  [publishedArticles, featuredHero, featuredStrip]);

  // "Must Read" spotlights the top curated article; "Latest Stories" absorbs
  // the remaining curated picks plus the rest of the recent archive, so the
  // existing HomepageConfig curation (hero + up to 6 featured picks) still
  // drives both sections without any schema changes.
  const mustReadArticle = useMemo(() => featuredStrip[0] || gridArticles[0], [featuredStrip, gridArticles]);

  const latestStoriesArticles = useMemo(() => {
    const remainingFeatured = featuredStrip.filter(a => a.id !== mustReadArticle?.id);
    const remainingGrid = gridArticles.filter(a => a.id !== mustReadArticle?.id);
    return [...remainingFeatured, ...remainingGrid];
  }, [featuredStrip, gridArticles, mustReadArticle]);

  const categorizedArticles = useMemo(() => {
    return categoryNames.map(cat => ({
      name: cat,
      items: publishedArticles.filter(a => a.category === cat).slice(0, 5)
    }));
  }, [publishedArticles, categoryNames]);

  // No blocking "Initializing Archive" gate: the shell (Navbar/Hero/
  // sections/Footer below) renders immediately on first paint, and each
  // section already degrades gracefully while articles is still empty
  // (featuredHero/mustReadArticle are undefined until the fetch resolves,
  // so their &&-guarded sections simply don't render yet; LatestStoriesSection
  // returns null for an empty list; CategorySection renders its heading
  // chrome with no lead/list articles rather than crashing). Only once
  // the fetch has actually finished (dbLoading is false) AND still
  // resolved to zero articles do we show the real empty state below --
  // otherwise this would flash "The Archive is Quiet" on every load
  // before the fetch even completes.
  if (!dbLoading && articles.length === 0) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-reserve-bg p-6">
        <div className="text-center space-y-8 max-w-lg">
          <h1 className="text-4xl md:text-6xl font-serif">The Archive is Quiet.</h1>
          <p className="text-zinc-500 font-light leading-relaxed">
            Our editorial board is currently curating the next generation of narratives. Please return shortly as we repopulate the collection.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 border border-white/10 hover:bg-white/5 transition-all text-[10px] uppercase tracking-[0.2em]"
          >
            Refresh Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-reserve-bg text-reserve-text overflow-x-hidden selection:bg-reserve-accent selection:text-reserve-bg">
      <Navbar variant="hero" />
      <main>
        {featuredHero && <Hero article={featuredHero} />}
        {mustReadArticle && <MustReadSection article={mustReadArticle} />}
        <LatestStoriesSection articles={latestStoriesArticles} />
        <VideoSection />
        <div className="space-y-0">
          {categorizedArticles.map((cat) => (
            <CategorySection 
              key={cat.name} 
              category={cat.name} 
              articles={cat.items} 
            />
          ))}
        </div>
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useSupabase();

  if (loading) return (
    <div className="h-screen w-full bg-black flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
    </div>
  );

  if (!user || !isAdmin) return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <SupabaseProvider>
      <ContributorProvider>
        {/* Respects prefers-reduced-motion for every motion/react animation in the tree */}
        <MotionConfig reducedMotion="user">
        <GlobalMeta />
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            {/* "Become a Contributor" -- a separate, public-facing auth
                system from admin above. ContributorProvider (not
                SupabaseContext's isAdmin) drives access here; see
                ContributorProtectedRoute's doc comment. */}
            <Route path="/contribute" element={<ContributorSignupPage />} />
            <Route path="/contribute/verify-email" element={<ContributorVerifyEmailPage />} />
            <Route path="/contribute/profile" element={<ContributorProfilePage />} />
            <Route path="/contribute/removed" element={<ContributorRemovedPage />} />
            <Route
              path="/contribute/dashboard"
              element={
                <ContributorProtectedRoute>
                  <ContributorDashboardPage />
                </ContributorProtectedRoute>
              }
            />
            <Route path="/get-featured" element={<GetFeaturedPage />} />
            {/* Public, unauthenticated -- linked ONLY from the footer (Footer.tsx). */}
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms-of-service" element={<TermsOfServicePage />} />
            <Route path="/editorial-policy" element={<EditorialPolicyPage />} />
            <Route path="/advertising" element={<AdvertisingPage />} />
            <Route path="/legal" element={<LegalPage />} />
            {/* Unlike the three static pages above, this one's "Board Members" section is admin-managed and dynamic -- see EditorialBoardPage.tsx. */}
            <Route path="/editorial-board" element={<EditorialBoardPage />} />
            {/* Real destinations for the homepage's "Explore All" buttons (CategorySection.tsx) and the footer/mobile-menu's "Digital Archive" / "Archive" links -- both previously pointed nowhere functional. */}
            <Route path="/category/:categorySlug" element={<CategoryPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/:slug" element={<ArticlePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
        </MotionConfig>
      </ContributorProvider>
    </SupabaseProvider>
  );
}
