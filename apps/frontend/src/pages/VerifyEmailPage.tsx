import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      setStatus('error');
      return;
    }
    axios
      .get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { withCredentials: true })
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/login?verified=true', { replace: true }), 2000);
      })
      .catch(() => setStatus('error'));
  }, [location.search, navigate]);

  if (status === 'loading') return <div style={{ textAlign: 'center', marginTop: 80 }}>Verifying your email...</div>;
  if (status === 'success') return <div style={{ textAlign: 'center', marginTop: 80 }}>Email verified! Redirecting to login...</div>;
  return (
    <div style={{ textAlign: 'center', marginTop: 80 }}>
      <h1>Invalid link</h1>
      <p>This verification link is invalid or has expired.</p>
    </div>
  );
}
