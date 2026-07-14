import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  console.log('[RENDER] ProtectedRoute');
  console.log('[CHAIN][2-ProtectedRoute] RENDER START');
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  useEffect(() => {
    console.log('[DIAG][ProtectedRoute] estado atual — isLoadingAuth:', isLoadingAuth, '| authChecked:', authChecked, '| isAuthenticated:', isAuthenticated, '| authError:', authError?.type ?? null);
  });

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      console.log('[DIAG][ProtectedRoute] authChecked=false && !isLoadingAuth → chamando checkUserAuth()');
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    console.log('[CHAIN][2-ProtectedRoute] → FALLBACK spinner — isLoadingAuth:', isLoadingAuth, '| authChecked:', authChecked);
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      console.log('[DIAG][ProtectedRoute] RETORNANDO UserNotRegisteredError');
      return <UserNotRegisteredError />;
    }
    console.log('[DIAG][ProtectedRoute] RETORNANDO unauthenticatedElement — authError.type:', authError.type);
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    console.log('[DIAG][ProtectedRoute] RETORNANDO unauthenticatedElement — isAuthenticated=false');
    return unauthenticatedElement;
  }

  console.log('[RETURN] ProtectedRoute → <Outlet />');
  console.log('[CHAIN][2-ProtectedRoute] → RETORNANDO <Outlet /> — isAuthenticated=true, authChecked=true');
  return <Outlet />;
}