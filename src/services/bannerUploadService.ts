import { supabase } from '../lib/supabase';

// Client-side caller for POST /api/admin/instagram-banner-upload (see
// server.ts + src/services/r2StorageService.ts). Uploads the final
// rendered Instagram banner PNG to Cloudflare R2 and returns its public
// URL -- the one upload in this app that goes to R2 rather than Supabase
// Storage. Everything else InstagramBannerPanel.tsx does with the result
// (writing instagram_banner_url/config to recordTable, feeding the URL
// into instagramPublishService) is unchanged; only where the bytes land
// is different.

export const bannerUploadService = {
  async uploadRenderedBanner(blob: Blob, recordId: string | null): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in as an admin.');

    const query = recordId ? `?recordId=${encodeURIComponent(recordId)}` : '';
    const res = await fetch(`/api/admin/instagram-banner-upload${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${session.access_token}` },
      body: blob,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Failed to upload the banner (HTTP ${res.status}).`);
    }
    return data.url as string;
  },
};
