/**
 * ==========================================
 * File: src/services/firebaseService.ts
 * Project: AdBoard V3
 * Purpose:
 * Main administrative service exposing Firestore operations
 * for Setup, Authorization, Settings, and Slides data layers.
 * ==========================================
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query,
  where,
  orderBy
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator
} from 'firebase/auth';
import { db, auth, isPlaceholder } from '../firebase/config';
import { supabase, isSupabaseBackend } from '../supabase/config';
import { handleFirestoreError } from '../firebase/errorHandler';
import {
  getLocalAuthHeaders,
  setLocalSessionToken,
  storeSandboxPassword,
  matchesSandboxPassword
} from './localSession';
import { AuditService } from './auditService';
import {
  InitConfig,
  UserProfile,
  AdMedia,
  DisplaySettings,
  OperationType
} from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

/**
 * Thrown by loginAdmin when the account has two-factor authentication
 * enabled. The caller should prompt for an authenticator code and pass
 * this error's context to FirebaseService.complete2FALogin.
 */
export class TwoFactorRequired extends Error {
  context: { method: 'local' | 'supabase' | 'firebase'; [key: string]: any };

  constructor(context: TwoFactorRequired['context']) {
    super('Two-factor authentication required.');
    this.name = 'TwoFactorRequired';
    this.context = context;
  }
}

/**
 * Service orchestrator for AdBoard transactions inside Firestore
 */
