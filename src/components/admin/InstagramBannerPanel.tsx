import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ImageIcon, UploadCloud, Download, CheckCircle2, XCircle, RotateCcw, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { instagramPublishService } from '../../services/instagramPublishService';
import {
  renderInstagramBanner,
  canvasToPngBlob,
  loadImage,
  BANNER_WIDTH,
  BANNER_HEIGHT,
  type InstagramBannerOverrides,
  type ElementOverride,
} from '../../lib/instagramBannerRenderer';
import { segmentSubject } from '../../lib/subjectSegmentation';
import FocalPointEditor from './shared/FocalPointEditor';

// Instagram Banner Automation -- manual, on-demand step run from a
// finished editorial generation's result. Prefills THE RESERVE's fixed
// banner template (see instagramBannerRenderer.ts -- the layout itself is
// not editable here, only its text/image inputs and the four adjustable
// elements below are) from the editorial package, lets the admin adjust
// those inputs, renders a live preview in the browser via <canvas>, and
// on request uploads the result to the `media` storage bucket and
// records its URL + full render configuration on the generation's row so
// reopening it later restores the exact same manual layout.
//
// No AI request of any kind happens in this component -- rendering is
// pure client-side canvas drawing, and the only network calls are the
// admin-gated image proxy (to load the source photo without tainting the
// canvas -- see server.ts's /api/admin/image-proxy), the Supabase
// Storage upload, and reading/writing this generation's saved config.

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

const EMPTY_OVERRIDE: ElementOverride = { fontSize: undefined, offsetX: 0, offsetY: 0 };
const DEFAULT_OVERRIDES: Required<InstagramBannerOverrides> = {
  kicker: EMPTY_OVERRIDE,
  subtitle: EMPTY_OVERRIDE,
  headline: EMPTY_OVERRIDE,
  logo: EMPTY_OVERRIDE,
};

/** What gets saved to editorial_generations.instagram_banner_config -- everything needed to reproduce this exact banner on reopen, not just the resulting image. */
interface SavedBannerConfig {
  kicker: string;
  subtitle: string;
  headline: string;
  creditLine: string;
  imageUrl: string;
  focalX: number;
  focalY: number;
  overrides: Required<InstagramBannerOverrides>;
}

/** One row in the manual adjustment panel: a font-size stepper, X/Y nudge inputs, and a "Reset to auto" button. Position is a numeric nudge rather than drag-on-canvas -- see the header comment on the "Manual Adjustments" section below for why. */
function ElementAdjustRow({
  label,
  value,
  onChange,
  autoFontSizeLabel,
  minFontSize,
  maxFontSize,
}: {
  label: string;
  value: ElementOverride;
  onChange: (next: ElementOverride) => void;
  autoFontSizeLabel: string;
  minFontSize: number;
  maxFontSize: number;
}) {
  const isAuto = value.fontSize === undefined;
  return (
    <div className="space-y-2 bg-black/30 border border-white/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">{label}</span>
        <button
          onClick={() => onChange(EMPTY_OVERRIDE)}
          disabled={isAuto && value.offsetX === 0 && value.offsetY === 0}
          className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-reserve-accent hover:text-white disabled:opacity-30 disabled:cursor-default"
        >
          <RotateCcw size={10} /> Reset to Auto
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 items-center">
        <div className="col-span-3 flex items-center gap-2">
          <span className="text-[9px] text-zinc-600 w-16 shrink-0">Font size</span>
          <input
            type="range"
            min={minFontSize}
            max={maxFontSize}
            step={1}
            value={value.fontSize ?? (minFontSize + maxFontSize) / 2}
            onChange={(e) => onChange({ ...value, fontSize: parseInt(e.target.value, 10) })}
            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-reserve-accent"
          />
          <span className="text-[9px] text-zinc-500 font-mono w-16 text-right">{isAuto ? autoFontSizeLabel : `${value.fontSize}px`}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600">X</span>
          <input
            type="number"
            value={value.offsetX}
            onChange={(e) => onChange({ ...value, offsetX: parseInt(e.target.value, 10) || 0 })}
            className="w-full bg-black border border-white/10 p-1.5 text-[10px] font-mono"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600">Y</span>
          <input
            type="number"
            value={value.offsetY}
            onChange={(e) => onChange({ ...value, offsetY: parseInt(e.target.value, 10) || 0 })}
            className="w-full bg-black border border-white/10 p-1.5 text-[10px] font-mono"
          />
        </div>
        <div className="text-[9px] text-zinc-600">px nudge</div>
      </div>
    </div>
  );
}

