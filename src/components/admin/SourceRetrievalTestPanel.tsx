import React, { useState } from 'react';
import { Loader2, Search, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FetchSourceResult {
  status: string;
  errorReason: string | null;
  title: string | null;
  publisher: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  wordCount: number;
  heroImage: string | null;
  imageCount: number;
  articlePreview: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">{label}</span>
      <span className="text-zinc-300 break-words">{value || '--'}</span>
    </div>
  );
}

// Debug tool for the Editorial Factory's Source Retrieval Engine
// (src/services/research/). Fetches one URL server-side via
// /api/admin/source/fetch (admin-gated, same verifyAdminRequest() pattern
// as the AI routes) and displays a curated, safe preview -- never the
// full article text or full image list, just enough to sanity-check that
// extraction worked.
export default function SourceRetrievalTestPanel() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchSourceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin to test source retrieval.');

      const res = await fetch('/api/admin/source/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Source retrieval failed.');
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Source retrieval failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-zinc-900/30 p-8 border border-white/5">
      <div>
        <h2 className="text-xl font-serif">Source Retrieval Test</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
          Debug tool for the Editorial Factory's source-retrieval engine
        </p>
      </div>

      <form onSubmit={handleFetch} className="flex gap-4">
        <input
          className="flex-1 bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          disabled={loading}
          className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-reserve-accent transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
          Fetch Source
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 text-rose-500 text-[10px]">
          <XCircle size={12} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className={`flex items-center gap-2 text-xs ${result.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {result.status === 'SUCCESS' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {result.status}
            {result.errorReason ? ` -- ${result.errorReason}` : ''}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
            <Field label="Title" value={result.title} />
            <Field label="Publisher" value={result.publisher} />
            <Field label="Published" value={result.publishedAt} />
            <Field label="Canonical URL" value={result.canonicalUrl} />
            <Field label="Word Count" value={String(result.wordCount)} />
            <Field label="Images Found" value={String(result.imageCount)} />
          </div>

          {result.heroImage && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Hero Image</span>
              <img src={result.heroImage} alt="" className="max-w-xs border border-white/10" />
            </div>
          )}

          {result.articlePreview && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">Article Preview</span>
              <p className="text-xs text-zinc-400 leading-relaxed bg-black/40 border border-white/5 p-4 whitespace-pre-wrap">
                {result.articlePreview}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
