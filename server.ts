import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  getArticleBySlugServer,
  getPublishedArticleSlugsServer,
  getServerSupabase,
  getServerSupabaseInitError,
  insertArticleServer,
} from './server-supabase';

const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_USER_NODE_ENV === 'production';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: unknown, maxLength = 160): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function absoluteUrl(baseUrl: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function getBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const configuredSite = process.env.SITE_URL?.replace(/\/$/, '');
  const host = req.get('host') || (configuredSite ? configuredSite.replace(/^https?:\/\//, '') : 'thereservemag.com');
  return configuredSite || `${protocol}://${host}`;
}

function renderMetadata(
  template: string,
  options: {
    baseUrl: string;
    canonicalPath: string;
    title: string;
    description: string;
    image: string;
    isArticle: boolean;
    publishedAt?: string;
    author?: string;
    category?: string;
  },
): string {
  const { baseUrl, canonicalPath, title, description, image, isArticle, publishedAt, author, category } = options;
  const canonicalUrl = absoluteUrl(baseUrl, canonicalPath);
  const absoluteImage = absoluteUrl(baseUrl, image);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const structuredData = isArticle
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description,
        image: [absoluteImage],
        mainEntityOfPage: canonicalUrl,
        ...(publishedAt ? { datePublished: publishedAt } : {}),
        ...(author ? { author: { '@type': 'Person', name: author } } : {}),
        ...(category ? { articleSection: category } : {}),
        publisher: { '@type': 'Organization', name: 'THE RESERVE', url: baseUrl },
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'THE RESERVE',
        url: baseUrl,
        description,
      };

  const metaTags = `
    <title>${safeTitle} | THE RESERVE</title>
    <meta name="description" content="${safeDescription}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${escapeHtml(absoluteImage)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(absoluteImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="${isArticle ? 'article' : 'website'}" />
    <meta property="og:site_name" content="THE RESERVE" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${escapeHtml(absoluteImage)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
  `;

  template = template.replace(/<title>[\s\S]*?<\/title>/gi, '');
  template = template.replace(/<meta\b[^>]*(?:name|property)="(?:og:|twitter:|description|robots)"[^>]*>/gi, '');
  template = template.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '');
  template = template.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
  return template.replace(/<head[^>]*>/i, (match) => `${match}\n${metaTags}`);
}

function getTemplatePath(): string {
  return isProd ? path.resolve(process.cwd(), 'dist/index.html') : path.resolve(process.cwd(), 'index.html');
}

