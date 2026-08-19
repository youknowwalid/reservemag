import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, Send, Sparkles, X, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { articleService } from '../../services/articleService';
import EditorialCoverStudio, { CoverStudioPackage } from './EditorialCoverStudio';

const PROGRESS_STEPS = ['Retrieving sources', 'Preparing editorial material', 'Generating Reserve editorial', 'Validating', 'QA', 'Complete'];

interface SourceSummary { sourceId: string; url: string; title: string | null; publisher: string | null; status: string; wordCount: number; }
interface EditorialPackage { title: string; subtitle: string; article: string; instagramHeadline: string; instagramSubheadline: string; coverKicker: string; coverSecondaryLine: string; caption: string; imageUrl: string; imageReason: string; sourcesUsed: string[]; warnings: string[]; }
interface GenerationResult { id: string | null; status: 'SUCCESS' | 'SOURCE_RETRIEVAL_FAILED' | 'GENERATION_FAILED' | 'VALIDATION_FAILED'; failureReason: string | null; sources: SourceSummary[]; editorialPackage: EditorialPackage | null; qa: { overall: 'PASS' | 'WARNING' | 'FAIL'; checks: Array<{ check: string; severity: string; message: string }>; confidence: number; status: 'READY' | 'NEEDS_REVIEW' } | null; requestedModel: string; servedModel: string | null; usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null }; latencyMs: number | null; }

async function parseEditorialResponse(res: Response): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  const raw = await res.text();
  try { return { ok: true, data: JSON.parse(raw) }; } catch {
    console.error('Editorial generation: non-JSON response from server.', { status: res.status, contentType: res.headers.get('content-type'), raw: raw.slice(0, 2000) });
    return { ok: false, message: res.status >= 500 ? 'The server encountered an unexpected error and did not complete the request. Check Editorial Factory history before retrying.' : `The server returned an unexpected response (HTTP ${res.status}).` };
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-zinc-600 block">{label}</span><div className="text-zinc-300 text-xs leading-relaxed">{value ?? '--'}</div></div>;
}

function generateEditorialSlug(title: string): string {
  const base = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return `${base || 'reserve-editorial'}-${Date.now().toString(36)}`;
}
function estimateReadTime(text: string): string { return `${Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 220))} min`; }

