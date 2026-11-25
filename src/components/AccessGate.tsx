/**
 * ==========================================
 * File: src/components/AccessGate.tsx
 * Project: WallpaperWizard
 * Purpose:
 * Wraps dashboard routes with the IP-based
 * access check. When the
 * device is not authorized, a clear error page is shown instead.
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { SecurityService, AccessCheckResult } from '../services/securityService';

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'allowed' | 'blocked'>('checking');
  const [result, setResult] = useState<AccessCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await SecurityService.checkAccess();
        if (cancelled) return;
        setResult(res);
        setState(res.enabled && !res.allowed ? 'blocked' : 'allowed');
      } catch {
        // Fail open: a broken policy lookup must not brick the dashboard
        if (!cancelled) setState('allowed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-xs font-mono">Verifying device access...</p>
        </div>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-6 font-sans" id="access-denied">
        <div className="max-w-md w-full bg-[#111a2e] border border-red-900/50 rounded-2xl shadow-2xl overflow-hidden text-center">
          <div className="bg-red-950/40 border-b border-red-900/40 py-8 px-6">
            <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-3" />
            <h1 className="text-xl font-display font-bold text-red-100">Access Denied</h1>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">
              This device is not authorized to access the WallpaperWizard dashboard.
            </p>
            {result?.reason && (
              <p className="text-xs text-slate-400 leading-relaxed">{result.reason}</p>
            )}
            {result?.clientIp && (
              <p className="text-[11px] text-slate-500 font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                Your IP address: {result.clientIp}
              </p>
            )}
            <p className="text-xs text-slate-400 leading-relaxed">
              If you believe this is a mistake, contact your administrator to add your
              network to the access allowlist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