function createSitemapXml(baseUrl: string, articleSlugs: string[]): string {
  const urls = ['/', '/get-featured', ...articleSlugs.map((slug) => `/${slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeHtml(absoluteUrl(baseUrl, url))}</loc></url>`)
    .join('\n')}\n</urlset>`;
}

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  let viteInstance: Awaited<ReturnType<typeof import('vite')['createServer']>> | null = null;
  if (!isProd) {
    try {
      const { createServer } = await import('vite');
      viteInstance = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(viteInstance.middlewares);
    } catch (error) {
      console.error('[Server] Failed to initialize Vite middleware:', error);
    }
  }

  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      isProd,
      supabaseConfigured: Boolean(getServerSupabase()),
      supabaseInitError: getServerSupabaseInitError(),
    }),
  );

  app.post('/api/ai/ingest', async (req, res) => {
    const { title, category, prompt } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required for draft generation.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });

    try {
      const ai = new GoogleGenAI({ apiKey });
      const finalTopicPrompt = `You are an expert editorial writer for The Reserve Magazine, a luxury editorial publication focused on Asian fashion, culture, and high-end lifestyle.\n\nGenerate a highly polished, deep, and beautifully stylized magazine feature article based on this user prompt: "${prompt.trim()}".\n\n${title ? `Target title: "${String(title).trim()}".` : ''}\nCategory: "${category || 'Culture'}".\n\nReturn ONLY a valid JSON object:\n{\n  "title": "Elegant display headline",\n  "excerpt": "One or two sentence hook",\n  "category": "${category || 'Culture'}",\n  "date": "Month day, year",\n  "readTime": "7 min",\n  "articleBlocks": [\n    { "type": "header", "text": "Section Heading" },\n    { "type": "paragraph", "text": "Rich editorial paragraph" },\n    { "type": "quote", "text": "Pull quote" }\n  ]\n}`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        contents: finalTopicPrompt,
        config: { responseMimeType: 'application/json' },
      });
      const responseText = response.text?.trim();
      if (!responseText) throw new Error('Generative draft output is empty.');

      const parsed = JSON.parse(responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
      const titleClean = parsed.title || title || 'Untitled AI Narrative';
      const excerptClean = parsed.excerpt || "A compelling and sophisticated narrative curating tomorrow's visions.";
      const categoryClean = parsed.category || category || 'Culture';
      const dateClean = parsed.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const readTimeClean = parsed.readTime || '5 min';
      const rawBlocks = Array.isArray(parsed.articleBlocks) ? parsed.articleBlocks : [];
      const content = rawBlocks.map((block: any) => ({
        id: crypto.randomUUID(),
        type: block?.type === 'header' || block?.type === 'section' ? 'header' : block?.type === 'quote' ? 'quote' : 'paragraph',
        text: typeof block?.text === 'string' ? block.text : '',
        style: { bold: false, italic: block?.type === 'quote', underline: false, fontSize: 'medium', alignment: 'left' },
      }));

      if (content.length === 0) {
        content.push({ id: crypto.randomUUID(), type: 'paragraph', text: prompt.trim(), style: { bold: false, italic: false, underline: false, fontSize: 'medium', alignment: 'left' } });
      }

      const slugClean = `${titleClean.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const newArticleRow = {
        title: titleClean,
        slug: slugClean,
        subtitle: '',
        excerpt: excerptClean,
        category: categoryClean,
        status: 'draft',
        featured: false,
        author: 'AI Ingestion Engine',
        image: { url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop', credit: 'AI Assistant', source: 'Unsplash' },
        mobile_image: { url: '', credit: '', source: '' },
        mobile_crop_x: 50,
        read_time: readTimeClean,
        date: dateClean,
        publish_date: new Date().toISOString(),
        content,
      };

      const inserted = await insertArticleServer(newArticleRow);
      return res.status(200).json({ id: inserted.id, ...newArticleRow });
    } catch (error: any) {
      console.error('[AI Ingestion] CRITICAL EXCEPTION:', error);
      return res.status(500).json({ error: `Failed to ingest AI narrative: ${error?.message || error}` });
    }
  });

  if (isProd) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
  }

  app.get('/robots.txt', (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${absoluteUrl(baseUrl, '/sitemap.xml')}\n`);
  });

  app.get('/sitemap.xml', async (req, res) => {
    res.type('application/xml').send(createSitemapXml(getBaseUrl(req), await getPublishedArticleSlugsServer()));
  });

  app.get('*', async (req: Request, res: Response, next: NextFunction) => {
    const urlPath = req.path;
    if (/^\/api(?:\/|$)/.test(urlPath)) return next();
    if (urlPath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff2?|ttf|otf|webp|avif|map)$/i)) return next();

    const slug = urlPath.split('/').filter(Boolean)[0];
    const templatePath = getTemplatePath();
    if (!fs.existsSync(templatePath)) return next();

    if (slug === 'admin') {
      return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8', 'X-SSR-Status': 'admin-bypass', 'Cache-Control': 'private, no-cache' }).send(fs.readFileSync(templatePath, 'utf-8'));
    }

    try {
      let title = 'THE RESERVE';
      let description = 'An editorial publication exploring Asian luxury, fashion, business, cinema, sports, and culture.';
      let image = '/og-default.jpg';
      let article: any = null;
      const isArticle = Boolean(slug && (article = await getArticleBySlugServer(slug)) && article.status === 'published');

      if (isArticle) {
        title = article.seo?.metaTitle || article.title || title;
        description = article.seo?.metaDescription || article.excerpt || article.subtitle || description;
        image = article.seo?.socialImage || article.image?.url || image;
      }

      let template = fs.readFileSync(templatePath, 'utf-8');
      if (viteInstance) template = await viteInstance.transformIndexHtml(req.originalUrl, template);

      const unknownRoute = Boolean(slug && !isArticle);
      template = renderMetadata(template, {
        baseUrl: getBaseUrl(req),
        canonicalPath: isArticle ? `/${article.slug}` : '/',
        title: unknownRoute ? 'Page Not Found' : title,
        description: unknownRoute ? 'The requested story could not be found.' : stripHtml(description),
        image,
        isArticle,
        publishedAt: article?.publishDate || article?.date,
        author: article?.author,
        category: article?.category,
      });

      if (unknownRoute) {
        template = template.replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex,follow" />');
        return res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(template);
      }

      return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8', 'X-SSR-Status': 'metadata', 'Cache-Control': 'public, no-cache, must-revalidate' }).send(template);
    } catch (error) {
      console.error('[SSR] Render failure:', error);
      return next();
    }
  });

  app.use((_req, res) => {
    const templatePath = getTemplatePath();
    if (fs.existsSync(templatePath)) return res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(fs.readFileSync(templatePath, 'utf-8'));
    return res.status(404).send('Not Found');
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => console.log(`[Server] Production-ready on port ${PORT} | ENV: ${isProd ? 'PROD' : 'DEV'}`));
}

const entryFile = path.basename(process.argv[1] || '');
if (entryFile === 'server.ts' || entryFile === 'server.cjs') {
  startServer().catch((error) => {
    console.error('[CRITICAL] Startup failed:', error);
    process.exit(1);
  });
}
