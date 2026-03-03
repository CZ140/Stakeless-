import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, isLoading, sessionExpired } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!accessToken) return <Navigate to={sessionExpired ? '/login?expired=true' : '/login'} replace />;
  return <>{children}</>;
}
