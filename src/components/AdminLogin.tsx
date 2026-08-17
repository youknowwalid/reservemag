import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { signInWithEmail } from '../lib/supabase';
import { useSupabase } from '../context/SupabaseContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { user, isAdmin } = useSupabase();

  // If already logged in and admin, redirect to dashboard
  if (user && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send sign-in link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900/50 border border-white/5 backdrop-blur-xl p-12"
      >
        <div className="mb-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/10">
            <ShieldCheck className="text-reserve-accent" size={32} />
          </div>
          <h1 className="text-2xl font-serif tracking-[0.2em] mb-3">THE RESERVE</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.4em]">Proprietary Admin Portal</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-500 text-xs text-center"
          >
            <AlertCircle size={16} className="shrink-0" />
            <p className="flex-1 text-left">{error}</p>
          </motion.div>
        )}

        {user && !isAdmin ? (
          <div className="text-center space-y-6">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Logged in as <span className="text-white font-bold">{user.email}</span>.<br />
              This account does not have editorial permissions.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-[10px] uppercase tracking-widest text-reserve-accent hover:underline"
            >
              Try another account
            </button>
          </div>
        ) : sent ? (
          <div className="text-center space-y-6">
            <CheckCircle2 className="text-reserve-accent mx-auto" size={32} />
            <p className="text-xs text-zinc-400 leading-relaxed">
              Sign-in link sent to <span className="text-white font-bold">{email}</span>.<br />
              Check your inbox and follow the link to continue.
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-[10px] uppercase tracking-widest text-reserve-accent hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendLink} className="space-y-6">
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@email.com"
                className="w-full bg-black/40 border border-white/10 pl-11 pr-4 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-reserve-accent transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black py-5 uppercase tracking-[0.2em] text-xs font-bold hover:bg-reserve-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                'Send Sign-In Link'
              )}
            </button>
          </form>
        )}

        <div className="mt-16 pt-8 border-t border-white/5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-[0.4em] leading-loose text-center">
            Secured via Supabase Auth<br />
            © 2026 THE RESERVE ARCHIVE
          </p>
        </div>
      </motion.div>
    </div>
  );
}
