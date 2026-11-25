/**
 * ==========================================
 * File: middleware.ts  (Vercel Edge Middleware) — BETA
 * Project: AdBoard
 * Purpose:
 * Real, server-side IP enforcement for the dashboard routes on Vercel.
 * Runs at the edge BEFORE the SPA is served, so a disallowed IP never
 * receives the admin app at all (unlike the in-browser gate, which can
 * only react after the page has already loaded).
 *
 * Enable it by deploying this file with the project on Vercel and setting
 * these Environment Variables in the Vercel dashboard:
 *   VITE_SUPABASE_URL       — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY  — your Supabase anon key
 *
 * It reads the allowlist from the (publicly readable) adboard_security row.
 * The public display board at "/" is intentionally NOT matched.
 * ==========================================
 */

export const config = {
  matcher: ['/admin', '/login', '/setup'],
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function normalizeIp(ip: string): string {
  const t = (ip || '').trim().toLowerCase();
  const m = t.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? m[1] : t;
}

function ipMatches(clientIp: string, entry: string): boolean {
  const ip = normalizeIp(clientIp);
  const rule = normalizeIp(entry);
  const cidr = rule.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (cidr) {
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(cidr[1]);
    const bits = Number(cidr[2]);
    if (ipInt === null || baseInt === null || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }
  return ip === rule;
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const supabaseUrl = (globalThis as any).process?.env?.VITE_SUPABASE_URL;
  const supabaseKey = (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY;

  // Without Supabase env the edge check can't run; let the request through so
  // the in-browser gate remains the (best-effort) fallback.
  if (!supabaseUrl || !supabaseKey) return undefined;

  // Vercel forwards the real client IP in x-forwarded-for (first entry)
  const fwd = request.headers.get('x-forwarded-for') || '';
  const clientIp = normalizeIp(fwd.split(',')[0] || request.headers.get('x-real-ip') || '');

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/adboard_security?id=eq.1&select=ip_restriction_enabled,allowed_ips`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) return undefined; // fail open — don't brick the dashboard
    const rows = await res.json();
    const cfg = Array.isArray(rows) ? rows[0] : null;
    if (!cfg || !cfg.ip_restriction_enabled) return undefined;

    const allowed: string[] = Array.isArray(cfg.allowed_ips) ? cfg.allowed_ips : [];
    if (clientIp && allowed.some((e) => ipMatches(clientIp, e))) return undefined;

    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Access Denied</title>
       <style>body{font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;display:flex;
       min-height:100vh;align-items:center;justify-content:center;margin:0}
       .c{max-width:28rem;text-align:center;padding:2rem}h1{color:#fca5a5}
       code{background:#111a2e;padding:.2rem .4rem;border-radius:.3rem;font-size:.85rem}</style></head>
       <body><div class="c"><h1>Access Denied</h1>
       <p>This device is not authorized to access the AdBoard dashboard.</p>
       <p>Your IP address: <code>${clientIp || 'unknown'}</code></p>
       <p>Contact your administrator to add your network to the access allowlist.</p></div></body></html>`,
      { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  } catch {
    return undefined; // fail open on any edge error
  }
}
