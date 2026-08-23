import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Search, ChevronRight } from 'lucide-react';
import { useSupabase } from '../context/SupabaseContext';
import { useContributor } from '../context/ContributorContext';
import { categoryService } from '../services/categoryService';
import { logout } from '../lib/supabase';
import { shouldShowBecomeContributorCta } from '../lib/contributorRouting';
import SearchOverlay from './SearchOverlay';
import ContributorAccountMenu from './contribute/ContributorAccountMenu';

// Last-resort fallback if the categories table is ever emptied (e.g. a
// fresh/un-seeded database) so the menu never silently renders with
// nothing in it.
const FALLBACK_CATEGORIES = ['Fashion', 'Business', 'Sports', 'Cinema', 'Culture', 'Luxury'];

export default function Navbar() {
  const { siteSettings } = useSupabase();
  // `contributor` (not just a Supabase Auth session existing) is the
  // real "is this visitor already a contributor?" signal -- same one
  // ContributorDashboardPage itself gates on. It's null for a signed-out
  // visitor AND for a signed-in visitor mid-signup (unverified email, or
  // verified but profile not completed yet) -- both of whom still
  // legitimately need to see "Become a Contributor".
  const { contributor, reloadSession } = useContributor();
  const showBecomeContributorCta = shouldShowBecomeContributorCta(Boolean(contributor));
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<string[]>(FALLBACK_CATEGORIES);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Publishes the nav's real rendered height as a CSS custom property so
  // sections directly under it (Hero.tsx in particular) can reserve exact
  // clearance instead of guessing a fixed pixel value -- the nav's height
  // isn't constant: it shrinks between the scrolled/unscrolled states
  // (py-8 vs py-4) and its content wraps differently across breakpoints.
  // A stale value is harmless (Hero.tsx falls back to a sensible default
  // until the first measurement lands), so this doesn't need to be
  // perfectly synchronous with paint.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const publishHeight = () => {
      document.documentElement.style.setProperty('--header-height', `${nav.offsetHeight}px`);
    };
    publishHeight();
    const resizeObserver = new ResizeObserver(publishHeight);
    resizeObserver.observe(nav);
    window.addEventListener('resize', publishHeight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', publishHeight);
    };
  }, [isScrolled]);

  // Pulls from the same DB-backed category list the admin panel and homepage
  // use, instead of a separate hardcoded array that could drift out of sync.
  useEffect(() => {
    const unsubscribe = categoryService.subscribeToCategories((cats) => {
      setMenuItems(cats.length > 0 ? cats.map((c) => c.name) : FALLBACK_CATEGORIES);
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <nav
        ref={navRef}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
          isScrolled ? 'glass-nav py-4' : 'bg-transparent py-8'
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between relative">
          <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0 md:flex-initial">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="hidden md:flex text-reserve-text hover:text-reserve-accent transition-colors items-center gap-2 group"
            >
              <Menu size={20} />
              <span className="text-[11px] uppercase tracking-[0.2em] font-medium">Menu</span>
            </button>
            
            <div className="hidden lg:flex items-center gap-6">
              <Search 
                size={18} 
                className="text-reserve-gray cursor-pointer hover:text-reserve-text transition-colors"
                onClick={() => setIsSearchOpen(true)}
              />
            </div>

            <Link to="/" className="md:absolute md:left-1/2 md:-translate-x-1/2 flex-shrink min-w-0">
              <h1 className="text-lg sm:text-2xl md:text-4xl font-bold tracking-tighter text-reserve-text uppercase flex-shrink min-w-0 truncate">
                {siteSettings?.title || 'THE RESERVE'}<span className="text-reserve-accent">.</span>
              </h1>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 md:gap-6 flex-shrink-0 ml-4">
            {showBecomeContributorCta ? (
              <Link
                to="/contribute"
                className="hidden sm:flex items-center gap-2 px-3 sm:px-4 md:px-6 py-2 border border-reserve-border rounded-full text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest whitespace-nowrap hover:bg-reserve-text hover:text-reserve-bg transition-all duration-300 flex-shrink-0"
              >
                Become a Contributor
              </Link>
            ) : (
              <div className="hidden sm:block">
                <ContributorAccountMenu />
              </div>
            )}
            <Link
              to={siteSettings?.ctaButton.url || '/get-featured'}
              className="flex items-center gap-2 px-3 sm:px-4 md:px-6 py-2 border border-reserve-border rounded-full text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest whitespace-nowrap hover:bg-reserve-text hover:text-reserve-bg transition-all duration-300 flex-shrink-0"
            >
              {siteSettings?.ctaButton.text || 'Get Featured'}
            </Link>
            <button
              onClick={() => setIsMenuOpen(true)}
              className="md:hidden text-reserve-text hover:text-reserve-accent transition-colors p-1.5 sm:p-2"
            >
              <Menu size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </nav>

      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-reserve-bg bg-opacity-95 backdrop-blur-xl flex"
          >
            <div className="w-full lg:w-1/3 h-full border-r border-reserve-border p-12 flex flex-col justify-between">
              <div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="mb-16 text-reserve-gray hover:text-reserve-text transition-colors flex items-center gap-2"
                >
                  <X size={24} />
                  <span className="text-[11px] uppercase tracking-widest">Close</span>
                </button>

                <div className="space-y-6">
                  {menuItems.map((item, i) => (
                    <motion.a
                      key={item}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      href={`#${item.toLowerCase()}`}
                      className="group flex items-center justify-between text-3xl md:text-5xl font-serif text-reserve-text hover:text-reserve-accent transition-all pl-2 hover:pl-4"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item}
                      <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                    </motion.a>
                  ))}
                </div>
              </div>

              <div className="pb-8">
                <p className="text-[11px] text-reserve-gray uppercase tracking-widest mb-4">The Reserve Magazine</p>
                <div className="flex gap-4">
                  <a href={siteSettings?.socialUrls?.instagram || '#'} target="_blank" rel="noreferrer" className="text-xs hover:text-reserve-accent transition-colors">Instagram</a>
                  <a href={siteSettings?.socialUrls?.facebook || '#'} target="_blank" rel="noreferrer" className="text-xs hover:text-reserve-accent transition-colors">Facebook</a>
                  <Link to="/archive" className="text-xs hover:text-reserve-accent transition-colors">Archive</Link>
                  {showBecomeContributorCta ? (
                    // Reachable here on small screens, where the navbar's own "Become a Contributor" pill is hidden (sm:flex) for space.
                    <Link to="/contribute" className="text-xs hover:text-reserve-accent transition-colors" onClick={() => setIsMenuOpen(false)}>Become a Contributor</Link>
                  ) : (
                    <>
                      {/* Mirrors the header's ContributorAccountMenu, whose own trigger is hidden below the sm breakpoint -- same reachability reasoning as "Become a Contributor" above for a logged-out visitor. */}
                      <Link to="/contribute/dashboard" className="text-xs hover:text-reserve-accent transition-colors" onClick={() => setIsMenuOpen(false)}>Dashboard</Link>
                      <button
                        onClick={async () => { setIsMenuOpen(false); await logout(); await reloadSession(); navigate('/'); }}
                        className="text-xs hover:text-reserve-accent transition-colors"
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="hidden lg:block flex-1 bg-[url('https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 grayscale hover:grayscale-0 transition-all duration-1000" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
