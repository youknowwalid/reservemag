import { supabase } from '../lib/supabase';

export const cdnService = {
  /**
   * Smart Purge Logic
   * In a real production environment, this would call a CDN API (Cloudflare, Fastly, CloudFront).
   * Here we simulate identifying "changed" paths and invalidating them.
   */
  async smartPurge() {
    console.log('Initiating Smart CDN Purge...');

    const changedPaths: string[] = ['/', '/stories'];

    try {
      const { data, error } = await supabase
        .from('articles')
        .select('slug')
        .order('updated_at', { ascending: false })
        .limit(10);
      if (error) throw error;

      (data ?? []).forEach((row: any) => {
        if (row.slug) changedPaths.push(`/stories/${row.slug}`);
      });

      console.log('Paths identified for intelligent invalidation:', changedPaths);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Log the purge event for an audit trail.
      await supabase.from('system_logs').insert({
        type: 'CDN_PURGE',
        mode: 'SMART',
        paths: changedPaths,
        status: 'SUCCESS',
      });

      return {
        success: true,
        purgedCount: changedPaths.length,
        paths: changedPaths,
      };
    } catch (err) {
      console.error('Smart Purge Error:', err);
      throw new Error('FAILED_TO_COMMUNICATE_WITH_CDN');
    }
  }
};
