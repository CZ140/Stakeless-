import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email });
    } catch {
      // Swallow error — always show success to avoid email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
        <h1>Check your email</h1>
        <p>If this email is registered, you will receive a password reset link shortly.</p>
        <p><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Reset password</h1>
      <p>Enter your email address and we'll send you a reset link.</p>
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
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p><Link to="/login">Back to sign in</Link></p>
    </div>
  );
}
