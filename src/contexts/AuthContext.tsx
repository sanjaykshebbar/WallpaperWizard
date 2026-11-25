/**
 * Signed-in admin, role, onboarding flag, and setup state.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthService, SessionUser } from '../services/authService';
import { UserService } from '../services/userService';
import { AdminRole } from '../types';

interface AuthContextType {
  user: SessionUser | null;
  role: AdminRole | null;
  isSuperadmin: boolean;
  tutorialSeen: boolean;
  setupCompleted: boolean;
  isInitialising: boolean;
  refreshSetupStatus: () => Promise<void>;
  setCurrentUser: (user: SessionUser | null) => void;
  markTutorialSeen: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(() => AuthService.restoreSession());
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [isInitialising, setIsInitialising] = useState(true);

  const refreshSetupStatus = async () => {
    // Fail closed: if the server can't answer, treat setup as done so visitors land on login, not the account-creating wizard
    setSetupCompleted((await AuthService.getSetupState()) !== 'incomplete');
  };

  useEffect(() => {
    refreshSetupStatus().finally(() => setIsInitialising(false));
  }, []);

  const markTutorialSeen = async () => {
    if (!user) return;
    setUser({ ...user, tutorialSeen: true });
    AuthService.rememberTutorialSeen();
    await UserService.markTutorialSeen();
  };

  const logoutAdmin = async () => {
    await AuthService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      role: user?.role || null,
      isSuperadmin: user?.role === 'superadmin',
      tutorialSeen: !!user?.tutorialSeen,
      setupCompleted,
      isInitialising,
      refreshSetupStatus,
      setCurrentUser: setUser,
      markTutorialSeen,
      logoutAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
};
