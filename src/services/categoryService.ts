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

  // Replaces Firestore's onSnapshot: fetch once immediately, then re-fetch
  // whenever the table changes.
  subscribeToCategories(callback: (categories: CategoryDoc[]) => void): () => void {
    this.getAllCategories()
      .then(callback)
      .catch((err) => console.error('Error loading categories:', err));

    const channel = supabase
      .channel('categories_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
        this.getAllCategories()
          .then(callback)
          .catch((err) => console.error('Error loading categories:', err));
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
