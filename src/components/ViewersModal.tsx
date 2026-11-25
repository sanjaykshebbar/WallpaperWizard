/**
 * ==========================================
 * File: src/components/ViewersModal.tsx
 * Project: AdBoard
 * Purpose:
 * Superadmin view of display screens ("viewers") currently showing
 * content. Shows a live count and lets the admin approve or deny each
 * device individually.
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import { DeviceService } from '../services/deviceService';
import { SecurityService } from '../services/securityService';
import { describeUserAgent } from '../shared/describeUserAgent';
import { ViewerDevice } from '../types';
import { X, MonitorPlay, RefreshCw, Check, Ban, Clock3, AlertCircle, Wifi, Pencil } from 'lucide-react';

const ACTIVE_WINDOW_MS = 60 * 1000; // "online" if seen within the last minute

export default function ViewersModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [devices, setDevices] = useState<ViewerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);

  const refresh = async () => {
    try {
      const [list, cfg] = await Promise.all([DeviceService.listDevices(), SecurityService.getConfig()]);
      setDevices(list);
      setApprovalRequired(cfg.viewerApprovalRequired);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load viewers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000); // live-ish refresh
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOnline = (d: ViewerDevice) => Date.now() - new Date(d.lastSeen).getTime() < ACTIVE_WINDOW_MS;
  const onlineCount = devices.filter(isOnline).length;

  const setStatus = async (d: ViewerDevice, status: ViewerDevice['status']) => {
    setMessage(null);
    try {
      await DeviceService.setStatus(d.deviceId, status);
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not update the viewer.' });
    }
  };

  const rename = async (d: ViewerDevice) => {
    const label = window.prompt('Name for this screen (e.g. "Lobby TV"):', d.label || '');
    if (label === null) return; // cancelled
    setMessage(null);
    try {
      await DeviceService.renameDevice(d.deviceId, label);
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not rename the viewer.' });
    }
  };

  /** "Lobby TV · lobby-pc.lan" / hostname / friendly browser-OS descriptor */
  const deviceName = (d: ViewerDevice) =>
    d.label || d.hostname || describeUserAgent(d.userAgent);

  const toggleApprovalRequired = async () => {
    setMessage(null);
    try {
      const cfg = await SecurityService.getConfig();
      await SecurityService.updateConfig({ ...cfg, viewerApprovalRequired: !approvalRequired }, userId);
      setApprovalRequired(!approvalRequired);
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not change the approval setting.' });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="viewers-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MonitorPlay className="w-4 h-4 text-blue-600" /> Display Viewers
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              <Wifi className="w-3 h-3" /> {onlineCount} online
            </span>
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={refresh} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="viewers-modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Every screen showing your public display registers here. Approve or <strong>block each
            device individually</strong> — unlike an IP rule, blocking a device does not affect other
            screens behind the same public IP. Blocked screens stop showing content within seconds.
            Click the pencil to give a screen a friendly name (e.g. “Lobby TV”); on the self-hosted
            backend a real hostname is resolved via reverse DNS where the network provides one.
          </p>

          {/* Require-approval toggle */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Require approval for new screens</span>
              <span className="text-[10px] text-slate-400 block leading-tight">New devices wait as “pending” until you approve them</span>
            </div>
            <button
              type="button"
              onClick={toggleApprovalRequired}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${approvalRequired ? 'bg-blue-600' : 'bg-slate-300'}`}
              id="viewer-approval-toggle"
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform ${approvalRequired ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {message && (
            <div className={`text-xs rounded-lg p-3 flex items-start gap-2 border font-medium ${message.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{message.text}</span>
            </div>
          )}

          {error ? (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3">{error}</div>
          ) : loading ? (
            <p className="text-xs text-slate-400 font-mono">Loading viewers...</p>
          ) : devices.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No screens have connected yet. Open the display board on a screen and it will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {devices.map((d) => (
                <li key={d.deviceId} className="border border-slate-150 rounded-lg px-3 py-2.5 bg-white flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${isOnline(d) ? 'bg-emerald-500' : 'bg-slate-300'}`} title={isOnline(d) ? 'Online' : 'Offline'} />
                      <span className="text-xs font-bold text-slate-800 truncate max-w-[180px]" title={d.userAgent || ''}>{deviceName(d)}</span>
                      <button onClick={() => rename(d)} className="text-slate-300 hover:text-blue-600 cursor-pointer" title="Rename this screen">
                        <Pencil className="w-3 h-3" />
                      </button>
                      {d.status === 'approved' && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded uppercase">Approved</span>}
                      {d.status === 'denied' && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded uppercase">Blocked</span>}
                      {d.status === 'pending' && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5"><Clock3 className="w-2.5 h-2.5" />Pending</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate max-w-[300px]">
                      {d.hostname ? `${d.hostname} · ` : ''}{d.ip || 'unknown IP'} · {describeUserAgent(d.userAgent)}
                    </p>
                    <p className="text-[9px] text-slate-400 font-mono">last seen {new Date(d.lastSeen).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {d.status !== 'approved' && (
                      <button onClick={() => setStatus(d, 'approved')} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 rounded-lg cursor-pointer" title="Approve this device">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {d.status !== 'denied' && (
                      <button onClick={() => setStatus(d, 'denied')} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded-lg cursor-pointer" title="Block this device (only this screen — not the whole location)">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
