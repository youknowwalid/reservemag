import { supabase } from '../lib/supabase';
import { Author } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'authors';

function rowToAuthor(row: any): Author {
  return {
    id: row.id,
    name: row.name,
    designation: row.designation,
    role: row.role,
    imageUrl: row.image_url,
    active: row.active,
    createdAt: row.created_at,
  };
}

export const authorService = {
  async getAllAuthors(): Promise<Author[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToAuthor);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async getAuthorById(id: string): Promise<Author | null> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToAuthor(data) : null;
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `${TABLE}/${id}`);
      return null;
    }
  },

  async createAuthor(author: Omit<Author, 'id' | 'createdAt'>) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          name: author.name,
          designation: author.designation,
          role: author.role,
          image_url: author.imageUrl,
          active: author.active,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    } catch (error) {
      logSupabaseError(error, OperationType.CREATE, TABLE);
      throw error;
    }
  },

  async updateAuthor(id: string, author: Partial<Author>) {
    try {
      const row: Record<string, any> = {};
      if (author.name !== undefined) row.name = author.name;
      if (author.designation !== undefined) row.designation = author.designation;
      if (author.role !== undefined) row.role = author.role;
      if (author.imageUrl !== undefined) row.image_url = author.imageUrl;
      if (author.active !== undefined) row.active = author.active;
      const { error } = await supabase.from(TABLE).update(row).eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `${TABLE}/${id}`);
      throw error;
    }
  },

  async deleteAuthor(id: string) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.DELETE, `${TABLE}/${id}`);
      throw error;
    }
  },
};
