import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export function RegisterPage() {
  const [email, setEmail] = useState('');
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
      await axios.post('/api/auth/register', { email, password });
      setSuccess(true);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { issues?: { field: string; message: string }[] } } }).response?.data;
      if (data?.issues) {
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
      <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
        <h1>Check your email</h1>
        <p>We sent a verification link to <strong>{email}</strong>. Click the link to activate your account.</p>
        <p><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {fieldErrors['email'] && <p style={{ color: 'red', marginTop: 0 }}>{fieldErrors['email']}</p>}
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            style={{ display: 'block', width: '100%', marginBottom: 4 }}
          />
          {fieldErrors['password'] && <p style={{ color: 'red', marginTop: 0 }}>{fieldErrors['password']}</p>}
        </div>
        {serverError && <p style={{ color: 'red' }}>{serverError}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
