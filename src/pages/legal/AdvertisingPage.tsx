import React from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { legalMarkdownComponents } from '../../components/legal/legalMarkdownComponents';
import { ADVERTISING_MARKDOWN } from './legalContent';

// Public, unauthenticated -- same pattern as PrivacyPolicyPage.tsx /
// TermsOfServicePage.tsx. ADVERTISING_MARKDOWN is genuine CommonMark as
// supplied verbatim -- rendered via react-markdown, not edited here.
export default function AdvertisingPage() {
  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-32 space-y-6">
        <ReactMarkdown components={legalMarkdownComponents}>{ADVERTISING_MARKDOWN}</ReactMarkdown>
      </div>
      <Footer />
    </div>
  );
}
