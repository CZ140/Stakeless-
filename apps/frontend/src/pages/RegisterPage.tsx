import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AuthLayout } from '../components/vault/AuthLayout';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { CoinIcon, ZapIcon } from '../components/vault/icons';

function PerksStrip() {
  return (
    <div className="perks-strip">
      <div className="perk">
        <div className="pico" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}><CoinIcon size={14} /></div>
        <div className="pval">1,000 coins</div>
        <div className="plab">Signup bonus</div>
      </div>
      <div className="perk">
        <div className="pico" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><ZapIcon size={12} /></div>
        <div className="pval">+100 / day</div>
        <div className="plab">Daily bonus</div>
      </div>
      <div className="perk">
        <div className="pico" style={{ background: 'rgba(91,141,239,0.18)', color: 'var(--blue)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
          </svg>
        </div>
        <div className="pval">4 games</div>
        <div className="plab">Full library</div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/register', { email, username, password });
      setSuccess(true);
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { error?: string; issues?: { field: string; message: string }[] } } };
      const data = ax.response?.data;
      if (ax.response?.status === 409) {
        // Username already taken — surface it on the username field.
        setFieldErrors({ username: data?.error ?? 'That username is already taken' });
      } else if (data?.issues) {
        const errs: Record<string, string> = {};
        for (const issue of data.issues) errs[issue.field] = issue.message;
        setFieldErrors(errs);
      } else {
        setServerError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div className="auth-eyebrow">ACCOUNT CREATED</div>
          <h1>You're in.</h1>
          <p className="subtitle">
            Your account <strong style={{ color: 'var(--text)' }}>{email}</strong> is ready. Sign in to claim your
            1,000 coins and start playing.
          </p>
          <div className="auth-foot-link">
            <Link to="/login">Sign in →</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout aside={<PerksStrip />}>
      <div className="auth-card">
        <div className="auth-eyebrow">CREATE ACCOUNT · CLAIM 1,000 coins</div>
        <h1>Join the table.</h1>
        <p className="subtitle">Get 1,000 coins on signup. Daily bonuses, leaderboards, the full game library.</p>

        {serverError && <div className="auth-error">{serverError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <div className="field-row"><label className="label" htmlFor="email">Email</label></div>
            <input
              id="email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            />
            {fieldErrors['email'] && <div style={{ color: 'var(--loss)', fontSize: 12, marginTop: 6 }}>{fieldErrors['email']}</div>}
          </div>

          <div className="field">
            <div className="field-row"><label className="label" htmlFor="username">Username</label></div>
            <input
              id="username" className="input" type="text" value={username}
              onChange={(e) => setUsername(e.target.value)} required autoComplete="username"
              minLength={3} maxLength={20} placeholder="3–20 letters, numbers, underscores"
            />
            {fieldErrors['username'] && <div style={{ color: 'var(--loss)', fontSize: 12, marginTop: 6 }}>{fieldErrors['username']}</div>}
          </div>

          <div className="field">
            <div className="field-row"><label className="label" htmlFor="password">Password</label></div>
            <input
              id="password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8}
              placeholder="at least 8 characters"
            />
            {fieldErrors['password'] && <div style={{ color: 'var(--loss)', fontSize: 12, marginTop: 6 }}>{fieldErrors['password']}</div>}
          </div>

          <div style={{ height: 8 }} />

          <button type="submit" className="btn btn-primary submit" disabled={loading}>
            {loading ? <><span className="spinner" />Creating account…</> : 'Create account · claim 1,000 coins'}
          </button>
        </form>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <GoogleSignInButton text="signup_with" onError={setServerError} />
          </>
        )}

        <div className="auth-foot-link">
          Already have an account? <Link to="/login">Sign in →</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
