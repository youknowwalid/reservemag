import React from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { useContributor } from '../../context/ContributorContext';

/**
 * Terminal screen for a contributor tombstoned by the admin "Delete
 * User" action (contributorService.removeContributor(), status:
 * 'removed') -- every contributorRouting.ts gate redirects here the
 * instant `isRemoved` is true, instead of ever reaching the dashboard,
 * profile form, or verification gate again. Guards itself the same way:
 * a signed-in-but-not-removed visitor who lands on this URL directly is
 * bounced back to '/contribute' rather than seeing a message that
 * doesn't apply to them.
 */
export default function ContributorRemovedPage() {
  const { isRemoved, loading } = useContributor();

  if (!loading && !isRemoved) return <Navigate to="/contribute" replace />;

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-32 text-center space-y-6">
        <AlertCircle className="mx-auto text-rose-400" size={40} />
        <h1 className="text-2xl font-serif">Account Removed</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          This contributor account has been removed and no longer has access to the contributor dashboard. If you believe this is a mistake, please contact THE RESERVE directly.
        </p>
      </div>
      <Footer />
    </div>
  );
}
