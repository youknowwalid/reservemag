import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ArticleListing from '../components/ArticleListing';
import { categoryService, CategoryDoc } from '../services/categoryService';
import { slugify } from '../lib/slug';

// audit NAV-01: the homepage's nine "Explore All" buttons (CategorySection.tsx)
// had no destination -- a mobile reader could never see more than the 5
// pre-selected stories per category. This is that destination.
//
// Categories have no dedicated slug column (categoryService.CategoryDoc is
// just { id, name }), so :categorySlug is matched against slugify(name)
// rather than a stored value -- same approach server.ts's SSR takes
// (getCategoryByNameSlugServer), so a direct load and a client navigation
// resolve the same URL to the same category.
export default function CategoryPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const [categories, setCategories] = useState<CategoryDoc[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    categoryService.getAllCategories().then((cats) => {
      if (!cancelled) setCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // undefined while categories are still loading, null once loaded but no
  // match was found (a typo'd or removed category), otherwise the real name.
  const categoryName = useMemo(() => {
    if (!categories) return undefined;
    return categories.find((c) => slugify(c.name) === categorySlug)?.name ?? null;
  }, [categories, categorySlug]);

  if (categoryName === undefined) {
    return (
      <div className="bg-reserve-bg min-h-screen text-reserve-text flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-reserve-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No category matches this slug -- same fallback App.tsx's own catch-all
  // route uses for any other unrecognized path.
  if (categoryName === null) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      {/* <title>/meta live inside ArticleListing -- see its doc comment. */}
      <Navbar />
      <ArticleListing
        category={categoryName}
        eyebrow="Archive"
        title={categoryName}
        metaDescription={`Every published ${categoryName} story from THE RESERVE, newest first.`}
      />
      <Footer />
    </div>
  );
}
