import { useState } from 'react';
import { Article } from '../types';
import LatestStoryCard from './LatestStoryCard';
import SectionHeading from './SectionHeading';

interface LatestStoriesSectionProps {
  articles: Article[];
}

const PAGE_SIZE = 6;

export default function LatestStoriesSection({ articles }: LatestStoriesSectionProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (articles.length === 0) return null;

  const visibleArticles = articles.slice(0, visibleCount);
  const hasMore = visibleCount < articles.length;

  return (
    <section className="py-16 md:py-24 bg-reserve-bg border-t border-reserve-border">
      <div className="container mx-auto px-6">
        <SectionHeading title="Latest Stories" className="mb-12 md:mb-16" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {visibleArticles.map((article, index) => (
            <div key={article.id} className="h-full">
              <LatestStoryCard article={article} index={index} />
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-12 md:mt-16">
            <button
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="inline-flex btn-pill btn-outline"
            >
              Load More Stories
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
