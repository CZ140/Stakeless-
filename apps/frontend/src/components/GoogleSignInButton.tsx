import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface GoogleCredentialResponse {
  credential?: string;
}
interface GoogleIdApi {
  initialize(cfg: { client_id: string; callback: (r: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

// Load the Google Identity Services script exactly once, shared across mounts.
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GSI load failed'));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

interface Props {
  /** Button label style — matches the page's intent (sign in vs sign up). */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Surface a user-facing error (the auth pages render it in their error slot). */
  onError?: (msg: string) => void;
}

// "Sign in with Google" button. Renders nothing when VITE_GOOGLE_CLIENT_ID is
// unset, so the app runs fine before Google credentials are configured. On
// success it exchanges the Google ID token for our own session at
// POST /api/auth/google, then signs the user in exactly like a password login.
export function GoogleSignInButton({ text = 'continue_with', onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        onError?.('Google sign-in was cancelled.');
        return;
      }
      try {
        const res = await axios.post<{ accessToken: string; isNewUser?: boolean }>(
          '/api/auth/google',
          { credential: response.credential },
          { withCredentials: true },
        );
        signIn(res.data.accessToken);
        // Brand-new Google accounts pick a username before entering the app.
        navigate(res.data.isNewUser ? '/welcome' : '/', { replace: true });
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        onError?.(msg ?? 'Google sign-in failed. Please try again.');
      }
    },
    [signIn, navigate, onError],
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const el = containerRef.current;
        if (cancelled || !el || !window.google) return;
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential });
        // GSI requires a pixel width between 200–400; clamp to the card's width.
        const width = Math.min(Math.max(el.clientWidth || 320, 200), 400);
        el.innerHTML = '';
        window.google.accounts.id.renderButton(el, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text,
          width,
          logo_alignment: 'center',
        });
      })
      .catch(() => onError?.('Could not load Google sign-in.'));
    return () => {
      cancelled = true;
    };
  }, [handleCredential, text, onError]);

  if (!CLIENT_ID) return null;
  return (
    <div className="google-signin">
      <div ref={containerRef} className="google-signin-btn" />
    </div>
  );
}
