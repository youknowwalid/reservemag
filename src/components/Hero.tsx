import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Article } from '../types';
import ResponsiveImage from './ui/ResponsiveImage';
import { articleService } from '../services/articleService';

interface HeroProps {
  article: Article;
}

export default function Hero({ article }: HeroProps) {
  const slug = article.slug || articleService.generateSlug(article.title);

  return (
    <section className="w-full bg-reserve-bg px-4 md:px-6">
      <div className="container mx-auto px-0">
        <Link to={`/${slug}`} className="block group">
          {/* min-height (not a fixed height) deliberately, same contract as
              the pre-redesign Hero (audit RESP-01/RESP-02, guarded by
              scripts/test-hero-header-clearance.ts): it can grow to fit
              content instead of forcing an overlap/clip when content needs
              more room than 90vh/100vh gives it. The content block's own
              pt-[var(--header-height)] below is what actually guarantees
              nav clearance, at any height this box ends up. */}
          <div className="relative min-h-[90vh] md:min-h-screen w-full overflow-hidden rounded-[var(--radius-card-lg)] bg-reserve-surface cursor-pointer flex flex-col justify-end">
            <motion.div
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.7 }}
              transition={{ duration: 1.5, ease: [0.2, 0, 0.2, 1] }}
              className="absolute inset-0 z-0"
            >
              <ResponsiveImage
                article={article}
                aspectRatio="h-full w-full"
                containerClassName="h-full w-full"
                imageClassName="h-full w-full"
                hoverScale={false}
              />
              {/* Steepens toward the bottom so the anchored text stays legible
                  over any photo, on every viewport. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/5" />
              {article.image?.credit && (
                <div className="absolute bottom-6 right-6 z-20 pointer-events-none hidden md:block">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-reserve-gray/50 font-mono">
                    Credit: {article.image.credit}
                  </span>
                </div>
              )}
            </motion.div>

            <div className="relative z-10 px-6 md:px-12 pt-[var(--header-height,6rem)] pb-8 md:pb-14 pb-safe short:pb-6">
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="max-w-4xl"
              >
                <div className="flex flex-wrap items-center gap-3 mb-6 short:mb-3">
                  <span className="pill-label">Exclusive {article.category}</span>
                  <span className="text-[11px] text-reserve-gray uppercase tracking-widest">{article.date}</span>
                </div>

                {/* The homepage's one <h1> (audit A11Y-01) -- unchanged from
                    the pre-redesign Hero, including its short: type scale
                    for landscape phones. */}
                <h1 className="text-5xl md:text-8xl lg:text-9xl short:text-3xl short:md:text-4xl short:lg:text-5xl font-bold leading-[0.9] tracking-tighter mb-8 short:mb-3 text-reserve-text text-balance">
                  {article.title}
                </h1>

                <p className="text-lg md:text-xl text-reserve-gray max-w-xl font-light leading-relaxed line-clamp-2 md:line-clamp-none mb-6 md:mb-8 short:hidden">
                  {article.excerpt}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="flex items-center gap-6 divide-x divide-reserve-border">
                    <div>
                      <span className="block text-[10px] uppercase text-reserve-gray tracking-widest mb-1">Author</span>
                      <span className="text-sm font-medium">{article.author || 'The Reserve Editorial'}</span>
                    </div>
                    <div className="pl-6">
                      <span className="block text-[10px] uppercase text-reserve-gray tracking-widest mb-1">Read Time</span>
                      <span className="text-sm font-medium">{article.readTime}</span>
                    </div>
                  </div>

                  <span className="inline-flex btn-pill btn-gold">
                    Read Full Story →
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
