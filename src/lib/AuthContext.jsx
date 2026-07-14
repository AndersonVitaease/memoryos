import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    console.log('[DIAG][checkAppState] INÍCIO — appParams.token presente:', !!appParams.token, '| appId:', appParams.appId);
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token,
        interceptResponses: true
      });
      
      try {
        console.log('[DIAG][checkAppState] Fazendo GET /public-settings...');
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        console.log('[DIAG][checkAppState] /public-settings OK — status keys:', Object.keys(publicSettings || {}));
        setAppPublicSettings(publicSettings);
        
        if (appParams.token) {
          console.log('[DIAG][checkAppState] Token presente → chamando checkUserAuth()');
          await checkUserAuth();
        } else {
          console.log('[DIAG][checkAppState] Sem token → isLoadingAuth=false, isAuthenticated=false, authChecked=true');
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
        console.log('[DIAG][checkAppState] FIM — isLoadingPublicSettings=false');
      } catch (appError) {
        console.error('[DIAG][checkAppState] ERRO no /public-settings:', appError?.status, appError?.message, appError);
        
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          console.log('[DIAG][checkAppState] 403 reason:', reason);
          if (reason === 'auth_required') {
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          } else if (reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          } else {
            setAuthError({ type: reason, message: appError.message });
          }
        } else {
          setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        console.log('[DIAG][checkAppState] FIM (via catch) — isLoadingPublicSettings=false, isLoadingAuth=false');
      }
    } catch (error) {
      console.error('[DIAG][checkAppState] EXCEÇÃO INESPERADA:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    console.log('[DIAG][checkUserAuth] INÍCIO');
    try {
      setIsLoadingAuth(true);
      console.log('[DIAG][checkUserAuth] Chamando base44.auth.me()...');
      const currentUser = await base44.auth.me();
      console.log('[DIAG][checkUserAuth] me() OK — user.id:', currentUser?.id, '| email:', currentUser?.email);
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      console.log('[DIAG][checkUserAuth] FIM — isAuthenticated=true, isLoadingAuth=false, authChecked=true');
    } catch (error) {
      console.error('[DIAG][checkUserAuth] ERRO em me():', error?.status, error?.message, error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      if (error.status === 401 || error.status === 403) {
        console.log('[DIAG][checkUserAuth] 401/403 → authError=auth_required');
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
      console.log('[DIAG][checkUserAuth] FIM (via catch) — isLoadingAuth=false, authChecked=true');
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};