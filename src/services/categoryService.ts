import { supabase } from '../lib/supabase';

export interface CategoryDoc {
  id: string;
  name: string;
  createdAt?: string;
}

const TABLE = 'categories';

function rowToCategory(row: any): CategoryDoc {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export const categoryService = {
  async getAllCategories(): Promise<CategoryDoc[]> {
    const { data, error } = await supabase.from(TABLE).select('*').order('name', { ascending: true });
    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
    return (data ?? []).map(rowToCategory);
  },

  // Replaces Firestore's onSnapshot: fetch once immediately, then patch the
  // local list in place from each change's payload rather than re-fetching
  // the whole table on every single insert/update/delete.
  subscribeToCategories(callback: (categories: CategoryDoc[]) => void): () => void {
    let cached: CategoryDoc[] = [];

    this.getAllCategories()
      .then((categories) => {
        cached = categories;
        callback(cached);
      })
      .catch((err) => console.error('Error loading categories:', err));

    // Supabase's realtime client caches channels by topic name and reuses
    // the same channel instance for repeat calls -- calling `.on()` on an
    // already-subscribed channel throws ("tried to call .on() after
    // calling .subscribe()"). Now that both Navbar and the homepage
    // subscribe concurrently, the channel name must be unique per caller.
    const channel = supabase
      .channel(`categories_changes_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'INSERT') {
          cached = [...cached, rowToCategory(payload.new)].sort((a, b) => a.name.localeCompare(b.name));
        } else if (payload.eventType === 'UPDATE') {
          cached = cached
            .map((c) => (c.id === payload.new.id ? rowToCategory(payload.new) : c))
            .sort((a, b) => a.name.localeCompare(b.name));
        } else if (payload.eventType === 'DELETE') {
          cached = cached.filter((c) => c.id !== payload.old.id);
        }
        callback(cached);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async createCategory(name: string) {
    const { data, error } = await supabase.from(TABLE).insert({ name }).select('id').single();
    if (error) throw error;
    return data.id as string;
  },

  async updateCategory(id: string, name: string) {
    const { error } = await supabase.from(TABLE).update({ name }).eq('id', id);
    if (error) throw error;
  },

  async deleteCategory(id: string) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },
};
