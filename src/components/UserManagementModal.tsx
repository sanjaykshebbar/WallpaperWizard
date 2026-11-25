/**
 * ==========================================
 * File: src/components/UserManagementModal.tsx
 * Project: WallpaperWizard
 * Purpose:
 * Superadmin surface to invite and remove editor accounts.
 * Editors can manage media but cannot create users or change
 * the IP access policy.
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import { UserService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { ManagedUser } from '../types';
import { X, Users as UsersIcon, UserPlus, Trash2, Check, AlertCircle, ShieldCheck } from 'lucide-react';

export default function UserManagementModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setUsers(await UserService.listUsers());
      setListError('');
    } catch (err: any) {
      setListError(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await UserService.createUser(email.trim(), password, 'editor');
      setMessage({ ok: true, text: `Editor account created for ${email.trim()}.` });
      setEmail('');
      setPassword('');
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not create the user.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (target: ManagedUser) => {
    if (target.userId === user?.uid) {
      setMessage({ ok: false, text: 'You cannot remove your own account.' });
      return;
    }
    if (!window.confirm(`Remove dashboard access for ${target.email}?`)) return;
    setMessage(null);
    try {
      await UserService.deleteUser(target);
      await refresh();
      setMessage({ ok: true, text: `Removed ${target.email}.` });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not remove the user.' });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="user-management-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-blue-600" /> Manage Users
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="users-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Editors can add, schedule, and push wallpapers. Only superadmins can manage
            devices, push settings, users, and access restrictions.
          </p>

          {message && (
            <div className={`text-xs rounded-lg p-3 flex items-start gap-2 border font-medium ${
              message.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
            }`}>
              {message.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Invite form */}
          <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-blue-600" /> Add Editor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                required
                placeholder="editor@organization.org"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="new-user-email"
              />
              <input
                type="password"
                required
                placeholder="Temp password (8+ chars)"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                id="new-user-password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
              id="create-user-btn"
            >
              {busy ? 'Creating account...' : 'Create Editor Account'}
            </button>
          </form>

          {/* User list */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Dashboard Users</h4>
            {loading ? (
              <p className="text-xs text-slate-400 font-mono">Loading users...</p>
            ) : listError ? (
              <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3">{listError}</div>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {users.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between px-3 py-2.5 bg-white">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        {u.email}
                        {u.role === 'superadmin' && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                            <ShieldCheck className="w-2.5 h-2.5" /> Superadmin
                          </span>
                        )}
                        {u.role === 'editor' && (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Editor</span>
                        )}
                      </span>
                      {u.createdAt && (
                        <span className="text-[10px] text-slate-400 font-mono">Added {new Date(u.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {u.role !== 'superadmin' && u.userId !== user?.uid && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded-lg cursor-pointer shrink-0"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
