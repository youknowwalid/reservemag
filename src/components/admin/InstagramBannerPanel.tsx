import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ImageIcon, UploadCloud, Download, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { renderInstagramBanner, canvasToPngBlob, BANNER_WIDTH, BANNER_HEIGHT } from '../../lib/instagramBannerRenderer';

// Instagram Banner Automation -- manual, on-demand step run from a
// finished editorial generation's result. Prefills THE RESERVE's fixed
// banner template (see instagramBannerRenderer.ts -- the layout itself is
// not editable here, only its text/image inputs are) from the editorial
// package, lets the admin adjust those inputs, renders a live preview in
// the browser via <canvas>, and on request uploads the result to the
// `media` storage bucket and records its URL on the generation's row.
//
// No AI request of any kind happens in this component -- rendering is
// pure client-side canvas drawing, and the only network calls are the
// admin-gated image proxy (to load the source photo without tainting the
// canvas -- see server.ts's /api/admin/image-proxy) and the Supabase
// Storage upload.

interface SourceSummary {
  sourceId: string;
  url: string;
  title: string | null;
  publisher: string | null;
  status: string;
  wordCount: number;
}

interface InstagramBannerPanelProps {
  generationId: string | null;
  editorialPackage: {
    coverKicker: string;
    coverSecondaryLine: string;
    instagramHeadline: string;
    imageUrl: string;
  };
  sources: SourceSummary[];
}

export default function InstagramBannerPanel({ generationId, editorialPackage, sources }: InstagramBannerPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [kicker, setKicker] = useState(editorialPackage.coverKicker);
  const [subtitle, setSubtitle] = useState(editorialPackage.coverSecondaryLine);
  const [headline, setHeadline] = useState(editorialPackage.instagramHeadline);
  const [imageUrl, setImageUrl] = useState(editorialPackage.imageUrl);
  const [creditLine, setCreditLine] = useState(() => {
    const publisher = sources.find((s) => s.status === 'SUCCESS')?.publisher;
    return publisher ? `COURTESY: ${publisher.toUpperCase()}` : 'COURTESY: THE RESERVE';
  });

  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const renderPreview = async () => {
    if (!imageUrl.trim()) {
      setError('An image URL is required to render the banner.');
      return;
    }
    setError(null);
    setUploadedUrl(null);
    setRendering(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin.');

      // Fetch the image through our own origin -- see server.ts's
      // /api/admin/image-proxy doc comment for why this can't be a plain
      // <img src="external-url">.
      const res = await fetch('/api/admin/image-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: imageUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load the image (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas is not ready.');
      await renderInstagramBanner(canvas, { imageSrc: objectUrl, kicker, subtitle, headline, creditLine });
      setHasPreview(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to render the banner preview.');
      setHasPreview(false);
    } finally {
      setRendering(false);
    }
  };

  const downloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPreview) return;
    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reserve-instagram-banner-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadToMediaLibrary = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPreview) {
      setError('Render a preview before uploading.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const blob = await canvasToPngBlob(canvas);
      const storagePath = `instagram-banners/${generationId || 'untracked'}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, blob, {
        contentType: 'image/png',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('media').getPublicUrl(storagePath);
      const publicUrl = data.publicUrl;

      if (generationId) {
        const { error: dbError } = await supabase
          .from('editorial_generations')
          .update({ instagram_banner_url: publicUrl })
          .eq('id', generationId);
        // The banner itself uploaded fine even if this fails -- surface it
        // as a visible (but non-fatal) note rather than silently losing
        // the association, mirroring mediaService.uploadFile's pattern.
        if (dbError) console.error('Instagram banner uploaded, but failed to record its URL on the generation row:', dbError);
      }

      setUploadedUrl(publicUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload the banner.');
    } finally {
      setUploading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-6 py-3 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
      >
        <ImageIcon size={14} /> Create Instagram Banner
      </button>
    );
  }

  return (
    <div className="space-y-4 bg-black/40 border border-white/5 p-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">Instagram Banner -- THE RESERVE template</span>
        <button onClick={() => setExpanded(false)} className="text-zinc-500 hover:text-white text-[10px] uppercase tracking-widest">
          Collapse
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Kicker</label>
            <input className="w-full bg-black border border-white/10 p-3 text-xs" value={kicker} onChange={(e) => setKicker(e.target.value)} maxLength={40} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Subtitle (up to 2 lines -- use a line break to force a split)</label>
            <textarea className="w-full bg-black border border-white/10 p-3 text-xs" rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Headline</label>
            <input className="w-full bg-black border border-white/10 p-3 text-xs" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Credit line</label>
            <input className="w-full bg-black border border-white/10 p-3 text-xs" value={creditLine} onChange={(e) => setCreditLine(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Image URL</label>
            <input className="w-full bg-black border border-white/10 p-3 text-xs font-mono" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={renderPreview}
              disabled={rendering}
              className="px-6 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-reserve-accent transition-all disabled:opacity-50"
            >
              {rendering ? <Loader2 className="animate-spin" size={14} /> : <ImageIcon size={14} />}
              {hasPreview ? 'Re-render Preview' : 'Render Preview'}
            </button>
            <button
              onClick={downloadPng}
              disabled={!hasPreview}
              className="px-6 py-3 border border-white/10 text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/5 transition-all disabled:opacity-30"
            >
              <Download size={14} /> Download PNG
            </button>
            <button
              onClick={uploadToMediaLibrary}
              disabled={!hasPreview || uploading}
              className="px-6 py-3 border border-white/10 text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/5 transition-all disabled:opacity-30"
            >
              {uploading ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />}
              Upload to Media Library
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-500 text-[10px]">
              <XCircle size={12} /> {error}
            </div>
          )}
          {uploadedUrl && (
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] break-all">
              <CheckCircle2 size={12} className="shrink-0" /> Uploaded --{' '}
              <a href={uploadedUrl} target="_blank" rel="noreferrer" className="underline">
                {uploadedUrl}
              </a>
            </div>
          )}
        </div>

        <div className="flex items-start justify-center">
          <canvas
            ref={canvasRef}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
            className="w-full max-w-xs border border-white/10 bg-black"
          />
        </div>
      </div>
    </div>
  );
}
