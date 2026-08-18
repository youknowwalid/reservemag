import React, { useState } from 'react';
import { Loader2, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function BulkImportSection() {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTitle, setAiTitle] = useState('');
  const [aiCategory, setAiCategory] = useState('Culture');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  const handleAiGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setGeneratingAi(true);
    setError(null);
    setAiSuccessMessage(null);

    try {
      // Generation and the article insert both happen server-side (see
      // server.ts's /api/ai/ingest, which calls the Tabitoken-backed
      // aiProvider in src/services/ai/) so the API key never ships to the
      // browser. The endpoint is admin-only (verifyAdminRequest in
      // server-supabase.ts), so the caller's Supabase session token has to
      // ride along -- same pattern as AIConnectionTestPanel.tsx.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin to generate a draft.');

      const res = await fetch('/api/ai/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: aiTitle || undefined, category: aiCategory, prompt: aiPrompt }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Generation failed.');

      setAiSuccessMessage(`Successfully saved: ${result.title}`);
      setAiPrompt('');
      setAiTitle('');
    } catch (err: any) {
      console.error("AI Engine Error:", err);
      setError(err?.message || 'Generation failed. Please try again.');
    } finally {
      setGeneratingAi(false);
    }
  };

  return (
    <div className="space-y-8 bg-zinc-900/30 p-8 border border-white/5">
      <h2 className="text-xl font-serif">AI Content Engine</h2>
      <form onSubmit={handleAiGeneration} className="space-y-4">
        <input 
          className="w-full bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
          placeholder="Article Title (Optional)"
          value={aiTitle}
          onChange={(e) => setAiTitle(e.target.value)}
        />
        <textarea 
          className="w-full bg-black border border-white/10 p-4 text-sm focus:border-reserve-accent outline-none"
          placeholder="Enter article topic..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={4}
        />
        <button disabled={generatingAi} className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-reserve-accent transition-all disabled:opacity-50">
          {generatingAi ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>}
          {generatingAi ? 'Generating...' : 'Generate & Save'}
        </button>
      </form>
      {error && <div className="flex items-center gap-2 text-rose-500 text-[10px]"><X size={12} /> {error}</div>}
      {aiSuccessMessage && <div className="flex items-center gap-2 text-emerald-500 text-[10px]"><CheckCircle2 size={12} /> {aiSuccessMessage}</div>}
    </div>
  );
}
