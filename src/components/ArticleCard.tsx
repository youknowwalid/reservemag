import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Article } from '../types';
import ResponsiveImage from './ui/ResponsiveImage';
import { articleService } from '../services/articleService';

interface ArticleCardProps {
  article: Article;
}

// The uniform-grid card variant -- image, category chip, byline, read-time
// -- extracted from EditorialGrid.tsx's per-article markup (minus that
// component's isLarge/isTall grid-span logic, which is specific to its own
// homepage grid, not part of "the card" itself). This is the design the
// audit called out as already consistent across the homepage's card
// variants; CategoryPage/ArchivePage reuse it as-is rather than inventing
// a new one. EditorialGrid.tsx itself is left untouched (still has its own
// inline copy) -- out of scope here per the "don't touch the homepage's
// existing sections" guardrail.
export default function ArticleCard({ article }: ArticleCardProps) {
  const slug = article.slug || articleService.generateSlug(article.title);

  return (
    <Link to={`/${slug}`}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: [0.2, 0, 0.2, 1] }}
        className="group cursor-pointer"
      >
        <ResponsiveImage article={article} aspectRatio="mb-8 aspect-[4/5] md:aspect-[16/9]" containerClassName="shadow-xl" />

        <div>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-[10px] uppercase tracking-[0.25em] text-reserve-accent">{article.category}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-reserve-gray">{article.date}</span>
          </div>
          <h3 className="font-serif leading-tight mb-4 group-hover:text-reserve-accent transition-colors text-2xl md:text-3xl">
            {article.title}
          </h3>
          <p className="text-reserve-gray font-light leading-relaxed mb-6 line-clamp-3">{article.excerpt}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-reserve-text">By {article.author || 'The Reserve Editorial'}</span>
            <span className="text-[10px] uppercase tracking-widest text-reserve-gray">{article.readTime}</span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
