import React from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PlainLegalText from '../../components/legal/PlainLegalText';
import { PRIVACY_POLICY_TEXT } from './legalContent';

// Public, unauthenticated -- no ProtectedRoute/ContributorProtectedRoute
// wraps this in App.tsx. Content is rendered verbatim via
// PlainLegalText -- see legalContent.ts's header comment.
export default function PrivacyPolicyPage() {
  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-32">
        <PlainLegalText text={PRIVACY_POLICY_TEXT} />
      </div>
      <Footer />
    </div>
  );
}
