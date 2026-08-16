import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server';
import { handleSocialCrawler } from '../social-ssr';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Social crawlers must never pass through Vite/SPA middleware first.
  // Render a deterministic HTML head directly from Firestore for rich previews.
  if (await handleSocialCrawler(req, res)) return;

  appPromise ??= createApp();
  const app = await appPromise;
  return app(req, res);
}
