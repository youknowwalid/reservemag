import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ArticleCard from './ArticleCard';
import { articleService } from '../services/articleService';
import { Article } from '../types';

const PAGE_SIZE = 12;

interface ArticleListingProps {
  /** Real category name to filter by (e.g. "Fashion"), or undefined for the full archive. */
  category?: string;
  eyebrow: string;
  title: string;
  metaDescription: string;
}

// Shared "grid of cards + Load More" body used by both CategoryPage (one
// category, filtered) and ArchivePage (every category, unfiltered) --
// audit findings NAV-01 (dead "Explore All" buttons) and NAV-04 (dead
// "Digital Archive" footer link) are the same missing feature applied to
// two different scopes, so this is one implementation, not two.
//
// Re-fetches from offset 0 whenever `category` changes (CategoryPage
// mounts fresh per category since the route param changes the component
// tree's key implicitly via useParams, but this guards the same page
// instance being reused across a client-side navigation between two
// category pages too).
export default function ArticleListing({ category, eyebrow, title, metaDescription }: ArticleListingProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setArticles([]);
    setHasMore(true);

    articleService.getPublishedArticlesPage({ category, offset: 0, limit: PAGE_SIZE }).then((batch) => {
      if (cancelled) return;
      setArticles(batch);
      setHasMore(batch.length === PAGE_SIZE);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [category]);

  const loadMore = async () => {
    setLoadingMore(true);
    const batch = await articleService.getPublishedArticlesPage({ category, offset: articles.length, limit: PAGE_SIZE });
    setArticles((prev) => [...prev, ...batch]);
    setHasMore(batch.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-32">
      {/* Gated behind `!loading`, deliberately -- App.tsx's GlobalMeta also
          renders a <Helmet><title> for siteSettings.browserTitle, and
          react-helmet-async resolves conflicting tags by which Helmet
          instance most recently committed, not by tree position. On a
          fresh (non-SPA) navigation, siteSettings starts unloaded, so an
          unconditional Helmet here would mount before GlobalMeta's async
          fetch resolves and then get silently overwritten the moment it
          does. ArticlePage.tsx has the exact same hazard and the exact
          same fix -- its own <Helmet> is unreachable until `loading` is
          false too (see its `if (loading || !article) return <spinner>`).
          Confirmed via document.title polling across a fresh load. */}
      {!loading && (
        <Helmet>
          <title>{`${title} | THE RESERVE`}</title>
          <meta name="description" content={metaDescription} />
        </Helmet>
      )}
      <div className="mb-16">
        <span className="text-[11px] uppercase tracking-[0.4em] text-reserve-accent mb-2 block">{eyebrow}</span>
        <h1 className="text-5xl md:text-7xl font-serif">{title}</h1>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-4 py-32">
          <div className="w-12 h-12 border-4 border-reserve-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-600">Loading Stories</p>
        </div>
      ) : articles.length === 0 ? (
        <p className="text-zinc-400 leading-relaxed max-w-lg">
          {category ? `No published stories in ${category} yet. Check back soon.` : 'No published stories yet. Check back soon.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-20">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-24">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-10 py-4 border border-reserve-border hover:border-reserve-accent hover:bg-white/5 transition-all text-[11px] uppercase tracking-[0.3em] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
