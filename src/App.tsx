/**
 * ==========================================
 * File: src/App.tsx
 * Project: AdBoard V3
 * Purpose:
 * Central orchestrator declaring routes, applying guards,
 * and wrapping our application in global auth providers.
 * ==========================================
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useFirebase } from './contexts/FirebaseContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AccessGate from './components/AccessGate';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Admin from './pages/Admin';
import DisplayBoard from './pages/DisplayBoard';

/**
 * Route protection gate ensuring only authenticated system administrators
 * can access configuration views or assets list management.
 */
function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitialising, setupCompleted } = useFirebase();

  if (isInitialising) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-400 font-mono">Authenticating administrative session...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated visitors always land on the login page. The login page
  // redirects to the setup wizard only when setup is definitively incomplete,
  // so /admin can never expose the account-creating wizard by mistake.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but setup incomplete (rare partial-setup state)
  if (!setupCompleted) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

/**
 * Routes setup router matching display paths
 */
function AppRouting() {
  const { setupCompleted, isInitialising } = useFirebase();

  if (isInitialising) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-slate-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-slate-400 font-mono">Initializing framework subsystems...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public display screen — never IP-gated */}
        <Route path="/" element={<DisplayBoard />} />

        {/* Setup Wizard (dashboard surface: IP-gated) */}
        <Route path="/setup" element={<AccessGate><Setup /></AccessGate>} />

        {/* Login access portal (dashboard surface: IP-gated) */}
        <Route path="/login" element={<AccessGate><Login /></AccessGate>} />

        {/* Secure Management Administrative Terminal */}
        <Route
          path="/admin"
          element={
            <AccessGate>
              <ProtectedAdminRoute>
                <Admin />
              </ProtectedAdminRoute>
            </AccessGate>
          }
          id="admin-route"
        />

        {/* Catch-all redirects back to presentation board */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FirebaseProvider>
        <AppRouting />
      </FirebaseProvider>
    </ThemeProvider>
  );
}
