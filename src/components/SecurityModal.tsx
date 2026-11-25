/**
 * ==========================================
 * File: src/components/SecurityModal.tsx
 * Project: AdBoard
 * Purpose:
 * Superadmin surface to manage IP-based dashboard access.
 * Off by default. Supports exact IPv4/IPv6 addresses and IPv4
 * CIDR ranges, with lock-out protection.
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import { SecurityService } from '../services/securityService';
import { isValidAllowlistEntry } from '../shared/ipMatch';
import { SecurityConfig } from '../types';
import { X, ShieldCheck, Plus, Trash2, Check, AlertCircle, Globe } from 'lucide-react';

export default function SecurityModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [config, setConfig] = useState<SecurityConfig>({ ipRestrictionEnabled: false, allowedIps: [], viewerApprovalRequired: false });
  const [loading, setLoading] = useState(true);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, ip] = await Promise.all([
          SecurityService.getConfig(),
          SecurityService.getClientIp()
        ]);
        setConfig(cfg);
        setClientIp(ip);
      } catch (err: any) {
        setMessage({ ok: false, text: err.message || 'Could not load the access policy.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addEntry = (value: string) => {
    const entry = value.trim();
    if (!entry) return;
    if (!isValidAllowlistEntry(entry)) {
      setMessage({ ok: false, text: `"${entry}" is not a valid IP address or CIDR range.` });
      return;
    }
    if (config.allowedIps.includes(entry)) return;
    setConfig({ ...config, allowedIps: [...config.allowedIps, entry] });
    setNewEntry('');
    setMessage(null);
  };

  const removeEntry = (entry: string) => {
    setConfig({ ...config, allowedIps: config.allowedIps.filter(e => e !== entry) });
  };

  const handleSave = async () => {
    setMessage(null);
    // Client-side lockout guard mirrors the server's protection
    if (config.ipRestrictionEnabled && clientIp && !config.allowedIps.some(e => e === clientIp)) {
      const covered = config.allowedIps.length > 0;
      if (!covered) {
        setMessage({ ok: false, text: `Add your current IP (${clientIp}) before enabling, or you may lock yourself out.` });
        return;
      }
    }
    setBusy(true);
    try {
      await SecurityService.updateConfig(config, userId);
      setMessage({ ok: true, text: 'Access policy saved.' });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not save the access policy.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="security-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Access Restrictions
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Beta</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="security-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <p className="text-xs text-slate-400 font-mono">Loading policy...</p>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] rounded-lg p-3 leading-relaxed">
                <strong className="font-bold">Beta — how enforcement works:</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li><strong>Self-hosted (Docker):</strong> enforced on the server for every request. Fully effective, and can allow individual devices by their private (LAN) IP.</li>
                  <li><strong>Vercel:</strong> enforced at the edge <em>only if</em> you enable the included <code>middleware.ts</code> (see SUPABASE.md). Otherwise the check is in-browser and best-effort.</li>
                  <li><strong>Office / cellular note:</strong> all devices behind one router share a single public IP, so public-IP rules cannot target individual devices. For per-device control use <strong>Display Viewers → approve/deny</strong> instead.</li>
                </ul>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Restrict who can open the dashboard by IP address or IPv4 CIDR range. <strong>Off by default.</strong>
              </p>

              {message && (
                <div className={`text-xs rounded-lg p-3 flex items-start gap-2 border font-medium ${
                  message.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
                }`}>
                  {message.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Enable toggle */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Enable IP restriction</span>
                  <span className="text-[10px] text-slate-400 block leading-tight">Only listed addresses may open the dashboard</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, ipRestrictionEnabled: !config.ipRestrictionEnabled })}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${config.ipRestrictionEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                  id="ip-restriction-toggle"
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform ${config.ipRestrictionEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Current IP hint */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-500" /> Your current IP
                </span>
                <span className="font-mono font-bold text-slate-800">{clientIp || 'unknown'}</span>
                {clientIp && !config.allowedIps.includes(clientIp) && (
                  <button
                    onClick={() => addEntry(clientIp)}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    + Add mine
                  </button>
                )}
              </div>

              {/* Allowlist editor */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-widest">Allowed Addresses</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 203.0.113.9 or 192.168.1.0/24"
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 placeholder-slate-400"
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(newEntry); } }}
                    id="new-ip-entry"
                  />
                  <button
                    onClick={() => addEntry(newEntry)}
                    className="px-3 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    id="add-ip-btn"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {config.allowedIps.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">No addresses yet. With restriction enabled and an empty list, everyone is blocked (except the server's own loopback).</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {config.allowedIps.map((entry) => (
                      <li key={entry} className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-800 text-[11px] font-mono px-2 py-1 rounded-lg">
                        {entry}
                        <button onClick={() => removeEntry(entry)} className="text-blue-400 hover:text-red-600 cursor-pointer" title="Remove">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={busy}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
                id="save-security-btn"
              >
                {busy ? 'Saving policy...' : 'Save Access Policy'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
