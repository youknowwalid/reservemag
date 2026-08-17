import { supabase } from '../lib/supabase';
import { Subscriber } from '../types';

const TABLE = 'subscribers';

function rowToSubscriber(row: any): Subscriber {
  return { id: row.id, email: row.email, createdAt: row.created_at, source: row.source };
}

export const newsletterService = {
  async subscribe(email: string, source: string = 'homepage_footer') {
    try {
      const normalized = email.toLowerCase();
      const { error } = await supabase.from(TABLE).insert({ email: normalized, source });
      if (error) {
        // Postgres unique_violation on the email column == already subscribed.
        if ((error as any).code === '23505') {
          return { success: false, message: 'Already subscribed' };
        }
        throw error;
      }
      return { success: true };
    } catch (error) {
      console.error('Subscription error:', error);
      throw error;
    }
  },

  async getSubscribers(): Promise<Subscriber[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToSubscriber);
    } catch (error) {
      console.error('Error fetching subscribers:', error);
      return [];
    }
  },

  async removeSubscriber(id: string) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error removing subscriber:', error);
      throw error;
    }
  },
};
