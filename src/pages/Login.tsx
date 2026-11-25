/**
 * Admin sign-in, with the two-factor code step when the account has 2FA.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthService, TwoFactorRequired, SessionUser } from '../services/authService';
import { LogIn, Lock, Mail, AlertTriangle, ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import Brand from '../components/Brand';

export default function Login() {
  usePageTitle('Sign In');
  const navigate = useNavigate();
  const { user, isInitialising, setupCompleted, setCurrentUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  useEffect(() => {
    if (isInitialising) return;
    if (!setupCompleted) navigate('/setup');
    else if (user) navigate('/admin');
  }, [user, isInitialising, setupCompleted, navigate]);

  const run = async (fn: () => Promise<SessionUser>) => {
    setErrorText('');
    setLoading(true);
    try {
      setCurrentUser(await fn());
      navigate('/admin');
    } catch (err: any) {
      if (err instanceof TwoFactorRequired) {
        setPendingToken(err.pendingToken);
        setTwoFactorCode('');
      } else {
        setErrorText(err.message || 'Sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-400";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex items-center justify-center py-12 px-4 font-sans">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="ww-hero p-6 text-center">
          <Brand size="lg" />
        </div>

        <div className="p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-display font-bold text-slate-900 flex items-center justify-center gap-1.5">
              <LogIn className="w-4 h-4 text-blue-600" />
              Admin Sign In
            </h1>
            <p className="text-xs text-slate-500 mt-1">Manage wallpapers across your organization's devices.</p>
          </div>

          {errorText && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 flex items-start gap-2" id="login-err" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          {pendingToken ? (
            <form onSubmit={e => { e.preventDefault(); run(() => AuthService.complete2FALogin(pendingToken, twoFactorCode)); }} className="space-y-4" id="twofactor-form">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>This account uses two-factor authentication. Enter the 6-digit code from your authenticator app.</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="twofactor-code">Authenticator code</label>
                <input
                  id="twofactor-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  required
                  autoFocus
                  placeholder="123 456"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-center text-lg tracking-[0.3em] font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm cursor-pointer">
                {loading ? 'Verifying…' : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => { setPendingToken(null); setErrorText(''); }} className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 cursor-pointer">
                &larr; Back
              </button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); run(() => AuthService.login(email, password)); }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="login-email">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="login-email" type="email" required autoComplete="username" placeholder="admin@yourorg.com" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="login-password">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="login-password" type="password" required autoComplete="current-password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </div>
              <button id="login-submit-btn" type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer">
                {loading ? 'Signing in…' : <>Sign In <LogIn className="w-4 h-4" /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
