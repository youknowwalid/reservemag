import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import InstagramBannerPanel from './InstagramBannerPanel';

// Reserve Editorial Intelligence Engine -- admin UI.
//
// One click here triggers exactly one paid AI request ($0.50 against
// Tabitoken's flat per-request pricing for claude-opus-4-8-thinking), so
// generation always goes through an explicit confirmation dialog before
// anything is sent to the server -- see the CANCEL / GENERATE -- $0.50
// buttons below. The server (`/api/admin/editorial/generate`) enforces
// this too: it refuses to run without `confirmed: true` in the request
// body, so this isn't just a UI nicety.
//
// The "progress" steps below are a simulated/estimated client-side
// sequence, not real-time server events -- the backend is a single
// synchronous request/response (source retrieval, the one AI call,
// validation, and QA all happen server-side before responding), so there
// is no live progress channel to show. The steps advance on a timer while
// the request is in flight and resolve to the real outcome the moment the
// response arrives.

const PROGRESS_STEPS = [
  'Retrieving sources',
  'Preparing editorial material',
  'Generating Reserve editorial',
  'Validating',
  'QA',
  'Complete',
];

interface SourceSummary {
  sourceId: string;
  url: string;
  title: string | null;
  publisher: string | null;
  status: string;
  wordCount: number;
}

interface GenerationResult {
  id: string | null;
  status: 'SUCCESS' | 'SOURCE_RETRIEVAL_FAILED' | 'GENERATION_FAILED' | 'VALIDATION_FAILED';
  failureReason: string | null;
  sources: SourceSummary[];
  // Flat, minimal shape -- matches EditorialPackage in
  // src/services/editorial/editorialTypes.ts. `sourcesUsed` is an array of
  // source IDs (e.g. "source_1"), not full objects -- publisher/title/url
  // are looked up from `sources` above for display, so the same data
  // isn't duplicated over the wire.
  editorialPackage: {
    title: string;
    subtitle: string;
    article: string;
    instagramHeadline: string;
    instagramSubheadline: string;
    coverKicker: string;
    coverSecondaryLine: string;
    caption: string;
    imageUrl: string;
    imageReason: string;
    sourcesUsed: string[];
    warnings: string[];
  } | null;
  // status/confidence are computed server-side by editorialQA.ts, not
  // self-reported by the model -- see that file's header comment.
  qa: { overall: 'PASS' | 'WARNING' | 'FAIL'; checks: Array<{ check: string; severity: string; message: string }>; confidence: number; status: 'READY' | 'NEEDS_REVIEW' } | null;
  requestedModel: string;
  servedModel: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
  latencyMs: number | null;
}

/**
 * Safely reads the /api/admin/editorial/generate response. Every code path
 * inside that route replies with JSON (see server.ts), but the response can
 * still arrive as something else entirely if it never reaches the route
 * handler at all -- e.g. a platform-level crash page (HTML), a proxy
 * timeout (plain text), or a gateway error. Calling res.json() directly on
 * those throws a raw "Unexpected token '<'... is not valid JSON"
 * SyntaxError straight into the UI, which is neither useful nor safe (an
 * HTML error page can contain fragments of a stack trace). This reads the
 * body as text exactly once, tries to parse it as JSON regardless of the
 * declared content-type (some proxies mislabel it), and otherwise falls
 * back to a clean, generic, human-readable message. The raw body is only
 * ever logged to the browser console (a developer surface) -- never
 * rendered on screen -- and full diagnostics for the actual failure live
 * server-side, in the platform's function logs.
 */
async function parseEditorialResponse(res: Response): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  const raw = await res.text();

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    console.error('Editorial generation: non-JSON response from server.', {
      status: res.status,
      contentType: res.headers.get('content-type'),
      raw: raw.slice(0, 2000),
    });
    if (res.status >= 500) {
      return {
        ok: false,
        message:
          'The server encountered an unexpected error and did not complete the request. This does not confirm whether an AI generation was attempted -- check the Editorial Factory history before retrying, to avoid an unintended duplicate request.',
      };
    }
    return { ok: false, message: `The server returned an unexpected response (HTTP ${res.status}). Please try again, or contact an administrator if this persists.` };
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">{label}</span>
      <div className="text-zinc-300 text-xs leading-relaxed">{value ?? '--'}</div>
    </div>
  );
}

