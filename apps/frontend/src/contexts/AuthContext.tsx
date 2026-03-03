import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { setAccessToken } from '../api/client';
import { apiClient } from '../api/client';
import { useBalanceStore } from '../stores/balanceStore';

interface AuthState {
  accessToken: string | null;
  isLoading: boolean; // true while checking for existing session on mount
  sessionExpired: boolean; // true only when a live session expired mid-use
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ accessToken: null, isLoading: true, sessionExpired: false });
  // Track previous accessToken to detect null→value transitions
  const prevTokenRef = useRef<string | null>(null);

  // On mount: attempt silent refresh to restore session from httpOnly cookie
  useEffect(() => {
    axios
      .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        setState({ accessToken: res.data.accessToken, isLoading: false, sessionExpired: false });
        // Fetch profile to initialize balance
        return apiClient.get<{ balance: number }>('/auth/me');
      })
      .then((meRes) => {
        useBalanceStore.getState().setBalance(meRes.data.balance);
      })
      .catch(() => {
        setState({ accessToken: null, isLoading: false, sessionExpired: false });
      });
  }, []);

  // When accessToken transitions from null to a value (after signIn), fetch balance
  useEffect(() => {
    if (state.accessToken !== null && prevTokenRef.current === null) {
      // Token just became available — fetch profile for balance
      apiClient
        .get<{ balance: number }>('/auth/me')
        .then((res) => {
          useBalanceStore.getState().setBalance(res.data.balance);
        })
        .catch(() => {
          // Non-fatal — balance will show as null until next refresh
        });
    }
    prevTokenRef.current = state.accessToken;
  }, [state.accessToken]);

  // Listen for session expiry events dispatched by the axios interceptor
  useEffect(() => {
    const handleExpiry = () => {
      setAccessToken(null);
      setState({ accessToken: null, isLoading: false, sessionExpired: true });
      useBalanceStore.getState().clearBalance();
    };
    window.addEventListener('auth:session-expired', handleExpiry);
    return () => window.removeEventListener('auth:session-expired', handleExpiry);
  }, []);

  const signIn = useCallback((token: string) => {
    setAccessToken(token);
    setState({ accessToken: token, isLoading: false, sessionExpired: false });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch {
      // Ignore errors — clear local state regardless
    }
    setAccessToken(null);
    setState({ accessToken: null, isLoading: false, sessionExpired: false });
    useBalanceStore.getState().clearBalance();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