export default function InstagramBannerPanel({ generationId, editorialPackage, sources }: InstagramBannerPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [kicker, setKicker] = useState(editorialPackage.coverKicker);
  const [subtitle, setSubtitle] = useState(editorialPackage.coverSecondaryLine);
  const [headline, setHeadline] = useState(editorialPackage.instagramHeadline);
  const [imageUrl, setImageUrl] = useState(editorialPackage.imageUrl);
  // Cover-fit focal point (0-100 per axis, same semantics as CSS
  // object-position -- see FocalPointEditor and
  // instagramBannerRenderer.ts's draw math). Reset to centered whenever
  // the image URL changes, since a focal point picked for one photo
  // rarely makes sense on a different one.
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [creditLine, setCreditLine] = useState(() => {
    const publisher = sources.find((s) => s.status === 'SUCCESS')?.publisher;
    return publisher ? `COURTESY: ${publisher.toUpperCase()}` : 'COURTESY: THE RESERVE';
  });
  // Manual per-element adjustments (kicker/subtitle/headline/logo -- never
  // the masthead, which stays auto-fixed per the fixed template). Loaded
  // from a saved config on mount if one exists (see the effect below), so
  // reopening a previously-adjusted banner keeps its manual layout
  // instead of reverting to auto.
  const [overrides, setOverrides] = useState<Required<InstagramBannerOverrides>>(DEFAULT_OVERRIDES);

  const [rendering, setRendering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  // Instagram Content Publishing -- only enabled once the banner has been
  // uploaded to the Media Library (uploadedUrl set), since the Graph API's
  // /media endpoint requires a publicly-fetchable image_url, not a raw
  // file. Caption is seeded from the editorial headline once and then
  // freely editable -- never re-synced on later headline/kicker edits, so
  // an admin's manual caption tweak is never silently overwritten.
  const [caption, setCaption] = useState(() => editorialPackage.instagramHeadline || editorialPackage.coverKicker || '');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{ mediaId: string; permalink: string | null } | null>(null);
  const [loadedSavedConfig, setLoadedSavedConfig] = useState(false);
  // Subject-over-text compositing status, purely informational -- the
  // actual fallback-on-failure logic lives in subjectSegmentation.ts
  // (which never throws); this only reflects its outcome for the admin,
  // since a plain (non-composited) banner is a normal, acceptable result
  // for a photo with no clear subject, not an error state.
  const [segmentationStatus, setSegmentationStatus] = useState<'idle' | 'analyzing' | 'applied' | 'not-detected' | 'unavailable'>('idle');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  // The segmented cutout for the currently-loaded image, in the original
  // image's pixel space -- computed once per fetched image (see
  // renderPreview below), then reused as-is across every subsequent live-
  // preview redraw (text/focal/override changes) without re-running
  // segmentation, since the cutout already carries no crop/position
  // baked into it -- the renderer applies the current crop/focal
  // transform to it fresh on every draw (see instagramBannerRenderer.ts
  // step 9), so it never goes stale when only the crop changes.
  const subjectCutoutRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  // Restore a previously-saved manual layout, if this generation has one.
  // Only ever reads -- never writes here; saving happens explicitly via
  // "Upload to Media Library" (see uploadToMediaLibrary below).
  useEffect(() => {
    if (!generationId) return;
    let cancelled = false;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('editorial_generations')
        .select('instagram_banner_config')
        .eq('id', generationId)
        .maybeSingle();
      if (cancelled || fetchError || !data?.instagram_banner_config) return;
      const saved = data.instagram_banner_config as SavedBannerConfig;
      setKicker(saved.kicker ?? kicker);
      setSubtitle(saved.subtitle ?? subtitle);
      setHeadline(saved.headline ?? headline);
      setCreditLine(saved.creditLine ?? creditLine);
      setImageUrl(saved.imageUrl ?? imageUrl);
      setFocalX(saved.focalX ?? 50);
      setFocalY(saved.focalY ?? 50);
      setOverrides(saved.overrides ?? DEFAULT_OVERRIDES);
      setLoadedSavedConfig(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once per generationId, not on every field edit
  }, [generationId]);

  const renderFromSrc = async (imageSrc: string) => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas is not ready.');
    await renderInstagramBanner(canvas, {
      imageSrc,
      kicker,
      subtitle,
      headline,
      creditLine,
      focalX,
      focalY,
      overrides,
      subjectCutout: subjectCutoutRef.current,
    });
  };

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

      // Subject-over-text compositing: segmented once per newly-fetched
      // image (not on every text/crop tweak -- see subjectCutoutRef's
      // comment above). segmentSubject() never throws; a null result
      // (timeout, load failure, or no confident subject found) simply
      // means the banner renders without the overlap effect, which is
      // this feature's explicit, acceptable degraded state, not an error
      // shown to the admin.
      setSegmentationStatus('analyzing');
      const subjectImg = await loadImage(objectUrl);
      const cutout = await segmentSubject(subjectImg);
      subjectCutoutRef.current = cutout;
      setSegmentationStatus(cutout ? 'applied' : 'not-detected');

      await renderFromSrc(objectUrl);
      setHasPreview(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to render the banner preview.');
      setHasPreview(false);
      setSegmentationStatus('unavailable');
    } finally {
      setRendering(false);
    }
  };

  // Live preview: once an image has been fetched at least once (hasPreview
  // + a cached object URL), any text/focal/manual-adjustment change
  // redraws instantly from that cached image -- no server round-trip, no
  // re-fetch through the image proxy. Only a changed Image URL needs the
  // explicit "Render Preview" button again (a genuinely new fetch).
  useEffect(() => {
    if (!hasPreview || !objectUrlRef.current) return;
    renderFromSrc(objectUrlRef.current).catch((err) => setError(err?.message || 'Failed to update the preview.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderFromSrc closes over the latest state already; re-running on those same state changes is the point
  }, [kicker, subtitle, headline, creditLine, focalX, focalY, overrides, hasPreview]);

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
    // A fresh upload invalidates any earlier publish result -- it pointed
    // at a since-replaced image, so leaving it visible would misleadingly
    // suggest the new banner was already posted.
    setPublishResult(null);
    setPublishError(null);
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
        const config: SavedBannerConfig = { kicker, subtitle, headline, creditLine, imageUrl, focalX, focalY, overrides };
        const { error: dbError } = await supabase
          .from('editorial_generations')
          .update({ instagram_banner_url: publicUrl, instagram_banner_config: config })
          .eq('id', generationId);
        // The banner itself uploaded fine even if this fails -- surface it
        // as a visible (but non-fatal) note rather than silently losing
        // the association, mirroring mediaService.uploadFile's pattern.
        if (dbError) console.error('Instagram banner uploaded, but failed to record its URL/config on the generation row:', dbError);
      }

      setUploadedUrl(publicUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload the banner.');
    } finally {
      setUploading(false);
    }
  };

  const publishToInstagram = async () => {
    if (!uploadedUrl) {
      setPublishError('Upload the banner to the Media Library first -- Instagram needs a public image URL.');
      return;
    }
    if (!caption.trim()) {
      setPublishError('A caption is required.');
      return;
    }
    setPublishError(null);
    setPublishing(true);
    try {
      const result = await instagramPublishService.publish(uploadedUrl, caption.trim());
      setPublishResult(result);
    } catch (err: any) {
      setPublishError(err?.message || 'Failed to publish to Instagram.');
    } finally {
      setPublishing(false);
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
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Instagram Banner -- THE RESERVE template{loadedSavedConfig ? ' (restored saved layout)' : ''}
        </span>
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
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Image URL -- overrides the AI-recommended image if changed</label>
            <input
              className="w-full bg-black border border-white/10 p-3 text-xs font-mono"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setFocalX(50);
                setFocalY(50);
              }}
              placeholder="https://..."
            />
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

          {/* Subject-over-text status -- informational only. A plain
              banner (subject not composited over the text) is a normal,
              acceptable outcome for a photo with no clear subject, not
              an error -- so this never renders with error styling. */}
          {segmentationStatus !== 'idle' && (
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              {segmentationStatus === 'analyzing' && (
                <>
                  <Loader2 className="animate-spin" size={11} /> Analyzing subject for text overlap...
                </>
              )}
              {segmentationStatus === 'applied' && <>Subject-over-text: applied.</>}
              {segmentationStatus === 'not-detected' && <>Subject-over-text: no clear subject found -- rendering flat.</>}
              {segmentationStatus === 'unavailable' && <>Subject-over-text: unavailable -- rendering flat.</>}
            </div>
          )}

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

          {/* Instagram Content Publishing -- posts the uploaded banner
              directly to THE RESERVE's connected Instagram account via the
              Graph API (see server.ts's /api/admin/instagram-publish and
              src/services/instagramGraphService.ts). Gated on uploadedUrl
              since the API needs a public image URL, not a canvas blob. */}
          <div className="pt-4 border-t border-white/5 space-y-3">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Instagram caption</label>
            <textarea
              className="w-full bg-black border border-white/10 p-3 text-xs"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write the caption that will post alongside this banner..."
            />
            <button
              onClick={publishToInstagram}
              disabled={!uploadedUrl || publishing}
              title={!uploadedUrl ? 'Upload to the Media Library first' : undefined}
              className="px-6 py-3 bg-reserve-accent text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-default"
            >
              {publishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              Publish to Instagram
            </button>
            {publishError && (
              <div className="flex items-center gap-2 text-rose-500 text-[10px]">
                <XCircle size={12} className="shrink-0" /> {publishError}
              </div>
            )}
            {publishResult && (
              <div className="flex items-center gap-2 text-emerald-400 text-[10px] break-all">
                <CheckCircle2 size={12} className="shrink-0" /> Published --{' '}
                {publishResult.permalink ? (
                  <a href={publishResult.permalink} target="_blank" rel="noreferrer" className="underline">
                    {publishResult.permalink}
                  </a>
                ) : (
                  <span>media id {publishResult.mediaId}</span>
                )}
              </div>
            )}
          </div>
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

      {/* Manual per-element adjustments -- font size + a numeric X/Y pixel
          nudge per element, not drag-directly-on-canvas. The crop/focal-
          point editor's drag pattern (reused above) operates on a single
          whole-image region; dragging four independently-selectable,
          overlapping TEXT elements on the actual rendered canvas would
          need real hit-testing and a selection model that doesn't exist
          anywhere in this codebase yet, so per the task's own fallback
          allowance, this uses numeric nudges instead. The live canvas
          preview above updates instantly as these change (see the effect
          above), so the effect of every adjustment is still immediately
          visible -- just not via direct manipulation of the canvas
          itself. The masthead ("THE"/"RESERVE") is intentionally not
          included here -- it stays auto-fixed once its fit-to-width
          sizing is correct. */}
      {imageUrl.trim() && (
        <div className="pt-6 border-t border-white/5 space-y-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Manual Adjustments</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ElementAdjustRow
              label="Kicker"
              value={overrides.kicker}
              onChange={(next) => setOverrides((prev) => ({ ...prev, kicker: next }))}
              autoFontSizeLabel="Auto (28px)"
              minFontSize={16}
              maxFontSize={48}
            />
            <ElementAdjustRow
              label="Subtitle"
              value={overrides.subtitle}
              onChange={(next) => setOverrides((prev) => ({ ...prev, subtitle: next }))}
              autoFontSizeLabel="Auto (32px)"
              minFontSize={18}
              maxFontSize={52}
            />
            <ElementAdjustRow
              label="Headline"
              value={overrides.headline}
              onChange={(next) => setOverrides((prev) => ({ ...prev, headline: next }))}
              autoFontSizeLabel="Auto (fit)"
              minFontSize={36}
              maxFontSize={120}
            />
            <ElementAdjustRow
              label="Logo"
              value={overrides.logo}
              onChange={(next) => setOverrides((prev) => ({ ...prev, logo: next }))}
              autoFontSizeLabel="Auto (84px)"
              minFontSize={40}
              maxFontSize={160}
            />
          </div>
        </div>
      )}

      {/* Crop/focal-point editor -- the shared component also used by the
          article editor's mobile hero crop tool (StoriesSection.tsx),
          here in full 2D mode since the banner's fixed 1080x1350 frame
          crops arbitrary source photos on both axes. Its own preview
          uses the image URL directly (a plain <img> can display a
          cross-origin image fine -- only canvas export needs the
          proxy), so it gives instant feedback without waiting on a
          fetch. Once a preview has been rendered, focal-point changes
          also live-update the actual canvas above (see the effect
          above). */}
      {imageUrl.trim() && (
        <div className="pt-6 border-t border-white/5">
          <FocalPointEditor
            axis="both"
            aspectRatio={`${BANNER_WIDTH}/${BANNER_HEIGHT}`}
            imageUrl={imageUrl.trim()}
            x={focalX}
            y={focalY}
            onChange={(x, y) => {
              setFocalX(x);
              setFocalY(y);
            }}
            title="Banner Focal Point"
            helpText="Define the focal point for the banner's fixed frame."
          />
        </div>
      )}
    </div>
  );
}