export default function EditorialGenerationPanel() {
  const [subject, setSubject] = useState('');
  const [sourceUrl1, setSourceUrl1] = useState('');
  const [sourceUrl2, setSourceUrl2] = useState('');
  const [sourceUrl3, setSourceUrl3] = useState('');
  const [requestedAngle, setRequestedAngle] = useState('');
  const [contentType, setContentType] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (stepTimer.current) clearInterval(stepTimer.current);
  }, []);

  const sourceUrls = [sourceUrl1, sourceUrl2, sourceUrl3].map((u) => u.trim()).filter(Boolean);

  const runGeneration = async () => {
    setShowConfirm(false);
    setGenerating(true);
    setError(null);
    setResult(null);
    setStep(1);

    // Advance through the estimated steps while the single request is in
    // flight. Stops at step 5 ("QA") and waits for the real response
    // rather than claiming completion before the server has actually
    // answered.
    stepTimer.current = setInterval(() => {
      setStep((s) => (s < 5 ? s + 1 : s));
    }, 4000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin to generate an editorial.');

      const res = await fetch('/api/admin/editorial/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          sourceUrls,
          subject: subject.trim() || undefined,
          requestedAngle: requestedAngle.trim() || undefined,
          contentType: contentType.trim() || undefined,
          confirmed: true,
        }),
      });
      const parsed = await parseEditorialResponse(res);
      if (parsed.ok === false) throw new Error(parsed.message);
      const data = parsed.data;
      if (!res.ok && !data?.status) throw new Error(data?.error || 'Editorial generation failed.');

      setResult(data);
      setStep(6);
    } catch (err: any) {
      setError(err?.message || 'Editorial generation failed. Please try again.');
      setStep(0);
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setGenerating(false);
    }
  };

  const handleGenerateClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceUrls.length === 0) {
      setError('At least one source URL is required.');
      return;
    }
    setError(null);
    setShowConfirm(true);
  };

  const pkg = result?.editorialPackage;

  return (
    <div className="space-y-6 bg-zinc-900/30 p-8 border border-white/5">
      <div>
        <h2 className="text-xl font-serif">Editorial Factory -- Create Editorial</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
          Reserve Editorial Intelligence Engine -- one source-to-package generation per run
        </p>
      </div>

      <form onSubmit={handleGenerateClick} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Subject (optional)</label>
            <input
              className="w-full bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Jane Doe, founder of..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Content Type (optional)</label>
            <input
              className="w-full bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              placeholder="e.g. profile, feature, interview"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Source URL 1 (required)</label>
          <input
            className="w-full bg-black border border-white/10 p-4 text-sm font-mono focus:border-reserve-accent outline-none"
            value={sourceUrl1}
            onChange={(e) => setSourceUrl1(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Source URL 2 (optional)</label>
          <input
            className="w-full bg-black border border-white/10 p-4 text-sm font-mono focus:border-reserve-accent outline-none"
            value={sourceUrl2}
            onChange={(e) => setSourceUrl2(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Source URL 3 (optional)</label>
          <input
            className="w-full bg-black border border-white/10 p-4 text-sm font-mono focus:border-reserve-accent outline-none"
            value={sourceUrl3}
            onChange={(e) => setSourceUrl3(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Requested Editorial Angle (optional)</label>
          <input
            className="w-full bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
            value={requestedAngle}
            onChange={(e) => setRequestedAngle(e.target.value)}
            placeholder="e.g. leadership, transformation, personal philosophy"
          />
        </div>

        <button
          type="submit"
          disabled={generating}
          className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-reserve-accent transition-all disabled:opacity-50"
        >
          {generating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
          Generate Editorial
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 text-rose-500 text-[10px]">
          <XCircle size={12} /> {error}
        </div>
      )}

      {/* Cost confirmation -- required before any AI request is sent. */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 p-8 space-y-6">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-serif">Confirm AI Generation</h3>
              <button onClick={() => setShowConfirm(false)} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-zinc-300">
              This editorial generation will use <strong>1 AI request</strong> at approximately <strong>$0.50</strong>.
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Provider: Tabitoken -- the configured production model (see server TABITOKEN_MODEL)
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={runGeneration}
                className="flex-1 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-reserve-accent transition-all"
              >
                Generate -- $0.50
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {(generating || step > 0) && (
        <div className="space-y-2 bg-black/40 border border-white/5 p-6">
          {PROGRESS_STEPS.map((label, i) => {
            const stepNum = i + 1;
            const done = step > stepNum || (step === 6 && stepNum <= 6);
            const active = step === stepNum && generating;
            return (
              <div key={label} className={`flex items-center gap-3 text-xs ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-zinc-600'}`}>
                {done ? <CheckCircle2 size={14} /> : active ? <Loader2 className="animate-spin" size={14} /> : <span className="w-[14px] h-[14px] inline-block rounded-full border border-zinc-700" />}
                {stepNum}. {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-6 pt-6 border-t border-white/5">
          <div className={`flex items-center gap-2 text-xs ${result.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result.status === 'SUCCESS' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {result.status}
            {result.failureReason ? ` -- ${result.failureReason}` : ''}
          </div>

          {pkg && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Article Title" value={pkg.title} />
                <Field
                  label="QA Status"
                  value={
                    result.qa && (
                      <span className={`inline-flex items-center gap-1 ${result.qa.overall === 'PASS' ? 'text-emerald-400' : result.qa.overall === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}`}>
                        {result.qa.overall === 'FAIL' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} {result.qa.overall}
                      </span>
                    )
                  }
                />
                <Field label="Subtitle" value={pkg.subtitle} />
                <Field label="Confidence" value={result.qa ? `${result.qa.confidence}/100 (${result.qa.status})` : null} />
                <Field label="Recommended Image" value={pkg.imageUrl ? 'See preview below' : 'None selected'} />
              </div>

              <Field label="Article" value={<p className="whitespace-pre-wrap bg-black/40 border border-white/5 p-4">{pkg.article}</p>} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Instagram Headline" value={pkg.instagramHeadline} />
                <Field label="Instagram Subheadline" value={pkg.instagramSubheadline} />
              </div>
              <Field label="Instagram Caption" value={pkg.caption} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Cover Kicker" value={pkg.coverKicker} />
                <Field label="Cover Secondary Line" value={pkg.coverSecondaryLine} />
              </div>

              {pkg.imageUrl && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Recommended Image</span>
                  <img src={pkg.imageUrl} alt="" className="max-w-xs border border-white/10" />
                  <p className="text-xs text-zinc-500">{pkg.imageReason}</p>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Sources</span>
                <div className="space-y-2">
                  {pkg.sourcesUsed.map((sourceId) => {
                    const s = result.sources.find((src) => src.sourceId === sourceId);
                    return (
                      <div key={sourceId} className="text-xs text-zinc-400 bg-black/40 border border-white/5 p-3">
                        <span className="text-reserve-accent">{sourceId}</span> -- {s?.title || s?.url || 'unknown source'} ({s?.publisher || 'unknown publisher'})
                      </div>
                    );
                  })}
                </div>
              </div>

              {result.status === 'SUCCESS' && (
                <InstagramBannerPanel generationId={result.id} editorialPackage={pkg} sources={result.sources} />
              )}

              {pkg.warnings.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Model Warnings</span>
                  {pkg.warnings.map((w, i) => (
                    <div key={i} className="text-xs p-3 border border-amber-500/20 bg-amber-500/5 text-amber-400">
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {result.qa && result.qa.checks.some((c) => c.severity !== 'PASS') && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">QA Notes</span>
                  {result.qa.checks
                    .filter((c) => c.severity !== 'PASS')
                    .map((c, i) => (
                      <div key={i} className={`text-xs p-3 border ${c.severity === 'FAIL' ? 'border-rose-500/20 bg-rose-500/5 text-rose-400' : 'border-amber-500/20 bg-amber-500/5 text-amber-400'}`}>
                        [{c.check}] {c.message}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs pt-4 border-t border-white/5">
            <Field label="Requested Model" value={result.requestedModel} />
            <Field label="Served Model" value={result.servedModel} />
            <Field label="Total Tokens" value={result.usage.totalTokens != null ? String(result.usage.totalTokens) : null} />
            <Field label="Latency" value={result.latencyMs != null ? `${result.latencyMs}ms` : null} />
          </div>
        </div>
      )}
    </div>
  );
}
