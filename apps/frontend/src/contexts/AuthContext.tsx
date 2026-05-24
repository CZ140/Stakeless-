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
  // Own avatar, mirrored from /auth/me so the header/sidebar render it without
  // an extra fetch; kept in sync after a profile edit via updateLocalProfile.
  avatarColor: string | null;
  avatarImage: string | null;
  isLoading: boolean; // true while checking for existing session on mount
  sessionExpired: boolean; // true only when a live session expired mid-use
}

interface MeResponse {
  balance: number;
  username: string;
  tierLevel: number;
  avatarColor: string | null;
  avatarImage: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
  // Sync locally-held identity after a successful profile edit.
  updateLocalProfile: (p: { username?: string; avatarColor?: string | null; avatarImage?: string | null }) => void;
}

const LOGGED_OUT = { accessToken: null, username: null, avatarColor: null, avatarImage: null } as const;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT, isLoading: true, sessionExpired: false });
  // Track previous accessToken to detect null→value transitions
  const prevTokenRef = useRef<string | null>(null);

  const applyMe = (me: MeResponse) => {
    useBalanceStore.getState().setBalance(me.balance);
    useBalanceStore.getState().setTierLevel(me.tierLevel);
    setState((prev) => ({ ...prev, username: me.username, avatarColor: me.avatarColor, avatarImage: me.avatarImage }));
  };

  // On mount: attempt silent refresh to restore session from httpOnly cookie
  useEffect(() => {
    axios
      .post<{ accessToken: string }>('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        setState({ ...LOGGED_OUT, accessToken: res.data.accessToken, isLoading: false, sessionExpired: false });
        // Fetch profile to initialize balance + identity
        return apiClient.get<MeResponse>('/auth/me');
      })
      .then((meRes) => applyMe(meRes.data))
      .catch(() => {
        setState({ ...LOGGED_OUT, isLoading: false, sessionExpired: false });
      });
  }, []);

  // When accessToken transitions from null to a value (after signIn), fetch profile
  useEffect(() => {
    if (state.accessToken !== null && prevTokenRef.current === null) {
      apiClient
        .get<MeResponse>('/auth/me')
        .then((res) => applyMe(res.data))
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
      setState({ ...LOGGED_OUT, isLoading: false, sessionExpired: true });
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
    setState({ ...LOGGED_OUT, accessToken: token, isLoading: false, sessionExpired: false });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch {
      // Ignore errors — clear local state regardless
    }
    setAccessToken(null);
    setState({ ...LOGGED_OUT, isLoading: false, sessionExpired: false });
    useBalanceStore.getState().clearBalance();
  }, []);

  const updateLocalProfile = useCallback(
    (p: { username?: string; avatarColor?: string | null; avatarImage?: string | null }) => {
      setState((prev) => ({
        ...prev,
        username: p.username ?? prev.username,
        avatarColor: p.avatarColor !== undefined ? p.avatarColor : prev.avatarColor,
        avatarImage: p.avatarImage !== undefined ? p.avatarImage : prev.avatarImage,
      }));
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, updateLocalProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
