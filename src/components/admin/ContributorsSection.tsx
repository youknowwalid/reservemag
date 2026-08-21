import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, Instagram, Twitter, Link as LinkIcon, FileText } from 'lucide-react';
import { Contributor } from '../../types';
import { contributorService } from '../../services/contributorService';

const CATEGORY_LABELS: Record<string, string> = {
  journalist: 'Journalist',
  photographer: 'Photographer',
  videographer: 'Videographer',
  other: 'Other',
};

/** Small pill distinguishing a real signed-up account from a migrated legacy byline entry -- shown in both the list and detail views so the two are never confused at a glance (per the merge_legacy_authors_into_contributors migration's verification requirement). */
function AccountTypeBadge({ accountType }: { accountType: Contributor['accountType'] }) {
  return accountType === 'legacy' ? (
    <span className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-amber-500/20 text-amber-500 bg-amber-500/5">Legacy</span>
  ) : (
    <span className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-emerald-500/20 text-emerald-500 bg-emerald-500/5">Registered</span>
  );
}

// Admin-only directory for THE RESERVE's authors -- both real
// "Become a Contributor" signups and the legacy manually-curated byline
// registry, merged into one table (migration:
// merge_legacy_authors_into_contributors). Nav-facing label is "Authors"
// (AdminPanel.tsx); this component/file/route id stay "Contributors"
// internally since renaming those too was judged riskier than necessary
// for a purely cosmetic change. RLS (see both the add_contributors and
// merge migrations) restricts reads to is_admin() or the row's own
// owner -- this component only ever runs for an authenticated admin, so
// every query here naturally returns the full directory, legacy rows
// included (they have no owner to restrict to).
export default function ContributorsSection() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Contributor | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setContributors(await contributorService.getAllContributors());
    setLoading(false);
  };

  // Server-side search (full_name/phone_number ilike) rather than
  // client-side filtering, per the spec's "search bar filtering by name
  // or phone number" -- debounced lightly so it doesn't fire on every
  // keystroke. Legacy rows have no phone_number (null), so they can only
  // ever match on name here -- expected, not a bug.
  useEffect(() => {
    const timeout = setTimeout(async () => {
      setLoading(true);
      setContributors(await contributorService.searchContributors(searchQuery));
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() above already runs the unfiltered case once on mount; this effect owns every subsequent query
  }, [searchQuery]);

  if (selected) {
    return (
      <div className="space-y-8">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs uppercase tracking-widest"
        >
          <ChevronLeft size={16} /> Back to Authors
        </button>

        <div className="flex flex-col md:flex-row gap-8 bg-zinc-900/30 border border-white/5 p-8">
          {selected.profilePhotoUrl ? (
            <img src={selected.profilePhotoUrl} alt={selected.fullName} className="w-32 h-32 object-cover border border-white/10 shrink-0" />
          ) : (
            <div className="w-32 h-32 bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center text-zinc-600 font-serif text-3xl uppercase">
              {selected.fullName.charAt(0)}
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-serif">{selected.fullName}</h2>
              <AccountTypeBadge accountType={selected.accountType} />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-reserve-accent block">
              {selected.accountType === 'legacy' ? selected.legacyDesignation || '--' : CATEGORY_LABELS[selected.category || ''] || selected.category || '--'}
            </span>
            {selected.accountType === 'legacy' && selected.legacyRole && (
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 italic block">{selected.legacyRole}</span>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-zinc-400">
              <div>Email: {selected.email || '--'}</div>
              <div>Phone: {selected.phoneNumber || '--'}</div>
              <div>Status: {selected.status}</div>
              <div>Joined: {new Date(selected.createdAt).toLocaleDateString()}</div>
            </div>
            {(selected.socialMediaUrls.instagram || selected.socialMediaUrls.twitter || selected.socialMediaUrls.website) && (
              <div className="flex items-center gap-4 pt-2">
                {selected.socialMediaUrls.instagram && (
                  <a href={selected.socialMediaUrls.instagram} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <Instagram size={16} />
                  </a>
                )}
                {selected.socialMediaUrls.twitter && (
                  <a href={selected.socialMediaUrls.twitter} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <Twitter size={16} />
                  </a>
                )}
                {selected.socialMediaUrls.website && (
                  <a href={selected.socialMediaUrls.website} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <LinkIcon size={16} />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stage 2 hook-in point -- this author's submitted content, once
            content submission exists. Placeholder only. */}
        <div className="bg-zinc-900/30 border border-white/5 border-dashed p-10 text-center space-y-2">
          <FileText className="mx-auto text-zinc-700" size={24} />
          <h3 className="text-sm uppercase tracking-widest text-zinc-500">Submitted Content</h3>
          <p className="text-xs text-zinc-600">No submission workflow exists yet -- this fills in once content submission/review ships.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif">Authors</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Registered contributors and legacy byline entries -- no vetting gate on account creation</p>
      </div>

      <div className="flex items-center gap-4 bg-zinc-900/30 p-4 border border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/50 border border-white/10 pl-12 pr-4 py-2.5 text-xs focus:outline-none focus:border-reserve-accent"
          />
        </div>
      </div>

      <div className="bg-zinc-900/30 border border-white/5 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="px-6 py-4 font-medium">Author</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Category</th>
              <th className="px-6 py-4 font-medium">Phone</th>
              <th className="px-6 py-4 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-8 h-16 bg-white/5" />
                </tr>
              ))
            ) : contributors.length > 0 ? (
              contributors.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c)} className="group hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {c.profilePhotoUrl ? (
                        <img src={c.profilePhotoUrl} className="w-10 h-10 object-cover bg-zinc-800 rounded-full" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-600 font-serif text-sm uppercase">
                          {c.fullName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium group-hover:text-reserve-accent transition-colors">{c.fullName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{c.email || '--'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <AccountTypeBadge accountType={c.accountType} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                      {c.accountType === 'legacy' ? c.legacyDesignation || '--' : CATEGORY_LABELS[c.category || ''] || c.category || '--'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-400">{c.phoneNumber || '--'}</td>
                  <td className="px-6 py-4 text-xs text-zinc-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <p className="text-sm text-zinc-500">{searchQuery ? 'No authors match that search.' : 'No authors yet.'}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
