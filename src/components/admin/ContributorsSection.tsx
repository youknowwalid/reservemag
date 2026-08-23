import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronLeft, Instagram, Twitter, Link as LinkIcon, Facebook, Linkedin, FileText, MoreVertical, Pencil, Trash2, Loader2, X, AlertCircle, Camera } from 'lucide-react';
import { Contributor } from '../../types';
import { contributorService, AdminIdentityEditInput } from '../../services/contributorService';

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

/** Shown next to AccountTypeBadge for a contributor tombstoned via the "Delete User" action (contributorService.removeContributor()) -- so a removed entry never just silently vanishes from the table, per the brief ("you may still want to see that this person existed and was removed"). */
function RemovedBadge() {
  return <span className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-rose-500/20 text-rose-500 bg-rose-500/5">Removed</span>;
}

/**
 * Per-row "..." action menu -- Edit User / Delete User. A plain
 * absolutely-positioned dropdown (no portal/library -- this codebase has
 * no headless-ui/radix dependency, see package.json), closed by an
 * invisible full-screen click-catcher rather than a document listener,
 * same trade-off other lightweight custom dropdowns in this codebase
 * make. `stopPropagation` on the wrapping div keeps opening/using the
 * menu from also triggering the row's own onClick (which opens the
 * detail view).
 */
function RowActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 text-zinc-500 hover:text-white transition-colors"
        aria-label="Row actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-zinc-900 border border-white/10 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="w-full text-left px-4 py-3 text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Pencil size={14} /> Edit User
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full text-left px-4 py-3 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
            >
              <Trash2 size={14} /> Delete User
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "Edit User" modal -- name/profile photo/contact ONLY (email, phone),
 * per AdminIdentityEditInput's doc comment: bio/category/location/
 * specialty tags/social links stay contributor-self-service only, never
 * editable from here. Photo upload reuses contributorService's own
 * contributor-photos-bucket uploader (scoped to this contributor's own
 * `id`, not the admin's uid) -- writable by an admin thanks to the
 * admin_write_contributor_photos_bucket migration's storage policies.
 */
function EditUserModal({ contributor, onClose, onSaved }: { contributor: Contributor; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(contributor.fullName);
  const [email, setEmail] = useState(contributor.email);
  const [phoneNumber, setPhoneNumber] = useState(contributor.phoneNumber);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(contributor.profilePhotoUrl || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await contributorService.uploadProfilePhoto(file, contributor.id);
      setProfilePhotoUrl(url);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const input: AdminIdentityEditInput = {
      fullName: fullName.trim(),
      profilePhotoUrl: profilePhotoUrl.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber.trim(),
    };
    try {
      await contributorService.adminUpdateIdentity(contributor.id, input);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-zinc-950 border border-white/10 w-full max-w-md p-8 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-[0.2em] text-white">Edit User</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-900 border border-white/10 relative group shrink-0">
            {profilePhotoUrl ? (
              <img src={profilePhotoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 font-serif text-xl uppercase">{fullName.charAt(0) || '?'}</div>
            )}
            <button
              type="button"
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploading ? <Loader2 size={18} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <p className="text-[10px] text-zinc-500 flex-1">Click the photo to upload a replacement, or edit the fields below.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-black border border-white/10 p-3 text-sm outline-none focus:border-reserve-accent"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-white/10 p-3 text-sm outline-none focus:border-reserve-accent"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Phone</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full bg-black border border-white/10 p-3 text-sm outline-none focus:border-reserve-accent"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-[10px]">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-4 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex items-center gap-2 bg-white hover:bg-reserve-accent text-black px-6 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
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
// included (they have no owner to restrict to), and tombstoned
// ("removed") registered rows too -- see removeContributor's doc comment.
export default function ContributorsSection() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Contributor | null>(null);
  const [editing, setEditing] = useState<Contributor | null>(null);

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

  /**
   * "Delete User" -- a plain-language confirmation, then a tombstone
   * write, never a row DELETE (see contributorService.removeContributor's
   * doc comment). `window.confirm`, matching AuthorsSection.tsx's exact
   * destructive-action pattern elsewhere in this admin panel, not a new
   * custom dialog component.
   */
  const handleDelete = async (c: Contributor) => {
    if (c.accountType === 'legacy') return; // no login to revoke -- nothing for this action to do
    const confirmed = window.confirm(
      `This will revoke ${c.fullName}'s login access. Their name will remain on any already-published articles. This cannot be easily undone.\n\nDelete "${c.fullName}"?`,
    );
    if (!confirmed) return;
    try {
      await contributorService.removeContributor(c.id);
      if (selected?.id === c.id) setSelected(null);
      await load();
    } catch (err: any) {
      alert(err?.message || `Failed to remove "${c.fullName}".`);
    }
  };

  if (selected) {
    const isRemoved = selected.status === 'removed';
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
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-serif">{selected.fullName}</h2>
              <AccountTypeBadge accountType={selected.accountType} />
              {isRemoved && <RemovedBadge />}
              {selected.accountType === 'registered' && !isRemoved && (
                <div className="ml-auto flex items-center gap-3">
                  <button onClick={() => setEditing(selected)} className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">
                    <Pencil size={12} /> Edit User
                  </button>
                  <button onClick={() => handleDelete(selected)} className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors">
                    <Trash2 size={12} /> Delete User
                  </button>
                </div>
              )}
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
              {(selected.city || selected.country) && <div>Location: {[selected.city, selected.country].filter(Boolean).join(', ')}</div>}
            </div>
            {selected.bio && <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">{selected.bio}</p>}
            {selected.specialtyTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.specialtyTags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-white/10 text-zinc-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {(selected.socialMediaUrls.instagram || selected.socialMediaUrls.facebook || selected.socialMediaUrls.linkedin || selected.socialMediaUrls.twitter || selected.socialMediaUrls.website) && (
              <div className="flex items-center gap-4 pt-2">
                {selected.socialMediaUrls.instagram && (
                  <a href={selected.socialMediaUrls.instagram} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <Instagram size={16} />
                  </a>
                )}
                {selected.socialMediaUrls.facebook && (
                  <a href={selected.socialMediaUrls.facebook} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <Facebook size={16} />
                  </a>
                )}
                {selected.socialMediaUrls.linkedin && (
                  <a href={selected.socialMediaUrls.linkedin} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                    <Linkedin size={16} />
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

        {editing && (
          <EditUserModal
            contributor={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              // Re-fetch this one row directly rather than relying on the
              // list-reload's (stale-by-one-render) `contributors` state --
              // `load()` runs below too, so the table behind this detail
              // view is also current once the admin goes back to it.
              const refreshed = await contributorService.getContributorById(editing.id);
              if (refreshed) setSelected(refreshed);
              await load();
            }}
          />
        )}
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
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-8 h-16 bg-white/5" />
                </tr>
              ))
            ) : contributors.length > 0 ? (
              contributors.map((c) => {
                const isRemoved = c.status === 'removed';
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`group hover:bg-white/[0.02] transition-colors cursor-pointer ${isRemoved ? 'opacity-50' : ''}`}
                  >
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
                      <div className="flex items-center gap-2">
                        <AccountTypeBadge accountType={c.accountType} />
                        {isRemoved && <RemovedBadge />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400">
                        {c.accountType === 'legacy' ? c.legacyDesignation || '--' : CATEGORY_LABELS[c.category || ''] || c.category || '--'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-400">{c.phoneNumber || '--'}</td>
                    <td className="px-6 py-4 text-xs text-zinc-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      {c.accountType === 'registered' && !isRemoved && (
                        <RowActionsMenu onEdit={() => setEditing(c)} onDelete={() => handleDelete(c)} />
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <p className="text-sm text-zinc-500">{searchQuery ? 'No authors match that search.' : 'No authors yet.'}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditUserModal
          contributor={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
