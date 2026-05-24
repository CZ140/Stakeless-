import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/vault/AuthLayout';

// One-time onboarding step shown right after a brand-new Google sign-up (the
// OAuth popup can't collect a username). Returning users never reach this — the
// Google route only sends them here when isNewUser is true. Saves via the same
// PATCH /api/auth/me the profile editor uses (case-insensitive unique check).
export function ChooseUsernamePage() {
  const navigate = useNavigate();
  const { updateLocalProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmed)) {
      setError('3–20 characters — letters, numbers and underscores only.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.patch<{ username: string }>('/auth/me', { username: trimmed });
      updateLocalProfile({ username: res.data.username });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { error?: string } } };
      setError(
        ax.response?.status === 409
          ? 'That username is already taken.'
          : ax.response?.data?.error ?? 'Could not save your username. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-eyebrow">WELCOME · PICK YOUR HANDLE</div>
        <h1>Choose a username.</h1>
        <p className="subtitle">
          This is how you'll show up on the leaderboard and in games. You can change it later in your profile.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <div className="field-row"><label className="label" htmlFor="username">Username</label></div>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              minLength={3}
              maxLength={20}
              placeholder="3–20 letters, numbers, underscores"
            />
          </div>

          <button type="submit" className="btn btn-primary submit" disabled={loading}>
            {loading ? <><span className="spinner" />Saving…</> : 'Continue'}
          </button>
        </form>

        <div className="auth-foot-link">
          <a onClick={() => navigate('/', { replace: true })} style={{ cursor: 'pointer' }}>I'll do this later →</a>
        </div>
      </div>
    </AuthLayout>
  );
}

export default ChooseUsernamePage;
