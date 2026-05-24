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
import { useTierCelebrationStore, type TierUp } from '../stores/tierCelebrationStore';
import { socket } from '../socket';

interface AuthState {
  accessToken: string | null;
  username: string | null;
  isLoading: boolean; // true while checking for existing session on mount
  sessionExpired: boolean; // true only when a live session expired mid-use
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ accessToken: null, username: null, isLoading: true, sessionExpired: false });
  // Track previous accessToken to detect null→value transitions
  const prevTokenRef = useRef<string | null>(null);

  // On mount: attempt silent refresh to restore session from httpOnly cookie
  useEffect(() => {
    axios
      .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        setState({ accessToken: res.data.accessToken, username: null, isLoading: false, sessionExpired: false });
        // Fetch profile to initialize balance
        return apiClient.get<{ balance: number; username: string; tierLevel: number }>('/auth/me');
      })
      .then((meRes) => {
        useBalanceStore.getState().setBalance(meRes.data.balance);
        useBalanceStore.getState().setTierLevel(meRes.data.tierLevel);
        setState(prev => ({ ...prev, username: meRes.data.username as string }));
      })
      .catch(() => {
        setState({ accessToken: null, username: null, isLoading: false, sessionExpired: false });
      });
  }, []);

  // When accessToken transitions from null to a value (after signIn), fetch balance
  useEffect(() => {
    if (state.accessToken !== null && prevTokenRef.current === null) {
      // Token just became available — fetch profile for balance
      apiClient
        .get<{ balance: number; username: string; tierLevel: number }>('/auth/me')
        .then((res) => {
          useBalanceStore.getState().setBalance(res.data.balance);
          useBalanceStore.getState().setTierLevel(res.data.tierLevel);
          setState(prev => ({ ...prev, username: res.data.username as string }));
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
      setState({ accessToken: null, username: null, isLoading: false, sessionExpired: true });
      useBalanceStore.getState().clearBalance();
    };
    window.addEventListener('auth:session-expired', handleExpiry);
    return () => window.removeEventListener('auth:session-expired', handleExpiry);
  }, []);

  // Socket lifecycle: connect when authenticated, disconnect on sign-out or session expiry
  useEffect(() => {
    if (state.accessToken) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }, [state.accessToken]);

  // Balance push from WebSocket after game settlement — updates balanceStore directly
  useEffect(() => {
    function onBalanceUpdate({ balance }: { balance: number }) {
      useBalanceStore.getState().setBalance(balance);
    }
    socket.on('balance:update', onBalanceUpdate);
    return () => {
      socket.off('balance:update', onBalanceUpdate);
    };
  }, []); // empty deps — socket singleton is stable

  // Tier-up push: a settled round vaulted the player into a new tier. Refresh the
  // chip's tier flair and fire the celebration overlay (any page).
  useEffect(() => {
    function onTierUp(data: TierUp) {
      useBalanceStore.getState().setTierLevel(data.level);
      useTierCelebrationStore.getState().celebrate(data);
    }
    socket.on('tier:up', onTierUp);
    return () => {
      socket.off('tier:up', onTierUp);
    };
  }, []);

  const signIn = useCallback((token: string) => {
    setAccessToken(token);
    setState({ accessToken: token, username: null, isLoading: false, sessionExpired: false });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch {
      // Ignore errors — clear local state regardless
    }
    setAccessToken(null);
    setState({ accessToken: null, username: null, isLoading: false, sessionExpired: false });
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
