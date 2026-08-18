import React, { useState } from 'react';
import { Loader2, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TestResult {
  ok: boolean;
  message: string;
  model?: string;
  latencyMs?: number;
}

// Admin-only action that exercises the Reserve Editorial Engine's AI
// provider end to end: it asks the server to send Tabitoken a trivial
// "Reply with exactly: RESERVE AI CONNECTED" request and reports whether
// the round trip succeeded. The request goes through
// /api/admin/ai-connection-test, which verifies the caller is a signed-in
// admin before touching the gateway -- see server-supabase.ts's
// `verifyAdminRequest`. Only a safe status message, model name, and
// latency ever reach this component; the API key never leaves the server.
export default function AIConnectionTestPanel() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You must be signed in as an admin to run this test.');

      const res = await fetch('/api/admin/ai-connection-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!res.ok && typeof data?.ok !== 'boolean') {
        throw new Error(data?.error || 'Connection test failed.');
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Connection test failed. Please try again.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 bg-zinc-900/30 p-8 border border-white/5">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div>
          <h2 className="text-xl font-serif">AI Provider Connection</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
            Server-side Tabitoken gateway health check
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={testing}
          className="px-8 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-reserve-accent transition-all disabled:opacity-50"
        >
          {testing ? <Loader2 className="animate-spin" size={14} /> : <Radio size={14} />}
          {testing ? 'Testing...' : 'Test AI Connection'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-500 text-[10px]">
          <XCircle size={12} /> {error}
        </div>
      )}

      {result && (
        <div
          className={`flex items-start gap-3 text-xs p-4 border ${
            result.ok ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-rose-500/20 bg-rose-500/5 text-rose-400'
          }`}
        >
          {result.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
          <div className="space-y-1">
            <p>{result.message}</p>
            {(result.model || typeof result.latencyMs === 'number') && (
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest">
                {result.model ? `Model: ${result.model}` : ''}
                {result.model && typeof result.latencyMs === 'number' ? ' · ' : ''}
                {typeof result.latencyMs === 'number' ? `${result.latencyMs}ms` : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
