import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, UserCog } from 'lucide-react';
import { useContributor } from '../../context/ContributorContext';
import { logout } from '../../lib/supabase';

/**
 * Site-header account menu for an authenticated, fully-onboarded
 * contributor (Navbar renders this instead of the "Become a Contributor"
 * CTA -- see Navbar.tsx). Replaces the dashboard's old bare "Sign Out"
 * text link with a proper dropdown, triggered off the contributor's own
 * name/avatar, so Sign Out is reachable from anywhere on the site, not
 * just the dashboard.
 *
 * "Edit Profile" links to /contribute/profile -- the contributor's one
 * existing profile route. That route currently only supports FIRST-TIME
 * profile completion (resolveProfilePageRedirect bounces an
 * already-onboarded contributor straight back to the dashboard); turning
 * it into a true in-place editor is the separate, already-in-flight
 * profile-completion work this stage was explicitly told not to touch.
 * This link is wired to the correct destination now so it starts working
 * with zero changes here once that work lands.
 */
export default function ContributorAccountMenu() {
  const { contributor, reloadSession } = useContributor();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!contributor) return null;

  const handleSignOut = async () => {
    setOpen(false);
    await logout();
    // Re-reads the session from scratch immediately, rather than relying
    // solely on supabase-js's own onAuthStateChange listener -- same
    // reasoning as ContributorVerifyEmailPage's use of this (see
    // ContributorContext.tsx's doc comment on reloadSession). Matters
    // most for logout()'s own fallback path: if the network call to
    // Supabase Auth itself failed, logout() force-clears local storage
    // directly rather than through supabase-js, which never fires that
    // listener on its own.
    await reloadSession();
    navigate('/');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 pl-1 pr-2 sm:pr-3 py-1 border border-reserve-border rounded-full hover:bg-white/5 transition-colors"
      >
        {contributor.profilePhotoUrl ? (
          <img
            src={contributor.profilePhotoUrl}
            alt={contributor.fullName}
            className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center text-reserve-accent font-serif text-xs uppercase">
            {contributor.fullName.charAt(0)}
          </div>
        )}
        <span className="hidden sm:block text-[10px] uppercase tracking-widest max-w-[8rem] truncate">{contributor.fullName}</span>
        <ChevronDown size={14} className={`text-reserve-gray transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 bg-reserve-bg border border-reserve-border shadow-2xl shadow-black/50 py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-reserve-border">
            <p className="font-serif text-sm truncate">{contributor.fullName}</p>
            <p className="text-[10px] text-reserve-gray truncate mt-0.5">{contributor.email}</p>
          </div>

          <Link
            to="/contribute/dashboard"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-widest text-reserve-text hover:bg-white/5 hover:text-reserve-accent transition-colors"
          >
            <LayoutDashboard size={14} /> Dashboard
          </Link>
          <Link
            to="/contribute/profile"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-widest text-reserve-text hover:bg-white/5 hover:text-reserve-accent transition-colors"
          >
            <UserCog size={14} /> Edit Profile
          </Link>
          <button
            onClick={handleSignOut}
            role="menuitem"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-widest text-reserve-text hover:bg-white/5 hover:text-rose-400 transition-colors"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
