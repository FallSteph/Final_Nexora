import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth(); // ✅ ADDED isLoading FROM FILE 1

  // ✅ SHOW LOADING WHILE AUTH STATE IS BEING RESTORED (FROM FILE 1)
  if (isLoading) {
    return <div>Loading...</div>; // keep UI the same
  }

  // Redirect if user is not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect if route requires admin but user is not admin
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Render children if user is logged in (and has correct role)
  return <>{children}</>;
};

export default ProtectedRoute;