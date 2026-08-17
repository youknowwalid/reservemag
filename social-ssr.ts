import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';
import { getArticleBySlugServer } from './server-supabase';

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
  return getArticleBySlugServer(slug);
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

function renderSocialHtml(template: string, article: any | null, canonicalUrl: string): string {
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
  const pageTitle = article ? `${safeTitle} | THE RESERVE` : safeTitle;

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
    <title>${pageTitle}</title>
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

  // Minimal inline fallback so a crawler ALWAYS gets a 200 with usable tags,
  // even if the built template can't be found on disk (e.g. a Vercel
  // deployment where dist/ wasn't bundled into the serverless function).
  const FALLBACK_TEMPLATE = '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>';

  let template: string;
  try {
    template = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : FALLBACK_TEMPLATE;
  } catch (readError) {
    console.error('[Social SSR] Failed to read SSR template, using inline fallback:', readError);
    template = FALLBACK_TEMPLATE;
  }

  try {
    const article = await getArticle(slug);
    const canonicalUrl = toAbsoluteUrl(article ? `/${article.slug || slug}` : `/${slug}`);
    const isPublished = Boolean(article && article.status === 'published');
    const html = renderSocialHtml(template, isPublished ? article : null, canonicalUrl);

    // Always 200 for crawlers: an unpublished/missing article still gets a
    // valid preview (site defaults) rather than an error status, which is
    // what causes Facebook/Twitter/etc. to refuse to render any preview.
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-SSR-Status', isPublished ? 'social-crawler' : 'social-fallback');
    res.setHeader('Cache-Control', isPublished
      ? 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'
      : 'public, max-age=60, s-maxage=60');
    res.setHeader('Vary', 'User-Agent');
    res.end(html);
    return true;
  } catch (error) {
    console.error('[Social SSR] Crawler render error, serving default tags:', error);
    try {
      const canonicalUrl = toAbsoluteUrl(`/${slug}`);
      const html = renderSocialHtml(template, null, canonicalUrl);
      res.status(200);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-SSR-Status', 'social-error-fallback');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.setHeader('Vary', 'User-Agent');
      res.end(html);
    } catch (fatalError) {
      // Last resort: still never hand a crawler a 5xx.
      console.error('[Social SSR] Fatal fallback failure:', fatalError);
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(FALLBACK_TEMPLATE.replace('<head>', `<head><title>${DEFAULT_TITLE}</title><meta property="og:title" content="${DEFAULT_TITLE}"><meta property="og:description" content="${DEFAULT_DESCRIPTION}"><meta property="og:image" content="${DEFAULT_IMAGE}">`));
    }
    return true;
  }
}
