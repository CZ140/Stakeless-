import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/vault/AuthLayout';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const sessionExpired = params.get('expired') === 'true';
  const justVerified = params.get('verified') === 'true';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post<{ accessToken: string }>(
        '/api/auth/login',
        { email, password },
        { withCredentials: true },
      );
      signIn(res.data.accessToken);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-eyebrow">SIGN IN · RETURNING PLAYER</div>
        <h1>Welcome back.</h1>
        <p className="subtitle">Sign in to play with virtual coins. No real money — just for fun.</p>

        {justVerified && <div className="auth-note">Email verified — you can sign in now.</div>}
        {sessionExpired && !error && <div className="auth-error">Your session expired — please sign in again.</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <div className="field-row"><label className="label" htmlFor="email">Email</label></div>
            <input
              id="email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            />
          </div>

          <div className="field">
            <div className="field-row">
              <label className="label" htmlFor="password">Password</label>
              <Link to="/forgot-password">Forgot?</Link>
            </div>
            <input
              id="password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
            />
          </div>

          <div className="check-row">
            <label className="checkbox">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span className="box" />
              Keep me signed in
            </label>
            <span className="micro">SECURE · 256-BIT</span>
          </div>

          <button type="submit" className="btn btn-primary submit" disabled={loading}>
            {loading ? <><span className="spinner" />Signing in…</> : 'Sign in'}
          </button>
        </form>

        <div className="auth-foot-link">
          New to Stakeless? <Link to="/register">Create an account →</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