export const FirebaseService = {

  /**
   * Checks whether the AdBoard setup has been completed.
   *
   * Purpose:
   * Direct query to Firestore configuration path to determine if we should
   * redirect a user to the Initial Setup Wizard dashboard.
   *
   * Returns:
   * @returns {Promise<boolean>} Completeness state setup flag
   */
  /**
   * Fail-closed wrapper around getSetupState: when the backend state cannot
   * be determined, unknown visitors land on the login page rather than the
   * account-creating setup wizard.
   */
  async checkSetupCompleted(): Promise<boolean> {
    const state = await this.getSetupState();
    return state !== 'incomplete';
  },

  /**
   * Determines whether the platform setup wizard has been run.
   * 'unknown' means the backend could not be reached or gave no answer.
   */
  async getSetupState(): Promise<'complete' | 'incomplete' | 'unknown'> {
    if (isSupabaseBackend) {
      try {
        const { data, error } = await supabase!
          .from('adboard_config')
          .select('setup_completed')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          return data.setup_completed ? 'complete' : 'incomplete';
        }
        // No config row yet: setup may have been interrupted before the admin's
        // email was confirmed. A settings row proves an admin already exists.
        const { data: settingsRow, error: settingsError } = await supabase!
          .from('adboard_settings')
          .select('id')
          .eq('id', 1)
          .maybeSingle();
        if (settingsError) throw settingsError;
        if (settingsRow) return 'complete';
        if (localStorage.getItem('adboard_setup_completed') === 'true') return 'complete';
        return 'incomplete';
      } catch (err) {
        console.warn("Unable to check Supabase setup state:", err);
        return 'unknown';
      }
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/setup/completed');
        if (res.ok) {
          const data = await res.json();
          return data.completed ? 'complete' : 'incomplete';
        }
      } catch (err) {
        console.warn("Unable to check local backend setup state:", err);
      }
      return 'unknown';
    }

    if (isPlaceholder) {
      // Sandbox mode is inherently per-browser
      return localStorage.getItem('adboard_setup_completed') === 'true' ? 'complete' : 'incomplete';
    }

    try {
      // Direct query from server
      const docRef = doc(db, 'config', 'init');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as InitConfig;
        return data.setupCompleted ? 'complete' : 'incomplete';
      }

      // Definitive answer: the config document does not exist yet
      if (localStorage.getItem('adboard_setup_completed') === 'true') return 'complete';
      return 'incomplete';
    } catch (error) {
      console.warn("Firestore setup query offline or unconfigured.");
      return 'unknown';
    }
  },

  /**
   * Runs the Platform Initial Setup Wizard.
   *
   * Purpose:
   * Registers the primary admin credentials and sets the config/init completed state.
   *
   * Parameters:
   * @param {string} email - Email chosen for the admin.
   * @param {string} password - Password chosen for the admin.
   *
   * Returns:
   * @returns {Promise<UserProfile>} Registered workspace user profile metadata.
   */
  async runPlatformSetup(email: string, password: string): Promise<UserProfile> {
    // Guard cloud backends against re-running setup (which would create a
    // second admin account). The local backend enforces this server-side,
    // and sandbox mode is per-browser by design.
    if (isSupabaseBackend || (!isLocalBackend && !isPlaceholder)) {
      const state = await this.getSetupState();
      if (state === 'complete') {
        throw new Error("AdBoard is already configured. Please sign in with the administrator account instead.");
      }
    }

    if (isSupabaseBackend) {
      // 1. Sign up user via Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase!.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        },
      });
      if (signUpError) {
        throw new Error(signUpError.message);
      }

      const userId = signUpData.user?.id || 'supabase-admin';
      const nowStr = new Date().toISOString();

      const userProfile: UserProfile = {
        userId,
        email,
        role: 'admin',
        createdAt: nowStr,
      };

      // 2. Insert setup state in `adboard_config` table
      const { error: configError } = await supabase!
        .from('adboard_config')
        .upsert({ id: 1, setup_completed: true, updated_at: nowStr });
      if (configError) {
        console.warn("Could not write setup_completed to Supabase adboard_config:", configError);
      }

      // 3. Insert default settings in `adboard_settings` table
      const defaultSettings = {
        id: 1,
        kiosk_mode: false,
        autoplay_seconds: 8,
        transition_effect: 'fade',
        updated_by: userId,
        updated_at: nowStr
      };
      const { error: settingsError } = await supabase!
        .from('adboard_settings')
        .upsert(defaultSettings);
      if (settingsError) {
        console.warn("Could not write default settings to Supabase:", settingsError);
      }

      localStorage.setItem('adboard_setup_completed', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', userId);
      localStorage.setItem('adboard_local_admin_dummy_email', email);
      await storeSandboxPassword(password);

      return userProfile;
    }

    if (isLocalBackend) {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Local backend platform setup wizard transaction failed.");
      }
      const data = await res.json();
      setLocalSessionToken(data.token || null);
      localStorage.setItem('adboard_setup_completed', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', data.userId);
      localStorage.setItem('adboard_local_admin_dummy_email', data.email);
      return data;
    }

    const initPath = 'config/init';
    const userPath = `users`;
    
    if (isPlaceholder) {
      const nowStr = new Date().toISOString();
      const localUserProfile: UserProfile = {
        userId: "local-admin-dev",
        email: email,
        role: 'admin',
        createdAt: nowStr
      };

      localStorage.setItem('adboard_setup_completed', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', "local-admin-dev");
      localStorage.setItem('adboard_local_admin_dummy_email', email);
      await storeSandboxPassword(password);

      const defaultSettings: DisplaySettings = {
        kioskMode: false,
        autoplaySeconds: 8,
        transitionEffect: 'fade',
        updatedBy: "local-admin-dev",
        updatedAt: nowStr
      };
      localStorage.setItem('adboard_display_settings', JSON.stringify(defaultSettings));
      
      return localUserProfile;
    }

    try {
      // 1. Create User standard account via Firebase Authenticative layer
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Authenticated users must have profiles initialized standard
      const nowStr = new Date().toISOString();
      const userProfile: UserProfile = {
        userId: user.uid,
        email: email,
        role: 'admin',
        createdAt: nowStr
      };

      // 2. Set Admin Document profile in users/{uid}
      try {
        await setDoc(doc(db, 'users', user.uid), userProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${userPath}/${user.uid}`);
      }

      // 3. Mark initialization configuration completed
      const initConfig: InitConfig = {
        setupCompleted: true,
        setupCompletedAt: nowStr
      };
      
      try {
        await setDoc(doc(db, 'config', 'init'), initConfig);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, initPath);
      }

      // 4. Set Initial Display Config to default settings
      const defaultSettings: DisplaySettings = {
        kioskMode: false,
        autoplaySeconds: 8,
        transitionEffect: 'fade',
        updatedBy: user.uid,
        updatedAt: nowStr
      };

      try {
        await setDoc(doc(db, 'settings', 'displayConfig'), defaultSettings);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/displayConfig');
      }

      // Save Local Storage state fallback for offline support
      localStorage.setItem('adboard_setup_completed', 'true');
      localStorage.setItem('adboard_local_admin_dummy_email', email);
      
      return userProfile;
    } catch (error) {
      // Check if it is a standard firestore error or auth error
      console.error("Platform setup wizard transaction failed, employing local memory sandbox simulation:", error);
      
      // Local development fallback
      const nowStr = new Date().toISOString();
      const localUserProfile: UserProfile = {
        userId: "local-admin-dev",
        email: email,
        role: 'admin',
        createdAt: nowStr
      };

      localStorage.setItem('adboard_setup_completed', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', "local-admin-dev");
      localStorage.setItem('adboard_local_admin_dummy_email', email);
      await storeSandboxPassword(password);

      // Store default display settings locally
      const defaultSettings: DisplaySettings = {
        kioskMode: false,
        autoplaySeconds: 8,
        transitionEffect: 'fade',
        updatedBy: "local-admin-dev",
        updatedAt: nowStr
      };
      localStorage.setItem('adboard_display_settings', JSON.stringify(defaultSettings));
      
      return localUserProfile;
    }
  },

  /**
   * Logs local or remote admin users in.
   *
   * Purpose:
   * Standardized email authentication. Resolves matching credentials.
   *
   * Parameters:
   * @param {string} email - Login username
   * @param {string} password - Login target password
   * @param {boolean} rememberMe - Store persistent local indicators
   */
  async loginAdmin(email: string, password: string, rememberMe: boolean): Promise<any> {
    if (isSupabaseBackend) {
      // Note: no local bypass here. A fake session cannot write through
      // Supabase row-level security, so every edit would silently fail.
      // Surfacing the real error (e.g. "Email not confirmed") is the fix.
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw new Error(error.message);
      }

      // If the account has verified 2FA factors, the session starts at aal1
      // and must be upgraded with an authenticator code.
      try {
        const { data: aal } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
          const { data: factorData } = await supabase!.auth.mfa.listFactors();
          const totpFactors = factorData?.totp || [];
          if (totpFactors.length > 0) {
            throw new TwoFactorRequired({
              method: 'supabase',
              factorId: totpFactors[0].id,
              email,
              rememberMe
            });
          }
        }
      } catch (err) {
        if (err instanceof TwoFactorRequired) throw err;
        console.warn("Could not evaluate Supabase MFA level:", err);
      }

      return this.finishSupabaseLogin(data.user, email, rememberMe);
    }

    if (isLocalBackend) {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Local backend validation failed.");
      }
      const user = await res.json();

      setLocalSessionToken(user.token || null);
      if (rememberMe) {
        localStorage.setItem('adboard_remember', 'true');
      } else {
        localStorage.removeItem('adboard_remember');
      }
      localStorage.setItem('adboard_mock_authenticated', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', user.uid);
      localStorage.setItem('adboard_local_admin_dummy_email', user.email);
      localStorage.setItem('adboard_role', user.role || 'superadmin');
      localStorage.setItem('adboard_tutorial_seen', user.tutorialSeen ? 'true' : 'false');
      return user;
    }

    if (isPlaceholder) {
      const savedEmail = localStorage.getItem('adboard_local_admin_dummy_email');

      if (savedEmail && savedEmail === email && await matchesSandboxPassword(password)) {
        console.warn("No active remote auth found; simulated login completed successfully.");
        // Sandbox is single-user, so that user is the superadmin
        const mockUser = {
          uid: localStorage.getItem('adboard_local_admin_dummy_uid') || "local-admin-dev",
          email: email,
          emailVerified: true,
          role: 'superadmin' as const,
          tutorialSeen: localStorage.getItem('adboard_tutorial_seen') === 'true'
        };

        if (rememberMe) {
          localStorage.setItem('adboard_remember', 'true');
        }
        localStorage.setItem('adboard_mock_authenticated', 'true');
        localStorage.setItem('adboard_role', 'superadmin');
        return mockUser;
      }
      throw new Error("Invalid password or email. AdBoard Sandbox is running.");
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (rememberMe) {
        localStorage.setItem('adboard_remember', 'true');
      } else {
        localStorage.removeItem('adboard_remember');
      }
      
      return userCredential.user;
    } catch (error: any) {
      // Firebase multi-factor gate (requires Identity Platform TOTP MFA)
      if (error?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error);
        const totpHint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (totpHint) {
          throw new TwoFactorRequired({
            method: 'firebase',
            resolver,
            hintUid: totpHint.uid,
            rememberMe
          });
        }
      }

      // Local sandbox validator check
      const savedEmail = localStorage.getItem('adboard_local_admin_dummy_email');

      if (savedEmail && savedEmail === email && await matchesSandboxPassword(password)) {
        console.warn("No active remote auth found; simulated login completed successfully.");
        const mockUser = {
          uid: localStorage.getItem('adboard_local_admin_dummy_uid') || "local-admin-dev",
          email: email,
          emailVerified: true,
          role: 'superadmin' as const,
          tutorialSeen: localStorage.getItem('adboard_tutorial_seen') === 'true'
        };

        if (rememberMe) {
          localStorage.setItem('adboard_remember', 'true');
        }
        localStorage.setItem('adboard_mock_authenticated', 'true');
        localStorage.setItem('adboard_role', 'superadmin');
        return mockUser;
      }
      throw error;
    }
  },

  /**
   * Finalizes a successful Supabase sign-in: persists session hints and
   * self-heals the setup flag (it may never have been written if the original
   * setup was interrupted by the email-confirmation requirement).
   */
  async finishSupabaseLogin(user: any, email: string, rememberMe: boolean): Promise<any> {
    const mockUser: any = {
      uid: user?.id || 'supabase-admin',
      email: user?.email || email,
      emailVerified: true,
      role: 'editor',
      tutorialSeen: false,
    };

    if (rememberMe) {
      localStorage.setItem('adboard_remember', 'true');
    } else {
      localStorage.removeItem('adboard_remember');
    }
    localStorage.setItem('adboard_mock_authenticated', 'true');
    localStorage.setItem('adboard_local_admin_dummy_uid', mockUser.uid);
    localStorage.setItem('adboard_local_admin_dummy_email', mockUser.email);

    // Now that we hold an authenticated session, ensure the config and
    // settings rows exist so setup detection works from any browser.
    try {
      const nowStr = new Date().toISOString();
      const { data: configRow } = await supabase!
        .from('adboard_config').select('setup_completed').eq('id', 1).maybeSingle();
      const firstEverLogin = !configRow || !configRow.setup_completed;
      if (firstEverLogin) {
        await supabase!.from('adboard_config')
          .upsert({ id: 1, setup_completed: true, updated_at: nowStr });
      }
      const { data: settingsRow } = await supabase!
        .from('adboard_settings').select('id').eq('id', 1).maybeSingle();
      if (!settingsRow) {
        await supabase!.from('adboard_settings').upsert({
          id: 1,
          kiosk_mode: false,
          autoplay_seconds: 8,
          transition_effect: 'fade',
          updated_by: mockUser.uid,
          updated_at: nowStr
        });
      }

      localStorage.setItem('adboard_setup_completed', 'true');
    } catch (err) {
      console.warn("Could not verify Supabase provisioning state:", err);
    }

    // Resolve (and if necessary create) this account's adboard_users row.
    const record = await this.ensureSupabaseUserRecord(mockUser.uid, mockUser.email);
    if (record) {
      mockUser.role = record.role;
      mockUser.tutorialSeen = record.tutorialSeen;
    }

    // Persist role + tutorial state so a page refresh restores them even if the
    // adboard_users re-read momentarily fails (RLS, transient error, etc).
    localStorage.setItem('adboard_role', mockUser.role);
    localStorage.setItem('adboard_tutorial_seen', mockUser.tutorialSeen ? 'true' : 'false');

    return mockUser;
  },

  /**
   * Reads the caller's adboard_users row, creating it if absent. The very first
   * account to reach this point (empty table) is bootstrapped as the superadmin.
   *
   * Crucially this runs on BOTH explicit login and silent session-restore, so a
   * persisted Supabase session (page refresh) still provisions/resolves the row
   * instead of silently defaulting the user to editor.
   *
   * Returns null only when the backend could not be reached at all; callers then
   * fall back to the last-known persisted role.
   */
  async ensureSupabaseUserRecord(uid: string, email: string): Promise<{ role: 'superadmin' | 'editor'; tutorialSeen: boolean } | null> {
    if (!isSupabaseBackend) return null;
    try {
      const { data, error } = await supabase!
        .from('adboard_users')
        .select('role, tutorial_seen')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return { role: (data.role === 'superadmin' ? 'superadmin' : 'editor'), tutorialSeen: !!data.tutorial_seen };
      }

      // No row yet: bootstrap. First user overall becomes the superadmin.
      const { count } = await supabase!
        .from('adboard_users')
        .select('user_id', { count: 'exact', head: true });
      const role: 'superadmin' | 'editor' = (count || 0) === 0 ? 'superadmin' : 'editor';
      const { error: insertError } = await supabase!
        .from('adboard_users')
        .insert({ user_id: uid, email, role });
      if (insertError) {
        console.warn("Could not create adboard_users row (check the table exists and RLS is applied):", insertError);
      }
      return { role, tutorialSeen: false };
    } catch (err) {
      console.warn("Could not resolve the Supabase user record:", err);
      return null;
    }
  },

  /**
   * Completes a 2FA-gated login using the context thrown by loginAdmin
   * (as a TwoFactorRequired error) plus the user's authenticator code.
   */
  async complete2FALogin(context: TwoFactorRequired['context'], code: string): Promise<any> {
    if (context.method === 'local') {
      const res = await fetch('/api/login/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken: context.pendingToken, code })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authenticator code verification failed.");
      }
      const user = await res.json();
      setLocalSessionToken(user.token || null);
      if (context.rememberMe) {
        localStorage.setItem('adboard_remember', 'true');
      }
      localStorage.setItem('adboard_mock_authenticated', 'true');
      localStorage.setItem('adboard_local_admin_dummy_uid', user.uid);
      localStorage.setItem('adboard_local_admin_dummy_email', user.email);
      return user;
    }

    if (context.method === 'supabase') {
      const { data: challenge, error: challengeError } = await supabase!.auth.mfa.challenge({
        factorId: context.factorId
      });
      if (challengeError) throw new Error(challengeError.message);

      const { error: verifyError } = await supabase!.auth.mfa.verify({
        factorId: context.factorId,
        challengeId: challenge.id,
        code: code.replace(/\s+/g, '')
      });
      if (verifyError) throw new Error("Invalid authenticator code. Please try again.");

      const { data: { user } } = await supabase!.auth.getUser();
      return this.finishSupabaseLogin(user, context.email, !!context.rememberMe);
    }

    // Firebase (Identity Platform TOTP MFA)
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(
      context.hintUid,
      code.replace(/\s+/g, '')
    );
    const credential = await context.resolver.resolveSignIn(assertion);
    if (context.rememberMe) {
      localStorage.setItem('adboard_remember', 'true');
    }
    return credential.user;
  },

  /**
   * Clears administrative auth.
   */
  async logoutAdmin(): Promise<void> {
    if (isSupabaseBackend) {
      try {
        await supabase!.auth.signOut();
      } catch (err) {
        console.warn("Supabase sign out failed:", err);
      }
      localStorage.removeItem('adboard_mock_authenticated');
      localStorage.removeItem('adboard_remember');
      return;
    }

    if (isLocalBackend) {
      try {
        await fetch('/api/logout', { method: 'POST', headers: getLocalAuthHeaders() });
      } catch (err) {
        console.warn("Local backend sign out failed:", err);
      }
      setLocalSessionToken(null);
      localStorage.removeItem('adboard_mock_authenticated');
      localStorage.removeItem('adboard_remember');
      return;
    }

    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Sign out remote failed: ", err);
    }
    localStorage.removeItem('adboard_mock_authenticated');
    localStorage.removeItem('adboard_remember');
  },

  /**
   * Fetches Display Config Settings
   */
  async getDisplaySettings(): Promise<DisplaySettings> {
    if (isSupabaseBackend) {
      try {
        const { data, error } = await supabase!
          .from('adboard_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (data) {
          const settings: DisplaySettings = {
            kioskMode: data.kiosk_mode,
            autoplaySeconds: data.autoplay_seconds,
            transitionEffect: data.transition_effect,
            updatedBy: data.updated_by,
            updatedAt: data.updated_at,
            fallbackUrl: data.fallback_url ?? null,
            fallbackType: data.fallback_type ?? null
          };
          localStorage.setItem('adboard_display_settings', JSON.stringify(settings));
          return settings;
        }
      } catch (err) {
        console.warn("Could not query Supabase display config settings:", err);
      }
      const localSettings = localStorage.getItem('adboard_display_settings');
      if (localSettings) {
        return JSON.parse(localSettings);
      }
      return {
        kioskMode: false,
        autoplaySeconds: 8,
        transitionEffect: 'fade',
        updatedBy: 'system',
        updatedAt: new Date().toISOString()
      };
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/display-settings');
        if (res.ok) {
          const settings = await res.json();
          // Sync local storage copy cache too
          localStorage.setItem('adboard_display_settings', JSON.stringify(settings));
          return settings;
        }
      } catch (err) {
        console.warn("Could not query local display config settings:", err);
      }
      const localSettings = localStorage.getItem('adboard_display_settings');
      if (localSettings) {
        return JSON.parse(localSettings);
      }
    }

    if (isPlaceholder) {
      const localSettings = localStorage.getItem('adboard_display_settings');
      if (localSettings) {
        return JSON.parse(localSettings);
      }
      return {
        kioskMode: false,
        autoplaySeconds: 8,
        transitionEffect: 'fade',
        updatedBy: 'system',
        updatedAt: new Date().toISOString()
      };
    }

    const settingsPath = 'settings/displayConfig';
    try {
      const snap = await getDoc(doc(db, 'settings', 'displayConfig'));
      if (snap.exists()) {
        return snap.data() as DisplaySettings;
      }
    } catch (error) {
      console.warn("Could not query Firestore display config, fetching cached local config settings.");
    }

    const localSettings = localStorage.getItem('adboard_display_settings');
    if (localSettings) {
      return JSON.parse(localSettings);
    }

    return {
      kioskMode: false,
      autoplaySeconds: 8,
      transitionEffect: 'fade',
      updatedBy: 'system',
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Updates Display Config Settings
   */
  async updateDisplaySettings(settings: Omit<DisplaySettings, 'updatedBy' | 'updatedAt'>, userId: string): Promise<void> {
    if (isSupabaseBackend) {
      const nowStr = new Date().toISOString();
      const row: Record<string, any> = {
        id: 1,
        kiosk_mode: settings.kioskMode,
        autoplay_seconds: settings.autoplaySeconds,
        transition_effect: settings.transitionEffect,
        updated_by: userId,
        updated_at: nowStr,
        fallback_url: settings.fallbackUrl ?? null,
        fallback_type: settings.fallbackType ?? null
      };
      let { error } = await supabase!.from('adboard_settings').upsert(row);
      if (error && /fallback_(url|type)/.test(error.message)) {
        // Older databases lack the fallback columns; save the rest and advise
        console.warn("Supabase adboard_settings is missing the fallback columns. Run the migration SQL in SUPABASE.md to enable the default slide feature.");
        delete row.fallback_url;
        delete row.fallback_type;
        ({ error } = await supabase!.from('adboard_settings').upsert(row));
      }
      if (error) {
        // Surface the failure honestly: a silent localStorage fallback here
        // made edits look saved when row-level security rejected them.
        throw new Error(`Could not save display settings to Supabase (${error.message}). Make sure you are signed in with a confirmed account.`);
      }
      const updatedSettings: DisplaySettings = {
        ...settings,
        updatedBy: userId,
        updatedAt: nowStr
      };
      await AuditService.log('settings.update', 'settings', 'displayConfig',
        `autoplay=${settings.autoplaySeconds}s, effect=${settings.transitionEffect}, kiosk=${settings.kioskMode}, defaultSlide=${settings.fallbackUrl ? 'set' : 'none'}`);
      localStorage.setItem('adboard_display_settings', JSON.stringify(updatedSettings));
      return;
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/display-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
          body: JSON.stringify({ ...settings, userId })
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('adboard_display_settings', JSON.stringify(data.settings));
          return;
        }
        if (res.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Session expired")) {
          throw err;
        }
        console.warn("Could not save display settings to local backend:", err);
      }
      // If server fetch failed, write locally as sandbox fallback
      const updatedSettings: DisplaySettings = {
        ...settings,
        updatedBy: userId,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('adboard_display_settings', JSON.stringify(updatedSettings));
      return;
    }

    const settingsPath = 'settings/displayConfig';
    const updatedSettings: DisplaySettings = {
      ...settings,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    };

    if (isPlaceholder) {
      localStorage.setItem('adboard_display_settings', JSON.stringify(updatedSettings));
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'displayConfig'), updatedSettings, { merge: true });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, settingsPath);
      } catch (err) {
        console.warn("Write settings failed on remote Firestore instance. Caching setting changes locally.");
      }
    }

    localStorage.setItem('adboard_display_settings', JSON.stringify(updatedSettings));
  },

  /**
   * Gets list of advertisements
   */
  async getMediaItems(): Promise<AdMedia[]> {
    if (isSupabaseBackend) {
      try {
        const { data, error } = await supabase!
          .from('adboard_media')
          .select('*')
          .order('sort_order', { ascending: true });
        if (data) {
          const items: AdMedia[] = data.map((d: any) => ({
            id: d.id,
            title: d.title,
            url: d.url,
            type: d.type || 'image',
            mimeType: d.mime_type || '',
            fileName: d.file_name || '',
            fileSize: Number(d.file_size || 0),
            duration: Number(d.duration),
            isActive: d.is_active,
            sortOrder: Number(d.sort_order),
            scheduledStart: d.scheduled_start,
            scheduledEnd: d.scheduled_end,
            ownerId: d.owner_id,
            createdAt: d.created_at,
            updatedAt: d.updated_at
          }));
          localStorage.setItem('adboard_media_list', JSON.stringify(items));
          return items;
        }
      } catch (err) {
        console.warn("Could not query Supabase media collections:", err);
      }
      const localMedia = localStorage.getItem('adboard_media_list');
      if (localMedia) {
        return JSON.parse(localMedia);
      }
      return [];
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/media');
        if (res.ok) {
          const items = await res.json();
          localStorage.setItem('adboard_media_list', JSON.stringify(items));
          return items;
        }
      } catch (err) {
        console.warn("Could not query local media collections, server is offline:", err);
      }
      const localMedia = localStorage.getItem('adboard_media_list');
      if (localMedia) {
        return JSON.parse(localMedia);
      }
      return [];
    }

    if (isPlaceholder) {
      const localMedia = localStorage.getItem('adboard_media_list');
      if (localMedia) {
        return JSON.parse(localMedia);
      }
      return [];
    }

    const collectionPath = 'media';
    try {
      const q = query(collection(db, 'media'), orderBy('sortOrder', 'asc'));
      const snap = await getDocs(q);
      const items: AdMedia[] = [];
      snap.forEach(docSnap => {
        items.push(docSnap.data() as AdMedia);
      });
      return items;
    } catch (error) {
      console.warn("Could not query Firestore media collections, serving locally stored cached media collections.");
    }

    const localMedia = localStorage.getItem('adboard_media_list');
    if (localMedia) {
      return JSON.parse(localMedia);
    }
    return [];
  },

  /**
   * Saves or registers new media node
   */
  async saveMediaItem(asset: AdMedia): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_media')
        .upsert({
          id: asset.id,
          title: asset.title,
          url: asset.url,
          type: asset.type,
          mime_type: asset.mimeType,
          file_name: asset.fileName,
          file_size: asset.fileSize,
          duration: asset.duration,
          is_active: asset.isActive,
          sort_order: asset.sortOrder,
          scheduled_start: asset.scheduledStart,
          scheduled_end: asset.scheduledEnd,
          owner_id: asset.ownerId,
          created_at: asset.createdAt,
          updated_at: asset.updatedAt
        });
      if (error) {
        // Surface the failure honestly instead of pretending via localStorage
        throw new Error(`Could not save the slide to Supabase (${error.message}). Make sure you are signed in with a confirmed account.`);
      }
      await AuditService.log('media.save', 'media', asset.id, `Saved slide "${asset.title}"`);
      // Sync state locally
      const items = await this.getMediaItems();
      localStorage.setItem('adboard_media_list', JSON.stringify(items));
      return;
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
          body: JSON.stringify(asset)
        });
        if (res.ok) {
          // Sync state locally
          const items = await this.getMediaItems();
          localStorage.setItem('adboard_media_list', JSON.stringify(items));
          return;
        }
        if (res.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Session expired")) {
          throw err;
        }
        console.warn("Saving media node to local backend failed. Storing inside local database registry cache:", err);
      }
      // Offline fallback
      const items = await this.getMediaItems();
      const idx = items.findIndex(i => i.id === asset.id);
      if (idx >= 0) {
        items[idx] = asset;
      } else {
        items.push(asset);
      }
      items.sort((a, b) => a.sortOrder - b.sortOrder);
      localStorage.setItem('adboard_media_list', JSON.stringify(items));
      return;
    }

    const path = `media/${asset.id}`;
    if (!isPlaceholder) {
      try {
        await setDoc(doc(db, 'media', asset.id), asset);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, path);
        } catch (err) {
          console.warn("Saving media node to cloud Firestore failed. Storing inside local database registry.");
        }
      }
    }

    // Sync state locally
    const items = await this.getMediaItems();
    const idx = items.findIndex(i => i.id === asset.id);
    if (idx >= 0) {
      items[idx] = asset;
    } else {
      items.push(asset);
    }
    // Re-sort
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    localStorage.setItem('adboard_media_list', JSON.stringify(items));
  },

  /**
   * Deletes target media entry
   */
  async deleteMediaItem(id: string): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_media')
        .delete()
        .eq('id', id);
      if (error) {
        // Surface the failure honestly instead of pretending via localStorage
        throw new Error(`Could not delete the slide from Supabase (${error.message}). Make sure you are signed in with a confirmed account.`);
      }
      await AuditService.log('media.delete', 'media', id, `Deleted slide ${id}`);
      const items = await this.getMediaItems();
      localStorage.setItem('adboard_media_list', JSON.stringify(items));
      return;
    }

    if (isLocalBackend) {
      try {
        const res = await fetch(`/api/media/${id}`, {
          method: 'DELETE',
          headers: getLocalAuthHeaders()
        });
        if (res.ok) {
          const items = await this.getMediaItems();
          localStorage.setItem('adboard_media_list', JSON.stringify(items));
          return;
        }
        if (res.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Session expired")) {
          throw err;
        }
        console.warn("Delete media node from local backend failed, removing from local registry cache:", err);
      }
      const items = await this.getMediaItems();
      const filtered = items.filter(i => i.id !== id);
      localStorage.setItem('adboard_media_list', JSON.stringify(filtered));
      return;
    }

    const path = `media/${id}`;
    if (!isPlaceholder) {
      try {
        await deleteDoc(doc(db, 'media', id));
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, path);
        } catch (err) {
          console.warn("Delete media node from cloud Firestore failed. Removing local reference.");
        }
      }
    }

    const items = await this.getMediaItems();
    const filtered = items.filter(i => i.id !== id);
    localStorage.setItem('adboard_media_list', JSON.stringify(filtered));
  }
};