export default function EditorialGenerationPanel() {
  const [subject, setSubject] = useState('');
  const [sourceUrl1, setSourceUrl1] = useState('');
  const [sourceUrl2, setSourceUrl2] = useState('');
  const [sourceUrl3, setSourceUrl3] = useState('');
  const [requestedAngle, setRequestedAngle] = useState('');
  const [contentType, setContentType] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [cover, setCover] = useState<CoverStudioPackage | null>(null);
  const [publishedArticleId, setPublishedArticleId] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (stepTimer.current) clearInterval(stepTimer.current); }, []);
  const sourceUrls = [sourceUrl1, sourceUrl2, sourceUrl3].map((u) => u.trim()).filter(Boolean);

  const runGeneration = async () => {
    setShowConfirm(false); setGenerating(true); setError(null); setPublishError(null); setResult(null); setCover(null); setPublishedArticleId(null); setPublishedSlug(null); setStep(1);
    stepTimer.current = setInterval(() => setStep((s) => (s < 5 ? s + 1 : s)), 4000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin to generate an editorial.');
      const res = await fetch('/api/admin/editorial/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ sourceUrls, subject: subject.trim() || undefined, requestedAngle: requestedAngle.trim() || undefined, contentType: contentType.trim() || undefined, confirmed: true }) });
      const parsed = await parseEditorialResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const data = parsed.data;
      if (!res.ok && !data?.status) throw new Error(data?.error || 'Editorial generation failed.');
      setResult(data);
      if (data?.editorialPackage) setCover({ title: data.editorialPackage.title, coverKicker: data.editorialPackage.coverKicker, coverSecondaryLine: data.editorialPackage.coverSecondaryLine, imageUrl: data.editorialPackage.imageUrl, imageReason: data.editorialPackage.imageReason });
      setStep(6);
    } catch (err: any) { setError(err?.message || 'Editorial generation failed.'); setStep(0); }
    finally { if (stepTimer.current) clearInterval(stepTimer.current); setGenerating(false); }
  };

  const handleGenerateClick = (e: React.FormEvent) => { e.preventDefault(); if (!sourceUrls.length) { setError('At least one source URL is required.'); return; } setError(null); setShowConfirm(true); };

  const handlePublish = async () => {
    if (!result?.editorialPackage || result.status !== 'SUCCESS' || publishedArticleId || !cover) return;
    setShowPublishConfirm(false); setPublishing(true); setPublishError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your admin session has expired. Please sign in again.');
      const pkg = result.editorialPackage;
      const firstUsedSource = pkg.sourcesUsed.map((sourceId) => result.sources.find((source) => source.sourceId === sourceId)).find(Boolean);
      const imageSource = result.sources.find((source) => source.url === cover.imageUrl) || firstUsedSource;
      const excerpt = pkg.subtitle?.trim() || pkg.article.trim().slice(0, 220);
      const content = pkg.article.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((text, index) => ({ id: `${Date.now()}-${index}`, type: 'paragraph' as const, text, style: { bold: false, italic: false, underline: false, fontSize: 'medium' as const, alignment: 'left' as const } }));
      const publishDate = new Date();
      const slug = generateEditorialSlug(pkg.title);
      const articleData = { slug, title: pkg.title, subtitle: pkg.subtitle, excerpt, content: content.length ? content : [{ id: `${Date.now()}-0`, type: 'paragraph' as const, text: pkg.article, style: { bold: false, italic: false, underline: false, fontSize: 'medium' as const, alignment: 'left' as const } }], category: 'Culture', status: 'published' as const, featured: false, author: 'THE RESERVE Editorial', image: { url: cover.imageUrl || '', credit: imageSource?.publisher || 'Source', source: imageSource?.url || '' }, mobileImage: { url: cover.imageUrl || '', credit: imageSource?.publisher || 'Source', source: imageSource?.url || '' }, mobileCropX: 50, readTime: estimateReadTime(pkg.article), date: publishDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), publishDate: publishDate.toISOString(), seo: { metaTitle: pkg.title, metaDescription: excerpt, socialImage: cover.imageUrl || '' } };
      const articleId = await articleService.createArticle(articleData);
      setPublishedArticleId(articleId); setPublishedSlug(slug);
    } catch (err: any) { console.error('[Editorial Factory] Publish failed:', err); setPublishError(err?.message || 'The editorial was generated but could not be published.'); }
    finally { setPublishing(false); }
  };

  const pkg = result?.editorialPackage;
  const publishedUrl = publishedSlug ? `/${publishedSlug}` : null;

  return <div className="space-y-6 bg-zinc-900/30 p-8 border border-white/5">
    <div><h2 className="text-xl font-serif">Editorial Factory — Create Editorial</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Reserve Editorial Intelligence Engine — generate, review, design, then publish</p></div>

    <form onSubmit={handleGenerateClick} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Subject (optional)</label><input className="w-full bg-black border border-white/10 p-4 text-sm outline-none" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Jane Doe, founder of..." /></div>
        <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Content Type (optional)</label><input className="w-full bg-black border border-white/10 p-4 text-sm outline-none" value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="e.g. profile, feature, interview" /></div>
      </div>
      {[[sourceUrl1, setSourceUrl1, 'Source URL 1 (required)'], [sourceUrl2, setSourceUrl2, 'Source URL 2 (optional)'], [sourceUrl3, setSourceUrl3, 'Source URL 3 (optional)']].map(([value, setter, label]) => <div className="space-y-2" key={String(label)}><label className="text-[10px] uppercase tracking-widest text-zinc-500 block">{label}</label><input className="w-full bg-black border border-white/10 p-4 text-sm font-mono outline-none" value={String(value)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)} placeholder="https://..." /></div>)}
      <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Requested Editorial Angle (optional)</label><input className="w-full bg-black border border-white/10 p-4 text-sm outline-none" value={requestedAngle} onChange={(e) => setRequestedAngle(e.target.value)} placeholder="e.g. leadership, transformation, personal philosophy" /></div>
      <button type="submit" disabled={generating} className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">{generating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Generate Editorial</button>
    </form>

    {error && <div className="flex items-center gap-2 text-rose-500 text-[10px]"><XCircle size={12} /> {error}</div>}

    {showConfirm && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"><div className="w-full max-w-md bg-zinc-950 border border-white/10 p-8 space-y-6"><div className="flex items-start justify-between"><h3 className="text-lg font-serif">Confirm AI Generation</h3><button onClick={() => setShowConfirm(false)}><X size={16} /></button></div><p className="text-sm text-zinc-300">This editorial generation will use <strong>1 AI request</strong> at approximately <strong>$0.50</strong>.</p><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Provider: Tabitoken — configured production model.</p><div className="flex gap-4"><button onClick={() => setShowConfirm(false)} className="flex-1 py-3 border border-white/10 text-[10px] uppercase tracking-widest">Cancel</button><button onClick={runGeneration} className="flex-1 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest">Generate — $0.50</button></div></div></div>}

    {generating && <div className="space-y-2 bg-black/40 border border-white/5 p-6">{PROGRESS_STEPS.map((label, i) => { const n = i + 1; const done = step > n || step === 6; const active = step === n; return <div key={label} className={`flex items-center gap-3 text-xs ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-zinc-600'}`}>{done ? <CheckCircle2 size={14} /> : active ? <Loader2 className="animate-spin" size={14} /> : <span className="w-[14px] h-[14px] rounded-full border border-zinc-700" />} {n}. {label}</div>; })}</div>}

    {result && <div className="space-y-6 pt-6 border-t border-white/5">
      <div className={`flex items-center gap-2 text-xs ${result.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}`}>{result.status === 'SUCCESS' ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {result.status}{result.failureReason ? ` — ${result.failureReason}` : ''}</div>
      {pkg && <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Field label="Article Title" value={pkg.title} /><Field label="QA Status" value={result.qa && <span className={result.qa.overall === 'PASS' ? 'text-emerald-400' : result.qa.overall === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}>{result.qa.overall}</span>} /><Field label="Subtitle" value={pkg.subtitle} /><Field label="Confidence" value={result.qa ? `${result.qa.confidence}/100 (${result.qa.status})` : null} /></div>
        <Field label="Article" value={<div className="whitespace-pre-wrap bg-black/40 border border-white/5 p-5 text-sm leading-7 text-zinc-300">{pkg.article}</div>} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Field label="Instagram Headline" value={pkg.instagramHeadline} /><Field label="Instagram Subheadline" value={pkg.instagramSubheadline} /></div>
        <Field label="Instagram Caption" value={pkg.caption} />
        {cover && <EditorialCoverStudio value={cover} onChange={setCover} />}
        <div className="border border-white/10 bg-black/30 p-5 space-y-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500"><ImageIcon size={13} /> Recommended source image</div>{cover?.imageUrl && <img src={cover.imageUrl} alt="Recommended source" className="max-h-80 max-w-full object-contain border border-white/10" />}<p className="text-xs text-zinc-500">{cover?.imageReason || pkg.imageReason}</p></div>
        {result.qa?.checks?.length ? <div className="space-y-2"><div className="text-[10px] uppercase tracking-widest text-zinc-500">QA Notes</div>{result.qa.checks.map((check) => <div key={`${check.check}-${check.message}`} className="flex gap-2 text-xs text-zinc-500"><AlertTriangle size={12} className={check.severity === 'FAIL' ? 'text-rose-400' : 'text-amber-400'} /><span><strong className="text-zinc-300">{check.check}:</strong> {check.message}</span></div>)}</div> : null}
        <div className="space-y-2"><div className="text-[10px] uppercase tracking-widest text-zinc-500">Sources Used</div>{pkg.sourcesUsed.map((sourceId) => { const source = result.sources.find((s) => s.sourceId === sourceId); return <a key={sourceId} href={source?.url} target="_blank" rel="noreferrer" className="block bg-black/40 border border-white/5 p-3 text-xs text-zinc-400 hover:text-white">{sourceId} — {source?.title || source?.url || 'Source'}</a>; })}</div>
        {!publishedArticleId && <div className="border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="text-amber-400 text-xs font-bold uppercase tracking-widest">Generated — Not Published</div><div className="text-zinc-400 text-xs mt-1">Review the article and cover above. Nothing is public until you confirm.</div></div><button onClick={() => { setPublishError(null); setShowPublishConfirm(true); }} disabled={publishing || !cover?.imageUrl} className="px-6 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"><Send size={14} /> Confirm &amp; Publish Now</button></div>}
      </>}
    </div>}

    {showPublishConfirm && pkg && cover && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"><div className="w-full max-w-md bg-zinc-950 border border-white/10 p-8 space-y-6"><div className="flex items-start justify-between"><h3 className="text-lg font-serif">Confirm Publication</h3><button onClick={() => setShowPublishConfirm(false)}><X size={16} /></button></div><p className="text-sm text-zinc-300">Publish <strong>“{pkg.title}”</strong> on THE RESERVE?</p><p className="text-[10px] text-zinc-500 uppercase tracking-widest">No AI request is made by publishing. The reviewed cover image and copy will be used.</p><div className="flex gap-4"><button onClick={() => setShowPublishConfirm(false)} className="flex-1 py-3 border border-white/10 text-[10px] uppercase tracking-widest">Cancel</button><button onClick={handlePublish} disabled={publishing} className="flex-1 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">{publishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} {publishing ? 'Publishing…' : 'Publish Now'}</button></div></div></div>}

    {publishError && <div className="flex items-center gap-2 text-rose-400 text-xs border border-rose-500/20 bg-rose-500/5 p-4"><XCircle size={14} /> {publishError}</div>}
    {publishedArticleId && publishedSlug && <div className="border border-emerald-500/30 bg-emerald-500/5 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="text-emerald-400 text-xs font-bold uppercase tracking-widest">PUBLISHED SUCCESSFULLY</div><div className="text-zinc-400 text-xs mt-1">The article is now live on THE RESERVE.</div></div><a href={publishedUrl || '#'} target="_blank" rel="noopener noreferrer" className="px-6 py-3 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"><ExternalLink size={14} /> View Published Article</a></div>}
  </div>;
}
