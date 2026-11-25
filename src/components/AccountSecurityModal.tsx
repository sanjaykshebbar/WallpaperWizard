/**
 * ==========================================
 * File: src/components/AccountSecurityModal.tsx
 * Project: WallpaperWizard
 * Purpose:
 * Administrator profile controls: password change and management
 * of two-factor authenticator apps (add several, remove, QR setup).
 * ==========================================
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AccountService } from '../services/accountService';
import { TwoFactorFactor, TwoFactorEnrollment } from '../types';
import {
  X,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Trash2,
  Plus,
  Check,
  AlertCircle
} from 'lucide-react';

export default function AccountSecurityModal({ email, onClose }: { email: string; onClose: () => void }) {
  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 2FA state
  const [factors, setFactors] = useState<TwoFactorFactor[]>([]);
  const [factorsError, setFactorsError] = useState('');
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const [enrollLabel, setEnrollLabel] = useState('');
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollQrDataUrl, setEnrollQrDataUrl] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshFactors = async () => {
    try {
      setFactors(await AccountService.listTwoFactorFactors());
      setFactorsError('');
    } catch (err: any) {
      setFactorsError(err.message || 'Could not load two-factor devices.');
    }
  };

  useEffect(() => {
    refreshFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render a QR image locally whenever the backend gives us an otpauth URL
  useEffect(() => {
    let cancelled = false;
    if (enrollment?.otpauthUrl) {
      QRCode.toDataURL(enrollment.otpauthUrl, { width: 200, margin: 1 })
        .then(url => { if (!cancelled) setEnrollQrDataUrl(url); })
        .catch(() => { if (!cancelled) setEnrollQrDataUrl(null); });
    } else {
      setEnrollQrDataUrl(null);
    }
    return () => { cancelled = true; };
  }, [enrollment]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    setPasswordBusy(true);
    try {
      await AccountService.changePassword(currentPassword, newPassword);
      setPasswordMessage({ ok: true, text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMessage({ ok: false, text: err.message || 'Password change failed.' });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleStartEnrollment = async () => {
    setEnrollMessage(null);
    setEnrollBusy(true);
    try {
      const result = await AccountService.startTwoFactorEnrollment(enrollLabel.trim() || 'Authenticator');
      setEnrollment(result);
      setEnrollCode('');
    } catch (err: any) {
      setEnrollMessage({ ok: false, text: err.message || 'Could not start enrollment.' });
    } finally {
      setEnrollBusy(false);
    }
  };

  const handleConfirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setEnrollMessage(null);
    setEnrollBusy(true);
    try {
      await AccountService.confirmTwoFactorEnrollment(enrollment.factorId, enrollCode);
      setEnrollment(null);
      setEnrollLabel('');
      setEnrollCode('');
      setEnrollMessage({ ok: true, text: 'Authenticator added. It will be required at your next sign-in.' });
      await refreshFactors();
    } catch (err: any) {
      setEnrollMessage({ ok: false, text: err.message || 'Verification failed.' });
    } finally {
      setEnrollBusy(false);
    }
  };

  const handleRemoveFactor = async (factor: TwoFactorFactor) => {
    if (!window.confirm(`Remove authenticator "${factor.label}"? Sign-in will no longer ask for its codes.`)) {
      return;
    }
    setEnrollMessage(null);
    try {
      await AccountService.removeTwoFactorFactor(factor.id);
      await refreshFactors();
    } catch (err: any) {
      setEnrollMessage({ ok: false, text: err.message || 'Could not remove the authenticator.' });
    }
  };

  const feedback = (msg: { ok: boolean; text: string } | null) =>
    msg && (
      <div className={`text-xs rounded-lg p-3 flex items-start gap-2 border font-medium ${
        msg.ok
          ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
          : 'bg-red-50 border-red-100 text-red-700'
      }`}>
        {msg.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        <span>{msg.text}</span>
      </div>
    );

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="account-security-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Account &amp; Security
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="account-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-8">

          {/* Password section */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Reset Password
            </h4>
            {feedback(passwordMessage)}
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                type="password"
                required
                placeholder="Current password"
                autoComplete="current-password"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  placeholder="New password (8+ chars)"
                  autoComplete="new-password"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={passwordBusy}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
                id="change-password-btn"
              >
                {passwordBusy ? 'Updating password...' : 'Update Password'}
              </button>
            </form>
          </section>

          {/* Two-factor section */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" /> Two-Factor Authentication
            </h4>

              <>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Protect sign-in with one-time codes from an authenticator app
                  (Google Authenticator, Authy, 1Password, Microsoft Authenticator...).
                  You can register several devices; any of their codes will work.
                </p>

                {feedback(enrollMessage)}
                {factorsError && (
                  <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3">{factorsError}</div>
                )}

                {/* Registered factors */}
                {factors.length > 0 && (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {factors.map((factor) => (
                      <li key={factor.id} className="flex items-center justify-between px-3 py-2.5 bg-white">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">{factor.label}</span>
                          {factor.createdAt && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Added {new Date(factor.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFactor(factor)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded-lg cursor-pointer"
                          title="Remove this authenticator"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Enrollment flow */}
                {enrollment ? (
                  <form onSubmit={handleConfirmEnrollment} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                      1. Scan this QR code with your authenticator app (or type the secret manually).<br />
                      2. Enter the 6-digit code the app shows to finish.
                    </p>
                    {enrollQrDataUrl && (
                      <img
                        src={enrollQrDataUrl}
                        alt="Authenticator QR code"
                        className="w-40 h-40 mx-auto rounded-lg border border-slate-200 bg-white p-1"
                      />
                    )}
                    {enrollment.secret && (
                      <p className="text-[10px] text-slate-500 text-center font-mono break-all select-all bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                        {enrollment.secret}
                      </p>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={7}
                      required
                      placeholder="123 456"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-center text-base tracking-[0.3em] font-mono text-slate-900 focus:outline-none focus:border-blue-500 placeholder-slate-300"
                      value={enrollCode}
                      onChange={(e) => setEnrollCode(e.target.value)}
                      id="enroll-code-input"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={enrollBusy}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
                        id="enroll-confirm-btn"
                      >
                        {enrollBusy ? 'Verifying...' : 'Verify & Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEnrollment(null); setEnrollMessage(null); }}
                        className="px-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder='Device label, e.g. "My phone"'
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                      value={enrollLabel}
                      onChange={(e) => setEnrollLabel(e.target.value)}
                      id="enroll-label-input"
                    />
                    <button
                      onClick={handleStartEnrollment}
                      disabled={enrollBusy}
                      className="px-4 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      id="enroll-start-btn"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Authenticator
                    </button>
                  </div>
                )}
              </>
          </section>
        </div>
      </div>
    </div>
  );
}
