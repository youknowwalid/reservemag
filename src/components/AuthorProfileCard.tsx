import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { Contributor } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  journalist: 'Journalist',
  photographer: 'Photographer',
  videographer: 'Videographer',
  other: 'Contributor',
};

interface AuthorProfileCardProps {
  /** Reads from the unified `contributors` table -- either a real registered contributor or a migrated legacy byline entry (accountType distinguishes them, but this card doesn't need to care: it just shows whichever of category/legacyDesignation+legacyRole is populated). */
  author: Contributor;
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthorProfileCard({ author, isOpen, onClose }: AuthorProfileCardProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
          />
          
          {/* Card */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-6 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-reserve-bg border border-white/10 w-full max-w-xs p-8 flex flex-col items-center text-center shadow-2xl pointer-events-auto relative overflow-hidden"
            >
              {/* Subtle texture or accent */}
              <div className="absolute top-0 left-0 w-full h-1 bg-reserve-accent" />
              
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <div className="mb-6 relative">
                <div className="w-24 h-24 rounded-full overflow-hidden border border-white/5 grayscale hover:grayscale-0 transition-all duration-700">
                  {author.profilePhotoUrl ? (
                    <img
                      src={author.profilePhotoUrl}
                      alt={author.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700 font-serif text-2xl uppercase italic">
                      {author.fullName.charAt(0)}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-serif text-white uppercase tracking-wider mb-1">{author.fullName}</h3>
                  <div className="h-0.5 w-8 bg-reserve-accent/30 mx-auto" />
                </div>

                {/* Legacy rows carry their original designation/role text
                    verbatim (preserved by the migration); a registered
                    contributor shows their category instead -- there's no
                    "role" concept for those. */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-reserve-accent font-medium">
                    {author.accountType === 'legacy' ? author.legacyDesignation : CATEGORY_LABELS[author.category || ''] || author.category}
                  </p>
                  {author.accountType === 'legacy' && author.legacyRole && (
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 italic">
                      {author.legacyRole}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 w-full">
                <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-600 font-bold">The Reserve Editorial Board</p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
