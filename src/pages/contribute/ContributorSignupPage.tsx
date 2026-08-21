import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { signUpContributor, signInContributor, signInContributorWithGoogle } from '../../lib/contributorAuth';
import { supabase } from '../../lib/supabase';

// Step 1 of "Become a Contributor" -- account creation. Email+password
// (Supabase Auth's own signUp/signInWithPassword) or Google OAuth
// (signInWithOAuth). Purely account creation -- profile completion is a
// separate step/page (ContributorProfilePage), gated on having a session
// but no `contributors` row yet.

export default function ContributorSignupPage() {
  const { user, contributor, loading } = useContributor();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Already fully set up -- nothing to do here.
  if (!loading && user && contributor) return <Navigate to="/contribute/dashboard" replace />;
  // Signed in but profile not completed yet -- skip straight past signup.
  if (!loading && user && !contributor) return <Navigate to="/contribute/profile" replace />;

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpContributor(email.trim(), password);
        // Whether a session is issued immediately depends on this
        // project's "Confirm email" setting -- check rather than assume.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) setAwaitingConfirmation(true);
        // If a session WAS issued, the ContributorContext listener above
        // picks it up and the redirect at the top of this component
        // takes over on the next render.
      } else {
        await signInContributor(email.trim(), password);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      await signInContributorWithGoogle();
      // Supabase redirects the browser away for OAuth -- nothing else to do here on success.
    } catch (err: any) {
      setError(err?.message || 'Google sign-in is not available right now.');
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="bg-reserve-bg min-h-screen text-reserve-text">
        <Navbar />
        <div className="max-w-md mx-auto px-6 py-32 text-center space-y-6">
          <Mail className="mx-auto text-reserve-accent" size={40} />
          <h1 className="text-2xl font-serif">Check your email</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            We sent a confirmation link to <strong className="text-white">{email}</strong>. Click it, then come back here to finish setting up your profile.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-24 space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif">Become a Contributor</h1>
          <p className="text-sm text-zinc-500">Write, shoot, or film for THE RESERVE. Create your account to get started.</p>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-4 border border-white/10 text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-white/5 transition-colors"
        >
          Sign up with Google
        </button>

        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-zinc-600">
          <div className="flex-1 h-px bg-white/10" />
          or
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <form onSubmit={handleEmailPassword} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-white/10 p-4 text-sm outline-none focus:border-reserve-accent"
              placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
              required
            />
          </div>

          {error && <div className="text-rose-400 text-xs">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-reserve-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="animate-spin" size={14} />}
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); }}
          className="w-full text-center text-xs text-zinc-500 hover:text-white transition-colors"
        >
          {mode === 'signup' ? 'Already have a contributor account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
      <Footer />
    </div>
  );
}
