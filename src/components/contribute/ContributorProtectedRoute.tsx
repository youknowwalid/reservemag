import React from 'react';
import { Navigate } from 'react-router-dom';
import { useContributor } from '../../context/ContributorContext';

// Guards /contribute/dashboard. Deliberately its own component, not a
// reused/parameterized version of AdminPanel's ProtectedRoute
// (App.tsx) -- it checks for a completed `contributors` row, never
// is_admin(), so an admin session with no contributor profile is
// correctly redirected to sign up like anyone else, and a contributor
// session can never satisfy this by any admin-side property.
export default function ContributorProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, contributor, loading } = useContributor();

  if (loading) {
    return (
      <div className="h-screen w-full bg-reserve-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-reserve-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/contribute" replace />;
  if (!contributor) return <Navigate to="/contribute/profile" replace />;

  return <>{children}</>;
}
