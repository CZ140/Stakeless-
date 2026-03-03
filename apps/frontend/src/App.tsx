import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { DashboardPage } from './pages/DashboardPage';
import { RoulettePage } from './pages/RoulettePage';
import { PlinkoPage } from './pages/PlinkoPage';
import { MinesPage } from './pages/MinesPage';
import { BlackjackPage } from './pages/BlackjackPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/roulette"
        element={
          <ProtectedRoute>
            <RoulettePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/plinko"
        element={
          <ProtectedRoute>
            <PlinkoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/mines"
        element={
          <ProtectedRoute>
            <MinesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/blackjack"
        element={
          <ProtectedRoute>
            <BlackjackPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
