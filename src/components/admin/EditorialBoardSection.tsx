import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, X } from 'lucide-react';
import { editorialBoardService, EditorialBoardMemberInput } from '../../services/editorialBoardService';
import { deriveEditorialBoardView, reorderBoardMembers } from '../../lib/editorialBoardView';
import { EditorialBoardMember } from '../../types';
import ImageUploadForm from './ImageUploadForm';

const EMPTY_FORM: EditorialBoardMemberInput = { name: '', title: '', bio: '', photoUrl: null };

/**
 * Admin CRUD for the /editorial-board page's dynamic member list (see
 * editorialBoardService.ts and lib/editorialBoardView.ts). Add, edit,
 * reorder (move up/down), and remove board members -- name, title/role,
 * bio, and an optional photo. Reordering calls the same pure
 * reorderBoardMembers() the public page's ordering logic is built on, so
 * "what the admin sees change" and "what actually gets persisted" can
 * never drift apart.
 */
export default function EditorialBoardSection() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<EditorialBoardMember[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorialBoardMemberInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setLoading(true);
    try {
      setMembers(await editorialBoardService.getAllMembers());
    } finally {
      setLoading(false);
    }
  };

  const view = deriveEditorialBoardView(members);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsEditing(true);
  };

  const openEdit = (member: EditorialBoardMember) => {
    setEditingId(member.id);
    setForm({ name: member.name, title: member.title, bio: member.bio, photoUrl: member.photoUrl });
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.title.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await editorialBoardService.updateMember(editingId, form);
      } else {
        await editorialBoardService.createMember(form);
      }
      setIsEditing(false);
      await loadMembers();
    } catch (err) {
      console.error('Failed to save board member:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this board member?')) return;
    try {
      await editorialBoardService.deleteMember(id);
      await loadMembers();
    } catch (err) {
      console.error('Failed to remove board member:', err);
    }
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const reordered = reorderBoardMembers(members, id, direction);
    setReorderingId(id);
    try {
      await editorialBoardService.persistOrder(reordered.map((m) => ({ id: m.id, displayOrder: m.displayOrder })));
      setMembers(reordered);
    } catch (err) {
      console.error('Failed to reorder board members:', err);
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif mb-2">Editorial Board</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Managing the public /editorial-board member list</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-reserve-accent text-black px-6 py-3 text-[10px] uppercase tracking-widest font-bold hover:scale-105 transition-transform self-start"
        >
          <Plus size={14} />
          New Member
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center gap-4 text-zinc-600">
          <Loader2 className="animate-spin" />
          <span className="text-[10px] uppercase tracking-widest">Loading board members</span>
        </div>
      ) : view.kind === 'empty' ? (
        <div className="py-20 text-center border border-white/5 bg-white/[0.01] space-y-3">
          <Users className="mx-auto text-zinc-700" size={24} />
          <p className="text-[10px] uppercase tracking-widest text-zinc-600">No board members yet -- the public page shows a clean empty state until you add one</p>
        </div>
      ) : (
        <div className="space-y-4">
          {view.members.map((member, index) => (
            <div key={member.id} className="flex items-center gap-6 bg-white/[0.01] border border-white/5 p-6">
              {member.photoUrl ? (
                <img src={member.photoUrl} alt={member.name} className="w-16 h-16 object-cover border border-white/10 shrink-0" />
              ) : (
                <div className="w-16 h-16 bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center text-zinc-600 font-serif text-xl uppercase">
                  {member.name.charAt(0)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-serif truncate">{member.name}</h4>
                <p className="text-[9px] uppercase tracking-widest text-reserve-accent mt-1">{member.title}</p>
                {member.bio && <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{member.bio}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleMove(member.id, 'up')}
                  disabled={index === 0 || reorderingId !== null}
                  className="p-2 text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => handleMove(member.id, 'down')}
                  disabled={index === view.members.length - 1 || reorderingId !== null}
                  className="p-2 text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => openEdit(member)} className="p-2 text-zinc-600 hover:text-white transition-colors" title="Edit">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(member.id)} className="p-2 text-zinc-600 hover:text-red-500 transition-colors" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 p-10 md:p-16 overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <button onClick={() => setIsEditing(false)} className="absolute top-8 right-8 text-zinc-500 hover:text-white">
                <X size={20} />
              </button>

              <div className="mb-12">
                <span className="text-reserve-accent text-[10px] uppercase tracking-[0.4em] mb-2 block">Editorial Board</span>
                <h3 className="text-4xl font-serif">{editingId ? 'Edit Member' : 'New Member'}</h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-10">
                <ImageUploadForm
                  label="Photo (Optional)"
                  value={form.photoUrl || ''}
                  onChange={(url) => setForm({ ...form, photoUrl: url || null })}
                  storagePath="editorial-board"
                  aspectRatio="aspect-square"
                />

                <div className="space-y-4 group">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 group-focus-within:text-reserve-accent transition-colors">Name (Required)</label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-transparent border-b border-white/10 py-4 focus:outline-none focus:border-reserve-accent transition-colors text-white"
                    placeholder="Full name"
                  />
                </div>

                <div className="space-y-4 group">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 group-focus-within:text-reserve-accent transition-colors">Title / Role (Required)</label>
                  <input
                    required
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-transparent border-b border-white/10 py-4 focus:outline-none focus:border-reserve-accent transition-colors text-white"
                    placeholder="e.g. Editor-in-Chief"
                  />
                </div>

                <div className="space-y-4 group">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 group-focus-within:text-reserve-accent transition-colors">Short Bio (Optional)</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    rows={4}
                    className="w-full bg-transparent border-b border-white/10 py-4 focus:outline-none focus:border-reserve-accent transition-colors text-white resize-none"
                    placeholder="A short professional bio"
                  />
                </div>

                <div className="pt-8 flex flex-col md:flex-row gap-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-white text-black py-5 text-[11px] uppercase tracking-[0.3em] font-bold hover:bg-reserve-accent transition-colors flex items-center justify-center gap-3"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : editingId ? 'Save Changes' : 'Add Member'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 bg-transparent border border-white/10 text-white py-5 text-[11px] uppercase tracking-[0.3em] hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
