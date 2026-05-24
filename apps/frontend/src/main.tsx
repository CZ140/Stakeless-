import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './styles/vault.css';
import { AuthProvider } from './contexts/AuthContext';
import { TierUpModal } from './components/vault/TierUpModal';
import App from './App.tsx';
import { apiClient } from './api/client';
import { useBalanceStore } from './stores/balanceStore';

// Dev-only console helper: window.__devAddBalance(amount?)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__devAddBalance = async (amount = 1000) => {
    const res = await apiClient.post<{ newBalance: number; added: number }>('/dev/add-balance', { amount });
    useBalanceStore.getState().setBalance(res.data.newBalance);
    console.log(`+${res.data.added} coins → new balance: ${res.data.newBalance}`);
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <TierUpModal />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
