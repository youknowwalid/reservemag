import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Article } from '../types';
import ResponsiveImage from './ui/ResponsiveImage';
import { articleService } from '../services/articleService';

interface LatestStoryCardProps {
  article: Article;
  index?: number;
}

// Deliberately separate from the existing ArticleCard.tsx (shared by
// ArticleListing/ArticlePage's related-articles rail) rather than
// restyling it in place -- that component's card design is a settled,
// site-wide convention used well beyond the homepage, and this redesign
// is scoped to the homepage only. Same reasoning as EditorialGrid.tsx's
// own note about ArticleCard.tsx: don't ripple a homepage-specific look
// into pages this task never touched.
function formatReadTime(readTime?: string) {
  if (!readTime) return null;
  return /read/i.test(readTime) ? readTime : `${readTime} read`;
}

export default function LatestStoryCard({ article, index = 0 }: LatestStoryCardProps) {
  const slug = article.slug || articleService.generateSlug(article.title);
  const readTime = formatReadTime(article.readTime);

  return (
    <Link to={`/${slug}`} className="block group h-full">
      <motion.article
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0, 0.2, 1], delay: (index % 6) * 0.06 }}
        className="h-full flex flex-col rounded-[var(--radius-card)] border border-reserve-border bg-reserve-surface overflow-hidden transition-colors duration-300 hover:border-reserve-accent/40"
      >
        <ResponsiveImage
          article={article}
          aspectRatio="aspect-[16/10]"
          containerClassName="shrink-0"
        />

        <div className="flex flex-1 flex-col p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-reserve-accent mb-3">
            {article.category}
          </span>
          <h3 className="font-sans text-xl font-bold leading-snug text-reserve-text mb-3 group-hover:text-reserve-accent transition-colors">
            {article.title}
          </h3>
          <p className="text-sm text-reserve-gray font-light leading-relaxed line-clamp-2 mb-6">
            {article.excerpt}
          </p>

          <div className="mt-auto pt-4 border-t border-reserve-border flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-reserve-gray">
              {readTime}
            </span>
            <ArrowRight
              size={16}
              className="text-reserve-gray group-hover:text-reserve-accent group-hover:translate-x-1 transition-all"
              aria-hidden="true"
            />
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
