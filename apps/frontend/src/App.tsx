import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ChooseUsernamePage } from './pages/ChooseUsernamePage';
import { DashboardPage } from './pages/DashboardPage';
import { RoulettePage } from './pages/RoulettePage';
import { PlinkoPage } from './pages/PlinkoPage';
import { MinesPage } from './pages/MinesPage';
import { DicePage } from './pages/DicePage';
import { SlotsPage } from './pages/SlotsPage';
import { CrashPage } from './pages/CrashPage';
import { BlackjackPage } from './pages/BlackjackPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/welcome"
        element={
          <ProtectedRoute>
            <ChooseUsernamePage />
          </ProtectedRoute>
        }
      />
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
        path="/games/dice"
        element={
          <ProtectedRoute>
            <DicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/slots"
        element={
          <ProtectedRoute>
            <SlotsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/crash"
        element={
          <ProtectedRoute>
            <CrashPage />
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
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/profile/:username" element={<ProfilePage />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
