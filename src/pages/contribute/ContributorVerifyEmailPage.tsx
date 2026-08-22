import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';
import { resendConfirmationEmail, verifyContributorSignupOtp } from '../../lib/contributorAuth';
import { resolveVerifyEmailPageRedirect } from '../../lib/contributorRouting';

interface LocationState {
  /** Passed by ContributorSignupPage right after a successful signUpContributor() call -- lets this page show/resend-to the right address even in the "no session issued yet" case (session-required project settings), where ContributorContext's `user` is still null until the code is actually verified. */
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
 *
 * The user types the 6-digit code from the "Confirm signup" email
 * directly into this page and submits it via verifyContributorSignupOtp()
 * -- there is no separate "click a link, then come back and press
 * continue" step. On a correct code, verifyOtp() itself establishes the
 * confirmed session; this page syncs ContributorContext (reloadSession)
 * and navigates straight to /contribute/profile in one action.
 */
export default function ContributorVerifyEmailPage() {
  const { user, contributor, emailConfirmed, loading, reloadSession } = useContributor();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingEmail = (location.state as LocationState | null)?.email;

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
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

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!displayEmail) {
      setError('Missing email address -- please sign up again.');
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    try {
      await verifyContributorSignupOtp(displayEmail, trimmedCode);
      // verifyOtp() just established a confirmed session -- sync
      // ContributorContext with it BEFORE navigating, so
      // ContributorProfilePage's guard (resolveProfilePageRedirect) sees
      // the fresh `user`/`emailConfirmed` state on its very first render
      // instead of racing the context's own async onAuthStateChange
      // listener and bouncing back to signup.
      await reloadSession();
      navigate('/contribute/profile', { replace: true });
    } catch (err: any) {
      // Deliberately does not clear `code` or navigate away -- the user
      // stays on this exact screen, with the email still shown, and can
      // just retry without re-doing signup.
      setError(err?.message || 'That code is invalid or expired. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!displayEmail) return;
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      await resendConfirmationEmail(displayEmail);
      setResendMessage('A new code has been sent -- check your inbox.');
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
          Enter the 6-digit code we sent to <strong className="text-white">{displayEmail}</strong>.
        </p>

        <form onSubmit={handleVerifyCode} className="space-y-4 pt-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            className="w-full bg-black border border-white/10 p-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-reserve-accent"
            placeholder="000000"
            aria-label="6-digit verification code"
          />

          {error && <div className="text-rose-400 text-xs">{error}</div>}
          {resendMessage && <div className="text-emerald-400 text-xs">{resendMessage}</div>}

          <button
            type="submit"
            disabled={verifying || code.trim().length !== 6}
            className="w-full py-4 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-reserve-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {verifying && <Loader2 className="animate-spin" size={14} />}
            Verify
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || !displayEmail}
            className="w-full py-4 border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {resending && <Loader2 className="animate-spin" size={14} />}
            Resend Code
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
