import React from 'react';

// Step 3 confirmation, shown once right after completeProfile() succeeds.
// Deliberately a plain, self-contained modal (not a toast/redirect) so
// the "you're an Author now" moment reads as a real milestone before
// landing on the (still-minimal, Stage 1) dashboard.

export default function ContributorWelcomeModal({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-md bg-zinc-950 border border-white/10 p-10 text-center space-y-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-serif">Congratulations, you're now an Author.</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Your profile is live. Head to your dashboard to see it, and check back soon — content submission opens in the next update.
        </p>
        <button
          onClick={onContinue}
          className="w-full py-4 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-reserve-accent transition-colors"
        >
          Go to My Dashboard
        </button>
      </div>
    </div>
  );
}
