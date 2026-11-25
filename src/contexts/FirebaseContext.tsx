/**
 * ==========================================
 * File: src/contexts/FirebaseContext.tsx
 * Project: AdBoard
 * Purpose:
 * Context for user authentication, administrator roles,
 * onboarding state, and setup progress indicators.
 * ==========================================
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { FirebaseService } from '../services/firebaseService';
import { UserService } from '../services/userService';
import { UserProfile, AdminRole } from '../types';
import { supabase, isSupabaseBackend } from '../supabase/config';

type SessionUser = { uid: string; email: string; role?: AdminRole | 'admin'; tutorialSeen?: boolean } | null;

interface FirebaseContextType {
  user: SessionUser;
  userProfile: UserProfile | null;
  role: AdminRole | 'admin' | null;
  isSuperadmin: boolean;
  tutorialSeen: boolean;
  setupCompleted: boolean;
  isInitialising: boolean;
  refreshSetupStatus: () => Promise<void>;
  setCurrentUser: (user: any) => void;
  setUserProfile: (profile: any) => void;
  markTutorialSeen: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

// Last-known role/tutorial state, persisted at login. Used to seed the UI on
// refresh so a slow or failing backend re-read never downgrades the session.
function persistedRole(): AdminRole | 'admin' | null {
  const r = localStorage.getItem('adboard_role');
  return r === 'superadmin' || r === 'editor' || r === 'admin' ? r : null;
}
function persistedTutorialSeen(): boolean {
  return localStorage.getItem('adboard_tutorial_seen') === 'true';
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AdminRole | 'admin' | null>(persistedRole);
  const [tutorialSeen, setTutorialSeen] = useState<boolean>(persistedTutorialSeen);
  const [setupCompleted, setSetupCompleted] = useState<boolean>(false);
  const [isInitialising, setIsInitialising] = useState<boolean>(true);

  const refreshSetupStatus = async () => {
    try {
      const completed = await FirebaseService.checkSetupCompleted();
      setSetupCompleted(completed);
    } catch (err) {
      console.warn("Could not query setup state from contextual services:", err);
    }
  };

  /**
   * Resolves role + tutorial state for a restored Supabase session, creating
   * the adboard_users row if it does not exist yet (the bootstrap used to run
   * only on explicit login, so a persisted session left the user with no row
   * and got downgraded to editor on every refresh).
   *
   * If the backend cannot be reached at all, it KEEPS the last-known persisted
   * values rather than downgrading the session.
   */
  const resolveSupabaseRole = async (uid: string, email: string) => {
    const record = await FirebaseService.ensureSupabaseUserRecord(uid, email);
    if (record) {
      setRole(record.role);
      localStorage.setItem('adboard_role', record.role);
      // Tutorial is sticky: once seen (in the DB OR locally), never show again.
      // This survives a blocked adboard_users UPDATE, which was making the tour
      // reappear on every refresh when RLS rejected the write.
      const seen = record.tutorialSeen || persistedTutorialSeen();
      setTutorialSeen(seen);
      localStorage.setItem('adboard_tutorial_seen', seen ? 'true' : 'false');
      // If the local flag is ahead of the DB, try (best-effort) to reconcile
      if (seen && !record.tutorialSeen) {
        UserService.markTutorialSeen(uid);
      }
      return;
    }
    // Backend unreachable: preserve the last-known session state
    setRole(persistedRole() || 'editor');
    setTutorialSeen(persistedTutorialSeen());
  };

  const applySupabaseSession = async (session: any) => {
    const userObj = { uid: session.user.id, email: session.user.email || '' };
    setUser(userObj);
    setUserProfile({
      userId: session.user.id,
      email: session.user.email || '',
      role: 'admin',
      createdAt: session.user.created_at || new Date().toISOString()
    });
    localStorage.setItem('adboard_mock_authenticated', 'true');
    localStorage.setItem('adboard_local_admin_dummy_uid', session.user.id);
    localStorage.setItem('adboard_local_admin_dummy_email', session.user.email || '');
    await resolveSupabaseRole(session.user.id, session.user.email || '');
  };

  useEffect(() => {
    let unsubscribe: () => void = () => {};

    const initialize = async () => {
      await refreshSetupStatus();

      if (isSupabaseBackend && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          await applySupabaseSession(session);
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (session && session.user) {
            await applySupabaseSession(session);
          } else {
            setUser(null);
            setUserProfile(null);
            setRole(null);
          }
          setIsInitialising(false);
        });

        setIsInitialising(false);
        unsubscribe = () => subscription.unsubscribe();
        return;
      }

      const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

      // Restores a local-backend / sandbox session from persisted mock state
      const restoreMockSession = () => {
        const mockAuth = localStorage.getItem('adboard_mock_authenticated');
        const savedEmail = localStorage.getItem('adboard_local_admin_dummy_email');
        const savedUid = localStorage.getItem('adboard_local_admin_dummy_uid') || 'local-admin-dev';
        const savedRole = (localStorage.getItem('adboard_role') as AdminRole) || 'superadmin';
        const seen = localStorage.getItem('adboard_tutorial_seen') === 'true';
        if (mockAuth === 'true' && savedEmail) {
          setUser({ uid: savedUid, email: savedEmail, role: savedRole, tutorialSeen: seen });
          setUserProfile({ userId: savedUid, email: savedEmail, role: 'admin', createdAt: new Date().toISOString() });
          setRole(savedRole);
          setTutorialSeen(seen);
        } else {
          setUser(null);
          setUserProfile(null);
          setRole(null);
        }
      };

      // Local backend: no live auth listener, restore from persisted session
      if (isLocalBackend) {
        restoreMockSession();
        setIsInitialising(false);
        return;
      }

      // Firebase (Firestore) auth listener; sandbox mode falls back to mock state
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email || '' });
          setUserProfile({
            userId: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: 'admin',
            createdAt: firebaseUser.metadata.creationTime || new Date().toISOString()
          });
          // A single-tenant Firebase deployment treats its admin as superadmin
          setRole('superadmin');
          localStorage.setItem('adboard_mock_authenticated', 'true');
        } else {
          restoreMockSession();
        }
        setIsInitialising(false);
      });
    };

    initialize();
    return () => unsubscribe();
  }, []);

  const setCurrentUser = (customUser: any) => {
    setUser(customUser);
    if (customUser?.role) setRole(customUser.role);
    if (typeof customUser?.tutorialSeen === 'boolean') setTutorialSeen(customUser.tutorialSeen);
  };

  const markTutorialSeen = async () => {
    setTutorialSeen(true);
    localStorage.setItem('adboard_tutorial_seen', 'true');
    if (user?.uid) {
      await UserService.markTutorialSeen(user.uid);
    }
  };

  const logoutAdmin = async () => {
    await FirebaseService.logoutAdmin();
    setUser(null);
    setUserProfile(null);
    setRole(null);
  };

  return (
    <FirebaseContext.Provider value={{
      user,
      userProfile,
      role,
      isSuperadmin: role === 'superadmin' || role === 'admin',
      tutorialSeen,
      setupCompleted,
      isInitialising,
      refreshSetupStatus,
      setCurrentUser,
      setUserProfile,
      markTutorialSeen,
      logoutAdmin
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be invoked inside a FirebaseProvider wrapper block.');
  }
  return context;
};
