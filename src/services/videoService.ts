import { supabase } from '../lib/supabase';
import { VideoInterview } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'video_interviews';

function rowToVideo(row: any): VideoInterview {
  return {
    id: row.id,
    title: row.title,
    youtubeUrl: row.youtube_url,
    category: row.category,
    featured: row.featured,
    createdAt: row.created_at,
  };
}

export const videoService = {
  async getAllVideos(): Promise<VideoInterview[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToVideo);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async getFeaturedVideos(): Promise<VideoInterview[]> {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('featured', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToVideo);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async createVideo(video: Omit<VideoInterview, 'id' | 'createdAt'>) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          title: video.title,
          youtube_url: video.youtubeUrl,
          category: video.category,
          featured: video.featured,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    } catch (error) {
      logSupabaseError(error, OperationType.CREATE, TABLE);
    }
  },

  async updateVideo(id: string, video: Partial<VideoInterview>) {
    try {
      const row: Record<string, any> = {};
      if (video.title !== undefined) row.title = video.title;
      if (video.youtubeUrl !== undefined) row.youtube_url = video.youtubeUrl;
      if (video.category !== undefined) row.category = video.category;
      if (video.featured !== undefined) row.featured = video.featured;
      const { error } = await supabase.from(TABLE).update(row).eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `${TABLE}/${id}`);
    }
  },

  async deleteVideo(id: string) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.DELETE, `${TABLE}/${id}`);
    }
  },
};
