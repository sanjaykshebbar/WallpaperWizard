/**
 * ==========================================
 * File: src/services/localSession.ts
 * Project: AdBoard
 * Purpose:
 * Shared helpers for the self-hosted Express backend session token
 * and for hashed sandbox credentials kept in localStorage.
 * ==========================================
 */

const LOCAL_TOKEN_KEY = 'adboard_local_session_token';
const SANDBOX_PWD_HASH_KEY = 'adboard_local_admin_pwd_hash';
const LEGACY_PLAINTEXT_PWD_KEY = 'adboard_local_admin_dummy_pwd';

/**
 * Returns the Authorization header for the local Express backend, if a
 * session token is present.
 */
export function getLocalAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(LOCAL_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setLocalSessionToken(token: string | null): void {
  if (token) {
    localStorage.setItem(LOCAL_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(LOCAL_TOKEN_KEY);
  }
}

/**
 * SHA-256 hex digest. Returns null when the Web Crypto API is unavailable
 * (non-secure contexts), in which case no sandbox credential is stored.
 */
async function sha256(text: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stores the sandbox admin password as a SHA-256 hash (never plaintext).
 */
export async function storeSandboxPassword(password: string): Promise<void> {
  const hash = await sha256(password);
  if (hash) {
    localStorage.setItem(SANDBOX_PWD_HASH_KEY, hash);
  }
  localStorage.removeItem(LEGACY_PLAINTEXT_PWD_KEY);
}

/**
 * Verifies a password against the stored sandbox hash. Migrates legacy
 * plaintext records (written by earlier versions) to hashes on first match.
 */
export async function matchesSandboxPassword(password: string): Promise<boolean> {
  const storedHash = localStorage.getItem(SANDBOX_PWD_HASH_KEY);
  if (storedHash) {
    const hash = await sha256(password);
    return hash !== null && hash === storedHash;
  }

  const legacyPwd = localStorage.getItem(LEGACY_PLAINTEXT_PWD_KEY);
  if (legacyPwd !== null && legacyPwd === password) {
    await storeSandboxPassword(password);
    return true;
  }

  return false;
}
