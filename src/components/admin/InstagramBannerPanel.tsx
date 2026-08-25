import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ImageIcon, UploadCloud, Download, CheckCircle2, XCircle, RotateCcw, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { instagramPublishService } from '../../services/instagramPublishService';
import { bannerUploadService } from '../../services/bannerUploadService';
import {
  renderInstagramBanner,
  canvasToPngBlob,
  loadImage,
  BANNER_WIDTH,
  BANNER_HEIGHT,
  EDITORIAL_DEFAULT_COLORS,
  NEWS_DEFAULT_COLORS,
  NEWS_PHOTO_BOX,
  type BannerTemplate,
  type InstagramBannerOverrides,
  type ElementOverride,
} from '../../lib/instagramBannerRenderer';
import { segmentSubject } from '../../lib/subjectSegmentation';
import FocalPointEditor from './shared/FocalPointEditor';

// Instagram Banner Automation -- manual, on-demand step run from either a
// finished editorial generation's result (Editorial Factory, right after
// generating) or an already-archived article (Stories Archive's edit
// view, reopened any time later -- see StoriesSection.tsx). Prefills THE
// RESERVE's fixed banner template (see instagramBannerRenderer.ts -- the
// layout itself is not editable here, only its text/image inputs and the
// four adjustable elements below are) from whichever caller's package,
// lets the admin adjust those inputs, renders a live preview in the
// browser via <canvas>, and on request uploads the result to Cloudflare
// R2 (see src/services/r2StorageService.ts + bannerUploadService.ts --
// R2 is used for this ONE upload only; every DB record still lives in
// Supabase) and records its public R2 URL + full render configuration +
// Instagram publish status on `recordTable`'s row (either an
// editorial_generations row or an articles row -- both carry identical
// instagram_banner_url / instagram_banner_config / instagram_media_id /
// instagram_published_at columns for exactly this reason) so reopening
// it later restores the exact same manual layout and shows whether it's
// already been posted.
//
// No AI request of any kind happens in this component -- rendering is
// pure client-side canvas drawing, and the only network calls are the
// admin-gated image proxy (to load the source photo without tainting the
// canvas -- see server.ts's /api/admin/image-proxy), the R2 banner
// upload, the Instagram publish route, and reading/writing recordTable's
// saved config + publish status (all three of those last reads/writes
// stay on Supabase).

interface SourceSummary {
  sourceId: string;
  url: string;
  title: string | null;
  publisher: string | null;
  status: string;
  wordCount: number;
}

interface InstagramBannerPanelProps {
  /** The row this banner's config + publish status persists against, or null to run without persistence (nothing saved/restored, no already-published tracking -- rendering, download, upload, and publish still all work). */
  recordId: string | null;
  /** Which table `recordId` refers to. Defaults to 'editorial_generations' (the Editorial Factory entry point); pass 'articles' when mounting from the Stories Archive. */
  recordTable?: 'editorial_generations' | 'articles';
  /** Which banner layout this panel starts on -- 'editorial' (Editorial Factory) or 'news' (News Factory). The admin can still switch templates via the toggle below; this only sets the initial state, and is overridden by a saved config's own recorded template on reopen (see the restore effect). Defaults to 'editorial'. */
  defaultTemplate?: BannerTemplate;
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
  emphasis: EMPTY_OVERRIDE,
};

/** What gets saved to recordTable.instagram_banner_config -- everything needed to reproduce this exact banner on reopen, not just the resulting image. `overrides` already carries each element's `color` (see ElementOverride), so no separate color field is needed here. `template`/`emphasisPhrase`/`newsLayout` are optional so a banner saved before these existed still loads fine (falls back to 'editorial'/''/'text-left' -- see the restore effect). */
interface SavedBannerConfig {
  template?: BannerTemplate;
  kicker: string;
  subtitle: string;
  headline: string;
  creditLine: string;
  emphasisPhrase?: string;
  /** News only. Which side the text column sits on -- see InstagramBannerParams's newsLayout doc comment (instagramBannerRenderer.ts). */
  newsLayout?: 'text-left' | 'text-right';
  imageUrl: string;
  focalX: number;
  focalY: number;
  /** 100-200. Optional so a banner saved before zoom existed still loads fine (falls back to 100 -- see the restore effect). */
  zoom?: number;
  overrides: Required<InstagramBannerOverrides>;
}

