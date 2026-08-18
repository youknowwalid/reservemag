import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';
import {
  getArticleBySlugServer,
  getPublishedArticleSlugsServer,
  getServerSupabase,
  getServerSupabaseInitError,
  insertArticleServer,
  verifyAdminRequest,
} from './server-supabase';
// Reserve Editorial Engine AI provider. Server-side only -- see
// src/services/ai/index.ts. Do not call Tabitoken (or any other AI
// backend) directly from route handlers; always go through this
// abstraction so the provider can be swapped without touching callers.
import { generate as aiGenerate, testAIConnection } from './src/services/ai';
// Source Retrieval Engine. Server-side only -- see
// src/services/research/sourceRetrievalService.ts. Fetches editor-supplied
// URLs; nothing else in the app should call fetch() against an arbitrary
// URL directly -- always go through this module so SSRF protection stays
// centralized.
import { retrieveSource } from './src/services/research/sourceRetrievalService';
// Reserve Editorial Intelligence Engine. Server-side only -- see
// src/services/editorial/editorialGenerationService.ts. Orchestrates
// source retrieval + the single AI generation call + validation + QA;
// nothing else should call the AI provider or build editorial prompts
// directly.
import { generateEditorialPackage, resolveGenerationTimeoutMs, getConfiguredEditorialModel } from './src/services/editorial/editorialGenerationService';
import { validateGenerationRequestBody } from './src/services/editorial/editorialRequestGuard';
import { computeEditorialFingerprint, createSupabaseEditorialJobLockStore } from './src/services/editorial/editorialJobLock';

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
    // Admin-only: same gate as /api/admin/ai-connection-test, reusing the
    // one verifyAdminRequest() helper (server-supabase.ts) so both routes
    // stay in sync with whatever `is_admin()` actually allows. This must
    // run before anything else in the handler -- including request-shape
    // validation -- so an unauthenticated or non-admin caller learns
    // nothing about the endpoint's behavior, the AI provider, or its
    // configuration.
    const auth = await verifyAdminRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const { title, category, prompt } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required for draft generation.' });
    }

    try {
      const systemPrompt =
        'You are an expert editorial writer for The Reserve Magazine, a luxury editorial publication focused on Asian fashion, culture, and high-end lifestyle. Respond with ONLY a single valid JSON object matching the requested shape -- no markdown code fences, no commentary before or after it.';
      const userPrompt = `Generate a highly polished, deep, and beautifully stylized magazine feature article based on this user prompt: "${prompt.trim()}".\n\n${title ? `Target title: "${String(title).trim()}".\n` : ''}Category: "${category || 'Culture'}".\n\nReturn a JSON object with this exact shape:\n{\n  "title": "Elegant display headline",\n  "excerpt": "One or two sentence hook",\n  "category": "${category || 'Culture'}",\n  "date": "Month day, year",\n  "readTime": "7 min",\n  "articleBlocks": [\n    { "type": "header", "text": "Section Heading" },\n    { "type": "paragraph", "text": "Rich editorial paragraph" },\n    { "type": "quote", "text": "Pull quote" }\n  ]\n}`;

      const result = await aiGenerate({
        systemPrompt,
        userPrompt,
        responseFormat: 'json_object',
        temperature: 0.8,
        maxTokens: 4000,
      });

      const responseText = result.text?.trim();
      if (!responseText) throw new Error('Generative draft output is empty.');

      const parsed =
        (result.json as any) ??
        JSON.parse(responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, ''));
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

  // Admin-only health check for the AI provider. Runs the same trivial
  // "RESERVE AI CONNECTED" round trip as `npm run ai:health`, gated behind
  // a verified admin session so it can't be used to probe the gateway (or
  // burn quota) anonymously. Never returns the API key -- only a safe
  // status message, the model name, and latency.
  app.post('/api/admin/ai-connection-test', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    // `auth.ok === false` (rather than `!auth.ok`) so the discriminated
    // union narrows correctly under this project's non-strict tsconfig.
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const result = await testAIConnection();
    return res.status(result.ok ? 200 : 502).json(result);
  });

  // Admin-only debug tool for the Source Retrieval Engine -- fetches one
  // URL and returns a curated preview (never the full article text or
  // full image list) so the admin UI can sanity-check extraction without
  // this becoming a general-purpose URL-fetching proxy. Admin-gated for
  // the same reason as the AI routes above: unauthenticated callers must
  // not be able to make this server issue arbitrary outbound requests.
  app.post('/api/admin/source/fetch', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const { url } = req.body ?? {};
    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'A source URL is required.' });
    }

    const source = await retrieveSource(url.trim());
    const heroImage = source.images.find((img) => img.kind === 'hero' || img.kind === 'og')?.imageUrl || source.ogImage || null;

    return res.status(200).json({
      status: source.status,
      errorReason: source.errorReason,
      title: source.title,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      canonicalUrl: source.canonicalUrl,
      wordCount: source.wordCount,
      heroImage,
      imageCount: source.images.length,
      articlePreview: source.articleText ? source.articleText.slice(0, 600) : null,
    });
  });

  // Reserve Editorial Intelligence Engine -- one editorial item, one AI
  // request. Admin-gated (same verifyAdminRequest() helper as every other
  // AI/source route). Costs real money ($0.50/request against Tabitoken),
  // so beyond the admin UI's own confirmation dialog, this endpoint
  // refuses to run unless the caller explicitly passes `confirmed: true`
  // -- defense in depth against a stray or accidental request triggering
  // a paid generation.
  app.post('/api/admin/editorial/generate', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    // editorial_generations is is_admin()-gated under RLS -- the lock
    // store must write through THIS request's verified, JWT-carrying
    // client (auth.client), never a bare anon-key client. Built fresh per
    // request (not a module-level singleton) since each caller's client
    // carries their own token. See verifyAdminRequest's doc comment.
    const editorialJobLockStore = createSupabaseEditorialJobLockStore(auth.client);

    // Server-side confirmation gate -- never trust a frontend-only check.
    // Also validates sourceUrls shape/count (shared with the test suite
    // via editorialRequestGuard.ts, so this logic can't drift from what's
    // actually tested).
    const guard = validateGenerationRequestBody(req.body);
    // `guard.ok === false` (rather than `!guard.ok`) so the discriminated
    // union narrows correctly under this project's non-strict tsconfig.
    if (guard.ok === false) return res.status(guard.status).json({ error: guard.error });
    const input = guard.input;

    // Duplicate-submission protection: acquire a database-level lock
    // BEFORE any AI call is made. A second request for the same source
    // URLs + parameters while this one is PENDING/RUNNING is rejected
    // outright -- see editorialJobLock.ts for how the lock is enforced
    // (a Postgres partial unique index, not a check-then-insert race).
    const fingerprint = computeEditorialFingerprint(input);
    const staleBeforeIso = new Date(Date.now() - (resolveGenerationTimeoutMs() + 60_000)).toISOString();
    try {
      await editorialJobLockStore.reclaimStale(fingerprint, staleBeforeIso);
    } catch (reclaimError) {
      console.error('[Editorial Generation] Stale-lock reclaim failed (non-fatal):', reclaimError);
    }

    let lockId: string;
    try {
      const acquired = await editorialJobLockStore.tryAcquire(fingerprint, {
        source_urls: input.sourceUrls,
        subject: input.subject ?? null,
        requested_angle: input.requestedAngle ?? null,
        content_type: input.contentType ?? null,
        sources_used: [],
        provider: 'tabitoken',
        requested_model: getConfiguredEditorialModel(),
        ai_request_attempted: false,
      });
      if (!acquired.ok) {
        return res.status(409).json({ error: 'An identical editorial generation is already in progress. Wait for it to finish, or use different source URLs/parameters.' });
      }
      lockId = acquired.id;
    } catch (lockError: any) {
      console.error('[Editorial Generation] Failed to acquire generation lock:', lockError);
      return res.status(500).json({ error: 'Failed to start editorial generation.' });
    }

    try {
      await editorialJobLockStore.markRunning(lockId);
    } catch (runningError) {
      console.error('[Editorial Generation] Failed to mark job RUNNING (continuing anyway):', runningError);
    }

    try {
      const result = await generateEditorialPackage(input);

      try {
        await editorialJobLockStore.markTerminal(lockId, {
          sources_used: result.sources,
          editorial_package: result.editorialPackage,
          served_model: result.servedModel,
          generation_status: result.status,
          qa_status: result.qa?.overall ?? null,
          qa_result: result.qa,
          confidence: result.editorialPackage?.selfCheck.confidence ?? null,
          failure_reason: result.failureReason,
          error_category: result.errorCategory,
          ai_request_attempted: result.aiRequestAttempted,
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
          latency_ms: result.latencyMs,
        });
      } catch (dbError) {
        console.error('[Editorial Generation] Failed to persist final generation state:', dbError);
      }

      const httpStatus = result.status === 'SUCCESS' ? 200 : 502;
      return res.status(httpStatus).json({ id: lockId, ...result });
    } catch (error: any) {
      console.error('[Editorial Generation] CRITICAL EXCEPTION:', error);
      try {
        await editorialJobLockStore.markTerminal(lockId, {
          generation_status: 'GENERATION_FAILED',
          error_category: 'PROVIDER_ERROR',
          failure_reason: 'Editorial generation failed unexpectedly.',
        });
      } catch (dbError) {
        console.error('[Editorial Generation] Failed to persist crash state:', dbError);
      }
      return res.status(500).json({ error: 'Editorial generation failed unexpectedly.' });
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
