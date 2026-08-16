import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, getDocs, limit, query, where } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TITLE = 'THE RESERVE';
const DEFAULT_DESCRIPTION = 'An editorial publication exploring Asian luxury, fashion, business, cinema, sports, and culture.';
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop';
const SITE_URL = (process.env.SITE_URL || 'https://thereservemag.com').replace(/\/$/, '');

const SOCIAL_CRAWLER_RE = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|googlebot/i;

export function isSocialCrawler(req: VercelRequest): boolean {
  return SOCIAL_CRAWLER_RE.test(String(req.headers['user-agent'] || ''));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value: unknown, maxLength = 200): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toAbsoluteUrl(value: unknown, baseUrl = SITE_URL): string {
  const raw = String(value ?? '').trim();
  if (!raw) return `${baseUrl}/`;

  try {
    const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = /^https?:\/\//i.test(normalized)
      ? new URL(normalized)
      : new URL(normalized, `${baseUrl}/`);

    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return `${baseUrl}/${raw.replace(/^\/+/, '')}`;
  }
}

function getRequestPath(req: VercelRequest): string {
  const candidates = [
    req.headers['x-original-url'],
    req.headers['x-forwarded-uri'],
    req.headers['x-matched-path'],
    req.url,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(String(candidate), SITE_URL);
      if (parsed.pathname && parsed.pathname !== '/api') return parsed.pathname;
    } catch {
      // Continue to the next candidate.
    }
  }

  return '/';
}

async function getArticle(slug: string): Promise<any | null> {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const apps = getApps();
    const app = apps.length
      ? apps[0]
      : initializeApp({
          credential: serviceAccountJson
            ? cert(JSON.parse(serviceAccountJson))
            : undefined,
          projectId: process.env.FIREBASE_PROJECT_ID,
        });

    const db = process.env.FIRESTORE_DATABASE_ID
      ? getAdminFirestore(app, process.env.FIRESTORE_DATABASE_ID)
      : getAdminFirestore(app);

    const snap = await db.collection('articles').where('slug', '==', slug).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (adminError) {
    console.error('[Social SSR] Firebase Admin lookup failed:', adminError);
  }

  // Local/development fallback only. Production should use Firebase Admin credentials.
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = initializeClientApp(config, 'social-ssr-fallback');
    const db = getClientFirestore(app, config.firestoreDatabaseId);
    const snap = await getDocs(query(collection(db, 'articles'), where('slug', '==', slug), limit(1)));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (fallbackError) {
    console.error('[Social SSR] Firestore fallback failed:', fallbackError);
    return null;
  }
}

function stripExistingMetadata(template: string): string {
  const patterns = [
    /<title\b[^>]*>[\s\S]*?<\/title>/gi,
    /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,
    /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi,
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
  ];

  return patterns.reduce((html, pattern) => html.replace(pattern, ''), template);
}

function renderSocialHtml(template: string, article: any, canonicalUrl: string): string {
  const title = cleanText(article?.seo?.metaTitle || article?.title || DEFAULT_TITLE, 120);
  const description = cleanText(
    article?.seo?.metaDescription || article?.excerpt || article?.subtitle || DEFAULT_DESCRIPTION,
    200,
  );
  const image = toAbsoluteUrl(article?.seo?.socialImage || article?.image?.url || DEFAULT_IMAGE);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeImage = escapeHtml(image);
  const publishedAt = article?.publishDate || article?.date;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image: [image],
    mainEntityOfPage: canonicalUrl,
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(article?.author ? { author: { '@type': 'Person', name: cleanText(article.author, 120) } } : {}),
    ...(article?.category ? { articleSection: cleanText(article.category, 80) } : {}),
    publisher: { '@type': 'Organization', name: 'THE RESERVE', url: SITE_URL },
  }).replace(/</g, '\\u003c');

  const headPayload = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} | THE RESERVE</title>
    <meta name="description" content="${safeDescription}">
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
    <link rel="canonical" href="${safeCanonical}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="THE RESERVE">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${safeCanonical}">
    <meta property="og:image" content="${safeImage}">
    <meta property="og:image:secure_url" content="${safeImage}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${safeImage}">
    <meta name="twitter:url" content="${safeCanonical}">
    <script type="application/ld+json">${jsonLd}</script>
  `;

  const cleaned = stripExistingMetadata(template);
  const headMatch = cleaned.match(/<head\b[^>]*>/i);
  if (!headMatch || headMatch.index === undefined) {
    throw new Error('SSR template does not contain a valid <head> element.');
  }

  const insertAt = headMatch.index + headMatch[0].length;
  return `${cleaned.slice(0, insertAt)}\n${headPayload}\n${cleaned.slice(insertAt)}`;
}

export async function handleSocialCrawler(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (!isSocialCrawler(req)) return false;

  const pathname = getRequestPath(req);
  const slug = pathname.split('/').filter(Boolean)[0];
  const templatePath = path.resolve(process.cwd(), 'dist/index.html');

  if (!slug || slug === 'admin' || pathname.startsWith('/api/')) return false;
  if (!fs.existsSync(templatePath)) {
    res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('SSR template unavailable');
    return true;
  }

  try {
    const article = await getArticle(slug);
    if (!article || article.status !== 'published') {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-SSR-Status', 'social-not-found');
      res.end(fs.readFileSync(templatePath, 'utf8'));
      return true;
    }

    const canonicalUrl = toAbsoluteUrl(`/${article.slug || slug}`);
    const html = renderSocialHtml(fs.readFileSync(templatePath, 'utf8'), article, canonicalUrl);

    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-SSR-Status', 'social-crawler');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Vary', 'User-Agent');
    res.end(html);
    return true;
  } catch (error) {
    console.error('[Social SSR] Fatal crawler render error:', error);
    res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('SSR render failed');
    return true;
  }
}
