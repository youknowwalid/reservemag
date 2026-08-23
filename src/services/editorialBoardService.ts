import { supabase } from '../lib/supabase';
import { EditorialBoardMember } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'editorial_board_members';

function rowToMember(row: any): EditorialBoardMember {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    bio: row.bio ?? '',
    photoUrl: row.photo_url ?? null,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

export interface EditorialBoardMemberInput {
  name: string;
  title: string;
  bio: string;
  photoUrl: string | null;
}

export const editorialBoardService = {
  /**
   * Every member, in display order -- called by both the public
   * /editorial-board page and the admin CRUD section (this table has no
   * separate draft/published state; see the migration's header
   * comment). Degrades to an empty list -- never throws -- on any
   * failure, including the table not existing yet if this migration
   * hasn't been applied, so the public page always renders its clean
   * empty state rather than crashing.
   */
  async getAllMembers(): Promise<EditorialBoardMember[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToMember);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  /** Admin-only in practice (RLS) -- appends the new member after every existing one (max displayOrder + 1, or 0 for the first member ever). */
  async createMember(input: EditorialBoardMemberInput): Promise<void> {
    const { data: last, error: lastError } = await supabase
      .from(TABLE)
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1);
    if (lastError) throw lastError;
    const nextOrder = last && last.length > 0 ? last[0].display_order + 1 : 0;

    const { error } = await supabase.from(TABLE).insert({
      name: input.name,
      title: input.title,
      bio: input.bio,
      photo_url: input.photoUrl,
      display_order: nextOrder,
    });
    if (error) throw error;
  },

  /** Admin-only in practice (RLS). Never touches display_order -- see persistOrder for reordering. */
  async updateMember(id: string, input: Partial<EditorialBoardMemberInput>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (input.name !== undefined) row.name = input.name;
    if (input.title !== undefined) row.title = input.title;
    if (input.bio !== undefined) row.bio = input.bio;
    if (input.photoUrl !== undefined) row.photo_url = input.photoUrl;
    const { error } = await supabase.from(TABLE).update(row).eq('id', id);
    if (error) throw error;
  },

  /** Admin-only in practice (RLS). */
  async deleteMember(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Persists a reorder -- pass the full list already recomputed by
   * lib/editorialBoardView.ts's reorderBoardMembers (the pure logic
   * lives there so it's unit-testable without a database; this just
   * writes whatever it decided). Only issues one update per member, and
   * only members whose displayOrder actually changed relative to what's
   * passed matter functionally, but writing the full set is simpler and
   * this list is small, admin-curated data, not a hot path.
   */
  async persistOrder(members: { id: string; displayOrder: number }[]): Promise<void> {
    const { error } = await Promise.all(
      members.map((m) => supabase.from(TABLE).update({ display_order: m.displayOrder }).eq('id', m.id)),
    ).then((results) => {
      const failed = results.find((r) => r.error);
      return { error: failed?.error ?? null };
    });
    if (error) throw error;
  },
};
