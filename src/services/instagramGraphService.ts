// Instagram Graph API client -- server-only. Publishes a single image
// (the banner produced by instagramBannerRenderer.ts + InstagramBannerPanel.tsx,
// already uploaded to Supabase Storage's public `media` bucket) to THE
// RESERVE's connected Instagram professional account using the Content
// Publishing API's two-step container flow:
//   1. POST /{ig-user-id}/media        (image_url + caption) -> creation_id
//   2. POST /{ig-user-id}/media_publish (creation_id)         -> media id
// Never import this from client code -- IG_ACCESS_TOKEN must never reach
// the browser bundle. Routes call this from server.ts, gated by
// verifyAdminRequest() same as every other admin/AI/source route.
//
// Host: graph.instagram.com, not graph.facebook.com. THE RESERVE's token
// was generated via Instagram API with Instagram Login (an "IGAA..."
// token, obtained by logging into Instagram directly rather than through
// a linked Facebook Page) -- that flow is served entirely from
// graph.instagram.com. graph.facebook.com is only correct for the older
// Facebook Login for Business + Page-token flow, which this app isn't
// using. Confirmed against IG_BUSINESS_ACCOUNT_ID live (resolves to
// @thereservemag) before wiring this in.

const GRAPH_API_VERSION = process.env.IG_GRAPH_API_VERSION || 'v26.0';
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

// A freshly-created media container is occasionally still processing when
// we try to publish it (Graph API error code 9007 / "media not ready").
// Images are near-instant compared to video, so a handful of short
// retries is enough -- this is not a video-upload polling loop.
const PUBLISH_RETRY_ATTEMPTS = 4;
const PUBLISH_RETRY_DELAY_MS = 1500;

export interface InstagramPublishResult {
  mediaId: string;
  permalink: string | null;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID);
}

async function graphRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  const body = new URLSearchParams(params);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;

  if (!res.ok || !json || json.error) {
    const graphError = json?.error;
    const message = graphError?.message || `Instagram Graph API request failed (HTTP ${res.status}).`;
    const code = graphError?.code;
    const err = new Error(message) as Error & { graphCode?: number };
    err.graphCode = code;
    throw err;
  }

  return json as T;
}

async function createMediaContainer(igUserId: string, accessToken: string, imageUrl: string, caption: string): Promise<string> {
  const result = await graphRequest<{ id: string }>(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  return result.id;
}

async function publishMediaContainer(igUserId: string, accessToken: string, creationId: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= PUBLISH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await graphRequest<{ id: string }>(`/${igUserId}/media_publish`, {
        creation_id: creationId,
        access_token: accessToken,
      });
      return result.id;
    } catch (error) {
      lastError = error as Error;
      // 9007 == "media not ready" -- worth a retry. Anything else (bad
      // token, permission error, invalid container) is fatal immediately.
      const code = (error as { graphCode?: number }).graphCode;
      if (code !== 9007 || attempt === PUBLISH_RETRY_ATTEMPTS) throw error;
      await sleep(PUBLISH_RETRY_DELAY_MS);
    }
  }

  // Unreachable, but keeps TypeScript satisfied.
  throw lastError ?? new Error('Failed to publish the Instagram media container.');
}

async function fetchPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const url = new URL(`${GRAPH_API_BASE}/${mediaId}`);
    url.searchParams.set('fields', 'permalink');
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url.toString());
    const json = (await res.json().catch(() => null)) as { permalink?: string } | null;
    return json?.permalink ?? null;
  } catch {
    // The publish itself already succeeded -- a missing permalink is a
    // cosmetic gap in the response, not a failure worth surfacing.
    return null;
  }
}

export async function publishImageToInstagram(imageUrl: string, caption: string): Promise<InstagramPublishResult> {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !igUserId) {
    throw new Error(
      'Instagram is not configured on the server -- set IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID.',
    );
  }

  const creationId = await createMediaContainer(igUserId, accessToken, imageUrl, caption);
  const mediaId = await publishMediaContainer(igUserId, accessToken, creationId);
  const permalink = await fetchPermalink(mediaId, accessToken);

  return { mediaId, permalink };
}
