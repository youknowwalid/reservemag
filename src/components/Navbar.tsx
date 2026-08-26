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

interface NavbarProps {
  /** 'hero': the homepage's own compact-glass unscrolled treatment (see
   * .glass-nav-hero in index.css) -- lets the hero image read through the
   * nav before the visitor scrolls. Scrolling still hands off to the same
   * .glass-nav every other route uses, unchanged. Every other route stays
   * on 'default' (today's transparent-unscrolled -> .glass-nav-on-scroll
   * behavior), untouched. */
  variant?: 'default' | 'hero';
}

export default function Navbar({ variant = 'default' }: NavbarProps) {
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
  // Only actually compact while variant="hero" is unscrolled -- the
  // instant the visitor scrolls, isScrolled flips this to false and the
  // nav falls straight through to the same .glass-nav every other route
  // (and the homepage itself, post-scroll) already uses.
  const isHeroCompact = variant === 'hero' && !isScrolled;
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

  // Locks background scroll for the duration the full-screen mobile menu
  // overlay is mounted (audit NAV-02) -- body's own base CSS only ever
  // locks the x-axis (`overflow-x-hidden`, for the site's normal
  // scroll-jank prevention), so without this the homepage feed underneath
  // the overlay was still scrollable. Uses the position:fixed technique
  // rather than plain `overflow-y: hidden` so it also freezes the
  // *visual* scroll position (iOS Safari can still rubber-band a
  // position:static body even with overflow hidden) and restores the
  // exact scroll offset the page was at when the menu closes.
  useEffect(() => {
    if (!isMenuOpen) return;
    const scrollY = window.scrollY;
    const { overflow, position, top, width } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo(0, scrollY);
    };
  }, [isMenuOpen]);

  return (
    <>
      <nav
        ref={navRef}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
          isScrolled ? 'glass-nav py-4' : isHeroCompact ? 'glass-nav-hero py-2.5' : 'bg-transparent py-8'
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

            {/* Site wordmark -- deliberately a styled span, not an <h1>: each
                page's own primary heading (article title, category name,
                etc.) is the page's one <h1>, and this renders on every page
                via this shared header (audit A11Y-01). Still reachable by
                screen readers as ordinary link text, just not announced as
                a heading.

                Centering + the jump to text-4xl are both deferred to lg
                (1024px) rather than md (768px): at md, this became
                absolutely centered (out of the left block's flex flow)
                in the same breakpoint step that also jumped its font size
                up, and in the ~768-900px band the container isn't yet wide
                enough for that suddenly-wider centered logo to clear the
                "Become a Contributor" link on the right (audit follow-up
                to RESP-01/RESP-02). Below lg it stays a normal shrinkable
                flex item (flex-shrink + min-w-0 + truncate all do
                something there), so it can never overlap a flex sibling;
                centering only turns on once the viewport is confirmed
                wide enough to fit it (1024px+, already verified clean). */}
            <Link to="/" className="lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex-shrink min-w-0">
              <span
                className={
                  isHeroCompact
                    ? 'text-[14px] font-medium tracking-[0.3px] text-[#f4f1ea] uppercase flex-shrink min-w-0 truncate block font-serif'
                    : 'text-lg sm:text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tighter text-reserve-text uppercase flex-shrink min-w-0 truncate block font-serif'
                }
              >
                {siteSettings?.title || 'THE RESERVE'}<span className="text-reserve-accent">.</span>
              </span>
            </Link>
          </div>

          <div className={`flex items-center flex-shrink-0 ml-4 ${isHeroCompact ? 'gap-2.5' : 'gap-2 sm:gap-3 md:gap-6'}`}>
            {showBecomeContributorCta ? (
              <Link
                to="/contribute"
                className="hidden sm:inline-flex btn-pill btn-outline !text-[9px] md:!text-[11px] !px-3 md:!px-6"
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
              className={
                isHeroCompact
                  ? 'inline-flex btn-pill btn-gold !text-[9.5px] !font-medium !py-1.5 !px-3 !rounded-[20px] !text-[#3d2e05]'
                  : 'inline-flex btn-pill btn-gold !text-[9px] md:!text-[11px] !px-3 md:!px-6'
              }
            >
              {siteSettings?.ctaButton.text || 'Get Featured'}
            </Link>
            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              className={
                isHeroCompact
                  ? 'md:hidden -mr-2.5 flex items-center justify-center w-11 h-11 hover:text-reserve-accent transition-colors'
                  : 'md:hidden -mr-2.5 flex items-center justify-center w-11 h-11 text-reserve-text hover:text-reserve-accent transition-colors'
              }
            >
              <Menu size={isHeroCompact ? 17 : 18} className={isHeroCompact ? undefined : 'sm:w-5 sm:h-5'} color={isHeroCompact ? '#f4f1ea' : undefined} />
            </button>
          </div>
        </div>
      </nav>

      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            // max-h-[100dvh] + overflow-y-auto (not h-[100dvh] + flex, the
            // old full-screen-takeover layout): the compact redesign sizes
            // to its own content -- typically far shorter than the
            // viewport -- rather than always filling it. dvh, not a plain
            // height, still caps it so on a short/landscape viewport with
            // a long category list it scrolls within itself instead of
            // extending behind Android Chrome/iOS Safari's collapsible
            // chrome (the same real bug class as the Hero fix -- see
            // scripts/test-hero-header-clearance.ts). Single scroll
            // container this time, not a flex child needing min-h-0: the
            // old two-column (list + decorative photo panel) layout is
            // gone along with the split it required.
            className="fixed inset-0 max-h-[100dvh] z-[60] bg-reserve-bg bg-opacity-95 backdrop-blur-xl overflow-y-auto"
          >
            <div className="w-full max-w-md mx-auto flex flex-col">
              <button
                onClick={() => setIsMenuOpen(false)}
                className="h-10 px-5 flex items-center gap-2 text-[#9a988f] hover:text-reserve-text transition-colors flex-shrink-0"
              >
                <X size={15} />
                <span className="text-[10px] uppercase tracking-[1.5px]">Close</span>
              </button>

              <div className="px-[22px]">
                {menuItems.map((item, i) => (
                  <motion.a
                    key={item}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    href={`#${item.toLowerCase()}`}
                    className={`group h-[38px] box-border flex items-center justify-between text-[16px] text-[#f4f1ea] hover:text-reserve-accent transition-colors ${
                      i < menuItems.length - 1 ? 'border-b border-[rgba(244,241,234,0.08)]' : ''
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item}
                    <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" size={16} />
                  </motion.a>
                ))}
              </div>

              {/* Safe-area handling deliberately isn't the shared .pb-safe
                  class here -- that forces a 2rem (32px) floor, which
                  would blow past this footer's specified 16px bottom
                  padding on non-notched devices. This adds only the real
                  inset on top of the exact 16px the design calls for. */}
              <div
                className="border-t border-[rgba(244,241,234,0.15)] px-[22px] pt-3 mt-2"
                style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
              >
                <p className="text-[9px] uppercase tracking-[1.5px] text-[#8a877c] mb-3">The Reserve Magazine</p>
                <div className="flex flex-wrap gap-[14px] text-[11px] text-[#b8b5ab]">
                  <a href={siteSettings?.socialUrls?.instagram || '#'} target="_blank" rel="noreferrer" className="hover:text-reserve-accent transition-colors">Instagram</a>
                  <a href={siteSettings?.socialUrls?.facebook || '#'} target="_blank" rel="noreferrer" className="hover:text-reserve-accent transition-colors">Facebook</a>
                  <Link to="/archive" className="hover:text-reserve-accent transition-colors">Archive</Link>
                  {showBecomeContributorCta ? (
                    // Reachable here on small screens, where the navbar's own "Become a Contributor" pill is hidden (sm:flex) for space.
                    <Link to="/contribute" className="hover:text-reserve-accent transition-colors" onClick={() => setIsMenuOpen(false)}>Become a Contributor</Link>
                  ) : (
                    <>
                      {/* Mirrors the header's ContributorAccountMenu, whose own trigger is hidden below the sm breakpoint -- same reachability reasoning as "Become a Contributor" above for a logged-out visitor. */}
                      <Link to="/contribute/dashboard" className="hover:text-reserve-accent transition-colors" onClick={() => setIsMenuOpen(false)}>Dashboard</Link>
                      <button
                        onClick={async () => { setIsMenuOpen(false); await logout(); await reloadSession(); navigate('/'); }}
                        className="hover:text-reserve-accent transition-colors"
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
