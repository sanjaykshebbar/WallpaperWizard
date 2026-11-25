/**
 * Setup wizard, sign-in (with optional 2FA step) and sign-out.
 */

import { api, setSessionToken } from './api';
import { AdminRole } from '../types';

export interface SessionUser {
  uid: string;
  email: string;
  role: AdminRole;
  tutorialSeen: boolean;
}

/** Thrown by login when the account has 2FA; pass it to complete2FALogin with the code. */
export class TwoFactorRequired extends Error {
  constructor(public pendingToken: string) {
    super('Two-factor authentication required.');
    this.name = 'TwoFactorRequired';
  }
}

const SESSION_KEY = 'ww_session_user';

function startSession(data: any): SessionUser {
  setSessionToken(data.token || null);
  const user: SessionUser = {
    uid: data.uid || data.userId,
    email: data.email,
    role: data.role || 'editor',
    tutorialSeen: !!data.tutorialSeen
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export const AuthService = {
  /** 'unknown' when the server cannot be reached. */
  async getSetupState(): Promise<'complete' | 'incomplete' | 'unknown'> {
    try {
      const data = await api('/api/setup/completed');
      return data.completed ? 'complete' : 'incomplete';
    } catch {
      return 'unknown';
    }
  },

  async runPlatformSetup(email: string, password: string): Promise<SessionUser> {
    return startSession(await api('/api/setup', { json: { email, password } }));
  },

  async login(email: string, password: string): Promise<SessionUser> {
    const data = await api('/api/login', { json: { email, password } });
    if (data.requires2fa) throw new TwoFactorRequired(data.pendingToken);
    return startSession(data);
  },

  async complete2FALogin(pendingToken: string, code: string): Promise<SessionUser> {
    return startSession(await api('/api/login/verify-2fa', { json: { pendingToken, code } }));
  },

  /** Session remembered from the last sign-in; the server still validates the token on every call. */
  restoreSession(): SessionUser | null {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  },

  rememberTutorialSeen(): void {
    const user = this.restoreSession();
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, tutorialSeen: true }));
  },

  async logout(): Promise<void> {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setSessionToken(null);
    localStorage.removeItem(SESSION_KEY);
  }
};
