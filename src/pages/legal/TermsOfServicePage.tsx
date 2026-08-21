import React from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { TERMS_OF_SERVICE_MARKDOWN } from './legalContent';

// Public, unauthenticated -- no ProtectedRoute/ContributorProtectedRoute
// wraps this in App.tsx. TERMS_OF_SERVICE_MARKDOWN is genuine CommonMark
// (#, ##, **bold**, - lists, --- rules) as supplied verbatim -- rendered
// via react-markdown rather than PlainLegalText.tsx's line-shape parser
// (the Privacy Policy's approach), since this document's structure is
// already explicit markdown syntax, not something to be inferred. The
// `components` map below only assigns Tailwind classes matching the
// site's existing typography -- it changes no wording.
const markdownComponents = {
  h1: (props: React.ComponentPropsWithoutRef<'h1'>) => <h1 className="text-4xl font-serif text-white" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<'h2'>) => <h2 className="text-2xl font-serif text-white pt-8 first:pt-0" {...props} />,
  p: (props: React.ComponentPropsWithoutRef<'p'>) => <p className="text-zinc-400 leading-relaxed" {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<'strong'>) => <strong className="text-white font-bold" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<'ul'>) => <ul className="list-disc list-inside space-y-1 text-zinc-400 leading-relaxed" {...props} />,
  hr: (props: React.ComponentPropsWithoutRef<'hr'>) => <hr className="border-white/10 my-8" {...props} />,
};

export default function TermsOfServicePage() {
  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-32 space-y-6">
        <ReactMarkdown components={markdownComponents}>{TERMS_OF_SERVICE_MARKDOWN}</ReactMarkdown>
      </div>
      <Footer />
    </div>
  );
}
