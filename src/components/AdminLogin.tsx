import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, ShieldCheck, User, Lock } from 'lucide-react';
import { signInWithUsernamePassword } from '../lib/supabase';
import { useSupabase } from '../context/SupabaseContext';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, isAdmin } = useSupabase();

  // If already logged in and admin, redirect to dashboard
  if (user && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithUsernamePassword(username.trim(), password);
      // useSupabase's auth listener picks up the new session and the
      // redirect above fires once `isAdmin` resolves.
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please try again.');
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-black/40 border border-white/10 pl-11 pr-4 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-reserve-accent transition-colors"
            />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
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
              'Sign In'
            )}
          </button>
        </form>

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
