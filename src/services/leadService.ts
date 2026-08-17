import { supabase } from '../lib/supabase';
import { FeaturedRequest, FeaturedRequestStatus } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'featured_requests';

function rowToRequest(row: any): FeaturedRequest {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    email: row.email,
    whatsapp: row.whatsapp,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    linkedinUrl: row.linkedin_url,
    industry: row.industry,
    budget: row.budget,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

export const leadService = {
  async submitRequest(request: Omit<FeaturedRequest, 'id' | 'createdAt' | 'status'>) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          name: request.name,
          brand: request.brand,
          email: request.email,
          whatsapp: request.whatsapp,
          facebook_url: request.facebookUrl,
          instagram_url: request.instagramUrl,
          linkedin_url: request.linkedinUrl,
          industry: request.industry,
          budget: request.budget,
          message: request.message,
          status: 'New' as FeaturedRequestStatus,
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

  async getAllRequests(): Promise<FeaturedRequest[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToRequest);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async updateRequestStatus(id: string, status: FeaturedRequestStatus) {
    try {
      const { error } = await supabase.from(TABLE).update({ status }).eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `${TABLE}/${id}`);
      throw error;
    }
  },

  async deleteRequest(id: string) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.DELETE, `${TABLE}/${id}`);
      throw error;
    }
  },
};
