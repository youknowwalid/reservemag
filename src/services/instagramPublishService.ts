import { supabase } from '../lib/supabase';

// Client-side caller for POST /api/admin/instagram-publish (see
// server.ts + src/services/instagramGraphService.ts). Publishes a banner
// image that has already been uploaded to Supabase Storage's public
// `media` bucket -- the Instagram Graph API's Content Publishing endpoint
// requires a publicly-fetchable image_url, not a raw file upload, which
// is why this only ever takes a URL, never a File/Blob.

export interface InstagramPublishResult {
  mediaId: string;
  permalink: string | null;
}

export const instagramPublishService = {
  async publish(imageUrl: string, caption: string): Promise<InstagramPublishResult> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in as an admin.');

    const res = await fetch('/api/admin/instagram-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ imageUrl, caption }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Failed to publish to Instagram (HTTP ${res.status}).`);
    }
    return data as InstagramPublishResult;
  },
};
