import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Article } from '../types';
import ResponsiveImage from './ui/ResponsiveImage';
import SectionHeading from './SectionHeading';
import { articleService } from '../services/articleService';

interface MustReadSectionProps {
  article: Article;
}

export default function MustReadSection({ article }: MustReadSectionProps) {
  const slug = article.slug || articleService.generateSlug(article.title);

  return (
    <section className="py-16 md:py-24 bg-reserve-bg">
      <div className="container mx-auto px-6">
        <SectionHeading title="Must Read" className="mb-12 md:mb-16" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <Link to={`/${slug}`} className="block group">
            <ResponsiveImage
              article={article}
              aspectRatio="aspect-[4/3]"
              containerClassName="rounded-[var(--radius-card-lg)] shadow-xl"
            />
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0, 0.2, 1] }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-reserve-accent mb-4 block">
              {article.category}
            </span>
            <h3 className="font-serif text-3xl md:text-5xl leading-tight mb-6 text-balance">
              {article.title}
            </h3>
            <p className="text-reserve-gray text-base md:text-lg font-light leading-relaxed mb-10 max-w-xl">
              {article.excerpt}
            </p>
            <Link to={`/${slug}`} className="inline-flex btn-pill btn-outline">
              Read Story
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
