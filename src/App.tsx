/**
 * Routes and guards. Every page is dashboard surface, so all are IP-gated.
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AccessGate from './components/AccessGate';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Admin from './pages/Admin';

function Spinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen ww-sidebar flex items-center justify-center font-sans">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-xs text-white/60 font-mono">{label}</p>
      </div>
    </div>
  );
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, setupCompleted } = useAuth();
  if (!setupCompleted) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRouting() {
  const { isInitialising } = useAuth();
  if (isInitialising) return <Spinner label="Starting WallpaperWizard…" />;

  return (
    <Router>
      <AccessGate>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<ProtectedAdminRoute><Admin /></ProtectedAdminRoute>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AccessGate>
    </Router>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouting />
      </AuthProvider>
    </ThemeProvider>
  );
}
