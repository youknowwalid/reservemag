import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { resendConfirmationEmail } from '../../lib/contributorAuth';
import { resolveVerifyEmailPageRedirect } from '../../lib/contributorRouting';

interface LocationState {
  /** Passed by ContributorSignupPage right after a successful signUpContributor() call -- lets this page show/resend-to the right address even in the "no session issued yet" case (session-required project settings), where ContributorContext's `user` is still null until the link is actually clicked. */
  email?: string;
}

/**
 * Step 2 -- the real, visible email-verification gate between account
 * creation (Step 1) and profile completion (Step 3). Genuinely blocks
 * forward progress: gated on `emailConfirmed` (user.email_confirmed_at),
 * not on "a session exists" -- a session can exist for an unconfirmed
 * account depending on this Supabase project's settings, which is
 * exactly what let the profile form leak through before this page
 * existed (see contributorAuth.ts's signUpContributor doc comment).
 * Picks up a real confirmation automatically via ContributorContext's
 * onAuthStateChange listener (clicking the email link redirects back to
 * this exact route with a fresh, confirmed session) -- "I've verified"
 * is a manual fallback for when that doesn't fire in this tab (e.g. the
 * link was opened on a different device/browser).
 */
export default function ContributorVerifyEmailPage() {
  const { user, contributor, emailConfirmed, loading, reloadSession } = useContributor();
  const location = useLocation();
  const pendingEmail = (location.state as LocationState | null)?.email;

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading) {
    const redirect = resolveVerifyEmailPageRedirect(
      { hasUser: Boolean(user), emailConfirmed, hasContributor: Boolean(contributor) },
      Boolean(pendingEmail),
    );
    if (redirect) return <Navigate to={redirect} replace />;
  }

  const displayEmail = user?.email || pendingEmail || '';

  const handleCheckAgain = async () => {
    setChecking(true);
    setError(null);
    try {
      await reloadSession();
    } catch (err: any) {
      setError(err?.message || 'Failed to check your verification status.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (!displayEmail) return;
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      await resendConfirmationEmail(displayEmail);
      setResendMessage('Confirmation email resent -- check your inbox.');
    } catch (err: any) {
      setError(err?.message || 'Failed to resend the confirmation email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-32 text-center space-y-6">
        <Mail className="mx-auto text-reserve-accent" size={40} />
        <h1 className="text-2xl font-serif">Verify your email</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          We sent a confirmation link to <strong className="text-white">{displayEmail}</strong>. Click it to continue -- this page picks it up automatically once you're verified.
        </p>

        {error && <div className="text-rose-400 text-xs">{error}</div>}
        {resendMessage && <div className="text-emerald-400 text-xs">{resendMessage}</div>}

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={handleCheckAgain}
            disabled={checking}
            className="w-full py-4 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-reserve-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking && <Loader2 className="animate-spin" size={14} />}
            I've Verified -- Continue
          </button>
          <button
            onClick={handleResend}
            disabled={resending || !displayEmail}
            className="w-full py-4 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {resending && <Loader2 className="animate-spin" size={14} />}
            Resend Confirmation Email
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
