/**
 * ==========================================
 * File: src/components/AuditLogModal.tsx
 * Project: WallpaperWizard
 * Purpose:
 * Superadmin view of the immutable audit trail: every media,
 * user, settings, security, and auth action with actor and time.
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import { AuditService } from '../services/auditService';
import { AuditEntry } from '../types';
import { X, ScrollText, RefreshCw, AlertCircle } from 'lucide-react';

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  save: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  update: 'bg-blue-50 text-blue-700 border-blue-100',
  upload: 'bg-blue-50 text-blue-700 border-blue-100',
  delete: 'bg-red-50 text-red-700 border-red-100',
  remove: 'bg-red-50 text-red-700 border-red-100',
  login: 'bg-slate-100 text-slate-600 border-slate-200',
  complete: 'bg-slate-100 text-slate-600 border-slate-200'
};

function actionStyle(action: string): string {
  const verb = action.split('.').pop() || '';
  for (const key of Object.keys(ACTION_STYLES)) {
    if (verb.includes(key)) return ACTION_STYLES[key];
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export default function AuditLogModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setEntries(await AuditService.getLogs(300));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="audit-log-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-600" /> Audit Log
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={refresh} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" title="Refresh" id="audit-refresh-btn">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="audit-modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
            Every administrative action is recorded here: wallpapers, devices, pushes,
            push settings, users, and access-policy updates, with who did it and when.
          </p>

          {error ? (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          ) : loading ? (
            <p className="text-xs text-slate-400 font-mono">Loading audit trail...</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No actions recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="border border-slate-150 rounded-lg px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${actionStyle(entry.action)}`}>
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.details && (
                    <p className="text-xs text-slate-700 mt-1.5 leading-snug">{entry.details}</p>
                  )}
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    by {entry.actorEmail || entry.actorId || 'system'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
