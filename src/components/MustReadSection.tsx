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
            {/* Category badge, headline color/line-height, and subtitle
                match Hero.tsx's Phase 3 refresh exactly (same outline-pill
                token, same #f7f4ec/1.18 headline treatment, same
                #d8d5cb/13.5px/1.55 subtitle) so the two sections read as
                one visual system when scrolled past, per the "unify
                without merging" call -- layout/height/CTA-variant (outline
                vs Hero's solid gold, this section's own secondary role)
                stay as they were. */}
            <span className="inline-flex items-center uppercase rounded-[20px] border border-[#D4AF37] text-[#D4AF37] text-[10.5px] tracking-[1px] px-[14px] py-[6px] mb-4">
              {article.category}
            </span>
            <h3 className="font-serif text-3xl md:text-5xl leading-[1.18] mb-6 text-balance text-[#f7f4ec]">
              {article.title}
            </h3>
            <p className="text-[13.5px] leading-[1.55] text-[#d8d5cb] font-light mb-10 max-w-xl">
              {article.excerpt}
            </p>
            <Link to={`/${slug}`} className="inline-flex btn-pill btn-outline !text-[12.5px] !font-medium !py-[11px] !px-[22px] !rounded-[24px]">
              Read Story
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
