/**
 * Fetch wrapper for the WallpaperWizard server API: adds the session token,
 * parses JSON, and turns error responses into thrown Errors.
 */

const TOKEN_KEY = 'ww_session_token';

export function setSessionToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = any>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = options;
  const res = await fetch(path, {
    ...init,
    ...(json !== undefined ? { method: init.method || 'POST', body: JSON.stringify(json) } : {}),
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || (res.status === 401 ? 'Session expired. Please sign in again.' : `Request failed (${res.status}).`));
  }
  return data as T;
}