/** One row in the manual adjustment panel: a font-size stepper, X/Y nudge inputs, an optional color picker, and a "Reset to auto" button. Position is a numeric nudge rather than drag-on-canvas -- see the header comment on the "Manual Adjustments" section below for why. */
function ElementAdjustRow({
  label,
  value,
  onChange,
  autoFontSizeLabel,
  minFontSize,
  maxFontSize,
  defaultColor,
  hideSizePosition,
}: {
  label: string;
  value: ElementOverride;
  onChange: (next: ElementOverride) => void;
  autoFontSizeLabel?: string;
  minFontSize?: number;
  maxFontSize?: number;
  /** Sampled brand default this element's color picker starts at (and "Reset to Auto" restores). Omit for elements with no drawable color (the Logo row) -- the color picker itself is hidden in that case. */
  defaultColor?: string;
  /** True for elements with no independent size/position of their own -- e.g. the news template's emphasis phrase, which is inline text riding on the headline's own layout. Only the color control + reset button render; `autoFontSizeLabel`/`minFontSize`/`maxFontSize` are unused in that case. */
  hideSizePosition?: boolean;
}) {
  const isAuto = value.fontSize === undefined;
  const isAutoColor = value.color === undefined;
  const isAutoOverall = hideSizePosition ? isAutoColor : isAuto && isAutoColor && value.offsetX === 0 && value.offsetY === 0;
  return (
    <div className="space-y-2 bg-black/30 border border-white/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">{label}</span>
        <button
          onClick={() => onChange(EMPTY_OVERRIDE)}
          disabled={isAutoOverall}
          className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-reserve-accent hover:text-white disabled:opacity-30 disabled:cursor-default"
        >
          <RotateCcw size={10} /> Reset to Auto
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 items-center">
        {!hideSizePosition && (
          <>
            <div className="col-span-3 flex items-center gap-2">
              <span className="text-[9px] text-zinc-600 w-16 shrink-0">Font size</span>
              <input
                type="range"
                min={minFontSize}
                max={maxFontSize}
                step={1}
                value={value.fontSize ?? ((minFontSize ?? 0) + (maxFontSize ?? 0)) / 2}
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
          </>
        )}
        {defaultColor && (
          <div className="col-span-3 flex items-center gap-2 pt-1">
            <span className="text-[9px] text-zinc-600 w-16 shrink-0">Color</span>
            <input
              type="color"
              value={value.color ?? defaultColor}
              onChange={(e) => onChange({ ...value, color: e.target.value })}
              className="w-8 h-6 bg-black border border-white/10 p-0.5 cursor-pointer"
            />
            <input
              type="text"
              value={value.color ?? defaultColor}
              onChange={(e) => onChange({ ...value, color: e.target.value })}
              className="flex-1 bg-black border border-white/10 p-1.5 text-[10px] font-mono uppercase"
              maxLength={7}
            />
            <span className="text-[9px] text-zinc-600 w-16 text-right">{isAutoColor ? 'Auto' : 'Custom'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstagramBannerPanel({
  recordId,
  recordTable = 'editorial_generations',
  defaultTemplate = 'editorial',
  editorialPackage,
  sources,
}: InstagramBannerPanelProps) {
  const [expanded, setExpanded] = useState(false);
  // Which layout to draw -- admin-switchable (see the toggle below), not
  // just a fixed prop, so reopening an archived article can freely try
  // either look regardless of which Factory it originated from.
  const [template, setTemplate] = useState<BannerTemplate>(defaultTemplate);
  const [kicker, setKicker] = useState(editorialPackage.coverKicker);
  const [subtitle, setSubtitle] = useState(editorialPackage.coverSecondaryLine);
  const [headline, setHeadline] = useState(editorialPackage.instagramHeadline);
  // News template only -- the exact substring of `headline` to render in
  // red. Deliberately empty by default rather than pre-filled from any
  // "last N words" guess: the spec is explicit that this must be fully
  // admin-controlled, not a heuristic that might grab the wrong phrase.
  const [emphasisPhrase, setEmphasisPhrase] = useState('');
  // News template only -- which side the text column sits on. Defaults to
  // 'text-left' on a new banner (not toggled), and is freely switchable
  // per-banner via the toggle below regardless of that default.
  const [newsLayout, setNewsLayout] = useState<'text-left' | 'text-right'>('text-left');
  const [imageUrl, setImageUrl] = useState(editorialPackage.imageUrl);
  // Cover-fit focal point (0-100 per axis, same semantics as CSS
  // object-position -- see FocalPointEditor and
  // instagramBannerRenderer.ts's draw math). Reset to centered whenever
  // the image URL changes, since a focal point picked for one photo
  // rarely makes sense on a different one.
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  // 100-200, same units/semantics as FocalPointEditor's zoom slider.
  // Reset alongside focalX/focalY whenever the image URL changes, for the
  // same reason: a zoom level picked for one photo rarely fits another.
  const [zoom, setZoom] = useState(100);
  const [creditLine, setCreditLine] = useState(() => {
    const publisher = sources.find((s) => s.status === 'SUCCESS')?.publisher;
    if (defaultTemplate === 'news') return publisher ? `Source: ${publisher}` : 'Source: THE RESERVE';
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
  // uploaded (uploadedUrl set, the R2 public URL), since the Graph API's
  // /media endpoint requires a publicly-fetchable image_url, not a raw
  // file. Caption is seeded from the editorial headline once and then
  // freely editable -- never re-synced on later headline/kicker edits, so
  // an admin's manual caption tweak is never silently overwritten.
  const [caption, setCaption] = useState(() => editorialPackage.instagramHeadline || editorialPackage.coverKicker || '');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Set either from a fresh publish this session (permalink included) or
  // restored on mount from recordTable's instagram_media_id/
  // instagram_published_at (permalink unknown for a restored one -- it
  // was never persisted, only the media id was -- so the status still
  // shows correctly, just without a clickable link).
  const [publishResult, setPublishResult] = useState<{ mediaId: string; permalink: string | null; publishedAt: string } | null>(null);
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

  // Restore a previously-saved manual layout and publish status, if this
  // record has one. Only ever reads -- never writes here; saving happens
  // explicitly via "Upload Banner" (R2 URL + config) and "Publish to
  // Instagram" (media id/published-at) below.
  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from(recordTable)
        .select('instagram_banner_config, instagram_media_id, instagram_published_at')
        .eq('id', recordId)
        .maybeSingle();
      if (cancelled || fetchError || !data) return;
      if (data.instagram_banner_config) {
        const saved = data.instagram_banner_config as SavedBannerConfig;
        setTemplate(saved.template ?? defaultTemplate);
        setKicker(saved.kicker ?? kicker);
        setSubtitle(saved.subtitle ?? subtitle);
        setHeadline(saved.headline ?? headline);
        setEmphasisPhrase(saved.emphasisPhrase ?? '');
        setNewsLayout(saved.newsLayout ?? 'text-left');
        setCreditLine(saved.creditLine ?? creditLine);
        setImageUrl(saved.imageUrl ?? imageUrl);
        setFocalX(saved.focalX ?? 50);
        setFocalY(saved.focalY ?? 50);
        setZoom(saved.zoom ?? 100);
        setOverrides(saved.overrides ?? DEFAULT_OVERRIDES);
        setLoadedSavedConfig(true);
      }
      if (data.instagram_media_id && data.instagram_published_at) {
        setPublishResult({ mediaId: data.instagram_media_id, permalink: null, publishedAt: data.instagram_published_at });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once per recordId, not on every field edit
  }, [recordId, recordTable]);

  const renderFromSrc = async (imageSrc: string) => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas is not ready.');
    await renderInstagramBanner(canvas, {
      template,
      imageSrc,
      kicker,
      subtitle,
      headline,
      emphasisPhrase,
      newsLayout,
      creditLine,
      focalX,
      focalY,
      zoom,
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
  }, [template, kicker, subtitle, headline, emphasisPhrase, newsLayout, creditLine, focalX, focalY, zoom, overrides, hasPreview]);

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

  const uploadBanner = async () => {
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
      // Bytes go to Cloudflare R2 (server-side, via
      // /api/admin/instagram-banner-upload -- see bannerUploadService.ts)
      // rather than Supabase Storage. The record of that upload (URL +
      // config) still goes to Supabase below, unchanged.
      const publicUrl = await bannerUploadService.uploadRenderedBanner(blob, recordId);

      if (recordId) {
        const config: SavedBannerConfig = { template, kicker, subtitle, headline, emphasisPhrase, newsLayout, creditLine, imageUrl, focalX, focalY, zoom, overrides };
        const { error: dbError } = await supabase
          .from(recordTable)
          .update({ instagram_banner_url: publicUrl, instagram_banner_config: config })
          .eq('id', recordId);
        // The banner itself uploaded fine even if this fails -- surface it
        // as a visible (but non-fatal) note rather than silently losing
        // the association, mirroring mediaService.uploadFile's pattern.
        if (dbError) console.error(`Instagram banner uploaded, but failed to record its URL/config on the ${recordTable} row:`, dbError);
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
      setPublishError('Upload the banner first -- Instagram needs a public image URL.');
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
      const publishedAt = new Date().toISOString();
      setPublishResult({ ...result, publishedAt });

      if (recordId) {
        const { error: dbError } = await supabase
          .from(recordTable)
          .update({ instagram_media_id: result.mediaId, instagram_published_at: publishedAt })
          .eq('id', recordId);
        // The post itself went out fine even if this fails -- surface it
        // as a visible (but non-fatal) note rather than silently losing
        // the "already published" status, mirroring the banner upload's
        // own non-fatal DB-write pattern above.
        if (dbError) console.error(`Published to Instagram, but failed to record publish status on the ${recordTable} row:`, dbError);
      }
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
          Instagram Banner -- {template === 'news' ? 'News' : 'Editorial'} template{loadedSavedConfig ? ' (restored saved layout)' : ''}
        </span>
        <button onClick={() => setExpanded(false)} className="text-zinc-500 hover:text-white text-[10px] uppercase tracking-widest">
          Collapse
        </button>
      </div>

      {/* Template toggle -- which Factory a banner originated from only
          sets the INITIAL template (defaultTemplate); it stays freely
          switchable here so a reopened article can try either look. */}
      <div className="flex gap-2">
        {(['editorial', 'news'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTemplate(t)}
            className={`px-4 py-2 text-[9px] uppercase tracking-widest border transition-all ${
              template === t ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500 hover:text-white'
            }`}
          >
            {t === 'news' ? 'News' : 'Editorial'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {template === 'editorial' && (
            <>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Kicker</label>
                <input className="w-full bg-black border border-white/10 p-3 text-xs" value={kicker} onChange={(e) => setKicker(e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Subtitle (up to 2 lines -- use a line break to force a split)</label>
                <textarea className="w-full bg-black border border-white/10 p-3 text-xs" rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Headline</label>
            <input className="w-full bg-black border border-white/10 p-3 text-xs" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
          </div>
          {template === 'news' && (
            <>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">
                  Emphasis phrase -- the exact words from the headline above to render in red
                </label>
                <input
                  className="w-full bg-black border border-white/10 p-3 text-xs"
                  value={emphasisPhrase}
                  onChange={(e) => setEmphasisPhrase(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. the final clause of the headline"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">Layout</label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'text-left' as const, label: 'Text Left / Image Right' },
                      { value: 'text-right' as const, label: 'Text Right / Image Left' },
                    ]
                  ).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setNewsLayout(option.value)}
                      className={`flex-1 px-3 py-2.5 text-[9px] uppercase tracking-widest border transition-all ${
                        newsLayout === option.value ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-600 block">{template === 'news' ? 'Source line' : 'Credit line'}</label>
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
                setZoom(100);
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
              onClick={uploadBanner}
              disabled={!hasPreview || uploading}
              className="px-6 py-3 border border-white/10 text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/5 transition-all disabled:opacity-30"
            >
              {uploading ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />}
              Upload Banner
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
              title={!uploadedUrl ? 'Upload the banner first' : undefined}
              className="px-6 py-3 bg-reserve-accent text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-default"
            >
              {publishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              {publishResult ? 'Re-publish to Instagram' : 'Publish to Instagram'}
            </button>
            {publishError && (
              <div className="flex items-center gap-2 text-rose-500 text-[10px]">
                <XCircle size={12} className="shrink-0" /> {publishError}
              </div>
            )}
            {publishResult && (
              <div className="flex items-center gap-2 text-emerald-400 text-[10px] break-all">
                <CheckCircle2 size={12} className="shrink-0" /> Published {new Date(publishResult.publishedAt).toLocaleString()} --{' '}
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
            {template === 'editorial' && (
              <>
                <ElementAdjustRow
                  label="Kicker"
                  value={overrides.kicker}
                  onChange={(next) => setOverrides((prev) => ({ ...prev, kicker: next }))}
                  autoFontSizeLabel="Auto (28px)"
                  minFontSize={16}
                  maxFontSize={48}
                  defaultColor={EDITORIAL_DEFAULT_COLORS.kicker}
                />
                <ElementAdjustRow
                  label="Subtitle"
                  value={overrides.subtitle}
                  onChange={(next) => setOverrides((prev) => ({ ...prev, subtitle: next }))}
                  autoFontSizeLabel="Auto (32px)"
                  minFontSize={18}
                  maxFontSize={52}
                  defaultColor={EDITORIAL_DEFAULT_COLORS.subtitle}
                />
              </>
            )}
            <ElementAdjustRow
              label="Headline"
              value={overrides.headline}
              onChange={(next) => setOverrides((prev) => ({ ...prev, headline: next }))}
              autoFontSizeLabel="Auto (fit)"
              minFontSize={36}
              maxFontSize={template === 'news' ? 72 : 120}
              defaultColor={template === 'news' ? NEWS_DEFAULT_COLORS.headline : EDITORIAL_DEFAULT_COLORS.headline}
            />
            {template === 'news' && (
              <ElementAdjustRow
                label="Emphasis Phrase"
                value={overrides.emphasis}
                onChange={(next) => setOverrides((prev) => ({ ...prev, emphasis: next }))}
                defaultColor={NEWS_DEFAULT_COLORS.emphasis}
                hideSizePosition
              />
            )}
            <ElementAdjustRow
              label="Logo"
              value={overrides.logo}
              onChange={(next) => setOverrides((prev) => ({ ...prev, logo: next }))}
              autoFontSizeLabel={template === 'news' ? 'Auto (64px)' : 'Auto (84px)'}
              minFontSize={40}
              maxFontSize={160}
            />
          </div>
        </div>
      )}

      {/* Crop/focal-point editor -- the shared component also used by the
          article editor's mobile hero crop tool (StoriesSection.tsx),
          here in full 2D mode since both templates' photo regions crop
          arbitrary source photos on both axes. Editorial's photo fills
          the whole 1080x1350 frame; news's is confined to the fixed
          NEWS_PHOTO_BOX on the right -- aspectRatio matches whichever is
          active so the crop preview reflects what actually renders. Its
          own preview uses the image URL directly (a plain <img> can
          display a cross-origin image fine -- only canvas export needs
          the proxy), so it gives instant feedback without waiting on a
          fetch. Once a preview has been rendered, focal-point/zoom
          changes also live-update the actual canvas above (see the
          effect above). targetWidth/targetHeight (the same fixed pixel
          box computeCoverFit renders into) are passed through so the
          editor can warn if the current zoom would upscale a
          lower-resolution source photo. */}
      {imageUrl.trim() && (
        <div className="pt-6 border-t border-white/5">
          <FocalPointEditor
            axis="both"
            aspectRatio={template === 'news' ? `${NEWS_PHOTO_BOX.width}/${NEWS_PHOTO_BOX.height}` : `${BANNER_WIDTH}/${BANNER_HEIGHT}`}
            imageUrl={imageUrl.trim()}
            x={focalX}
            y={focalY}
            onChange={(x, y) => {
              setFocalX(x);
              setFocalY(y);
            }}
            zoom={zoom}
            onZoomChange={setZoom}
            targetWidth={template === 'news' ? NEWS_PHOTO_BOX.width : BANNER_WIDTH}
            targetHeight={template === 'news' ? NEWS_PHOTO_BOX.height : BANNER_HEIGHT}
            title="Banner Focal Point"
            helpText={template === 'news' ? 'Define the focal point and zoom for the photo box.' : "Define the focal point and zoom for the banner's fixed frame."}
          />
        </div>
      )}
    </div>
  );
}
