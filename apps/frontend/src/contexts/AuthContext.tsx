import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { setAccessToken } from '../api/client';

interface AuthState {
  accessToken: string | null;
  isLoading: boolean; // true while checking for existing session on mount
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ accessToken: null, isLoading: true });

  // On mount: attempt silent refresh to restore session from httpOnly cookie
  useEffect(() => {
    axios
      .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        setState({ accessToken: res.data.accessToken, isLoading: false });
      })
      .catch(() => {
        setState({ accessToken: null, isLoading: false });
      });
  }, []);

  // Listen for session expiry events dispatched by the axios interceptor
  useEffect(() => {
    const handleExpiry = () => {
      setAccessToken(null);
      setState({ accessToken: null, isLoading: false });
    };
    window.addEventListener('auth:session-expired', handleExpiry);
    return () => window.removeEventListener('auth:session-expired', handleExpiry);
  }, []);

  const signIn = useCallback((token: string) => {
    setAccessToken(token);
    setState({ accessToken: token, isLoading: false });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch {
      // Ignore errors — clear local state regardless
    }
    setAccessToken(null);
    setState({ accessToken: null, isLoading: false });
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
