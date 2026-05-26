import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './styles/vault.css';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TierUpModal } from './components/vault/TierUpModal';
import App from './App.tsx';
import { apiClient } from './api/client';
import { useBalanceStore } from './stores/balanceStore';
import { sound } from './lib/sound';

// Satisfy the browser autoplay policy: unlock the audio engine on the first real
// user gesture, then stop listening.
const unlockAudio = () => {
  sound.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

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
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <TierUpModal />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
