import React from 'react';

// Shared react-markdown typography mapping for the four new footer
// pages (Editorial Policy, Advertising, Legal, and the static portion of
// Editorial Board) -- a deliberate copy of TermsOfServicePage.tsx's own
// inline `markdownComponents`, kept as its own file rather than
// importing from that already-shipped page, per this stage's scope
// guardrail ("only touch these specific pages/footer content"). Only
// assigns Tailwind classes matching the site's existing typography -- it
// changes no wording.
export const legalMarkdownComponents = {
  h1: (props: React.ComponentPropsWithoutRef<'h1'>) => <h1 className="text-4xl font-serif text-white" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<'h2'>) => <h2 className="text-2xl font-serif text-white pt-8 first:pt-0" {...props} />,
  p: (props: React.ComponentPropsWithoutRef<'p'>) => <p className="text-zinc-400 leading-relaxed" {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<'strong'>) => <strong className="text-white font-bold" {...props} />,
  em: (props: React.ComponentPropsWithoutRef<'em'>) => <em className="text-[10px] not-italic uppercase tracking-widest text-zinc-600 block" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<'ul'>) => <ul className="list-disc list-inside space-y-1 text-zinc-400 leading-relaxed" {...props} />,
  hr: (props: React.ComponentPropsWithoutRef<'hr'>) => <hr className="border-white/10 my-8" {...props} />,
};
