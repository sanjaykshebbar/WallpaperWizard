/**
 * ==========================================
 * File: src/pages/Login.tsx
 * Project: AdBoard V3
 * Purpose:
 * Login screen allowing administrators to log in using their credentials
 * with optional local session persistence.
 * ==========================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { FirebaseService, TwoFactorRequired } from '../services/firebaseService';
import { LogIn, Lock, Mail, Sliders, AlertTriangle, ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';

export default function Login() {
  usePageTitle('Sign In · AdBoard');
  const navigate = useNavigate();
  const { user, isInitialising, setupCompleted, refreshSetupStatus, setCurrentUser, setUserProfile } = useFirebase();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);

  // Two-factor step state: set when loginAdmin demands an authenticator code
  const [twoFactorCtx, setTwoFactorCtx] = useState<TwoFactorRequired['context'] | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Synchronise or redirect based on authentication / setup state
  useEffect(() => {
    if (!isInitialising) {
      if (!setupCompleted) {
        // Only route to the account-creating wizard when the backend
        // definitively reports that setup has never been run
        FirebaseService.getSetupState().then((state) => {
          if (state === 'incomplete') {
            navigate('/setup');
          }
        });
      } else if (user) {
        navigate('/admin');
      }
    }
  }, [user, isInitialising, setupCompleted, navigate]);

  const finishLogin = (loggedUser: any) => {
    // Update local state context directly
    setCurrentUser(loggedUser);
    setUserProfile({
      userId: loggedUser.uid,
      email: loggedUser.email || '',
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    navigate('/admin');
  };

  /**
   * Submits user credentials to the active auth backend
   */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');

    if (!email || !password) {
      setErrorText("Validation error: Please provide both correct email and password.");
      return;
    }

    setLoading(true);
    try {
      const loggedUser = await FirebaseService.loginAdmin(email, password, rememberMe);
      finishLogin(loggedUser);
    } catch (err: any) {
      if (err instanceof TwoFactorRequired) {
        setTwoFactorCtx(err.context);
        setTwoFactorCode('');
      } else {
        console.error(err);
        setErrorText(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Completes the login with the 6-digit authenticator code
   */
  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    if (!twoFactorCtx) return;

    setLoading(true);
    try {
      const loggedUser = await FirebaseService.complete2FALogin(twoFactorCtx, twoFactorCode);
      finishLogin(loggedUser);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Authenticator code verification failed.');
    } finally {
      setLoading(false);
    }
  };

  if (isInitialising) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-slate-500">Booting AdBoard Core...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden relative">
        
        {/* Deep Slate upper banner */}
        <div className="bg-[#0F172A] p-6 text-white text-center border-b border-slate-800">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center font-bold text-white shadow-md text-sm">A3</div>
            <span className="text-white font-bold text-lg tracking-tight">AdBoard V3</span>
          </div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Enterprise Media Suite</p>
        </div>

        {/* Floating preview handle */}
        <div className="p-8 pb-5">
          <div className="flex justify-end mb-4">
            <Link 
              to="/"
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-blue-600 px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 transition-colors"
            >
              <Sliders className="w-3 h-3 text-blue-500" />
              <span>View Live Kiosk Feed</span>
            </Link>
          </div>

          {/* Subtitle brand introduction */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
              <LogIn className="w-4 h-4 text-blue-600" />
              Administrative Login
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Provide credentials to access your direct billboard management console.
            </p>
          </div>

          {errorText && (
            <div className="mb-4" id="login-err">
              {errorText.toLowerCase().includes('email not confirmed') ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-4 space-y-3 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-950 block text-sm">Email Confirmation Required</span>
                      <span>To secure the admin console, this system is configured as <strong className="font-bold text-amber-950">manual invite only</strong>. You must verify your email address before logging in.</span>
                    </div>
                  </div>
                  <div className="border-t border-amber-200 pt-2.5 space-y-1.5 text-amber-850 pl-6 list-disc">
                    <p>• <strong className="font-bold text-amber-950">Check your Inbox</strong>: Click the verification link sent to your email to activate your account.</p>
                    <p>• <strong className="font-bold text-amber-950">Check Spam Folder</strong>: If you don't receive it, search your spam or junk directory.</p>
                    <p>• <strong className="font-bold text-amber-950">Administrative Note</strong>: If you are the system owner, you can turn off verification by going to your Supabase Dashboard &rarr; <strong className="font-bold text-amber-950">Auth</strong> &rarr; <strong className="font-bold text-amber-950">Providers</strong> &rarr; <strong className="font-bold text-amber-950">Email</strong> and disabling the <strong className="font-bold text-amber-950">"Confirm email"</strong> switch.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 flex items-start gap-2 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorText}</span>
                </div>
              )}
            </div>
          )}

          {twoFactorCtx ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4" id="twofactor-form">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  This account is protected by two-factor authentication. Open your
                  authenticator app and enter the current 6-digit code.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="twofactor-code">
                  Authenticator Code
                </label>
                <input
                  id="twofactor-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  required
                  autoFocus
                  placeholder="123 456"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-center text-lg tracking-[0.3em] font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-300 transition-all"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                />
              </div>

              <button
                id="twofactor-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-blue-200"
              >
                {loading ? <span>Verifying code...</span> : <span>Verify &amp; Sign In</span>}
              </button>

              <button
                type="button"
                onClick={() => { setTwoFactorCtx(null); setErrorText(''); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 cursor-pointer"
              >
                &larr; Back to credentials
              </button>
            </form>
          ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="login-email">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="admin@organization.org"
                  className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-400 transition-all font-sans"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-400 transition-all font-sans"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Remember token handle */}
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me" className="ml-2 block text-xs text-slate-600 select-none">
                Remember active session
              </label>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 cursor-pointer mt-2 shadow-sm shadow-blue-200"
            >
              {loading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <LogIn className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-100 p-6 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Need to reboot your deployment configuration or register credentials? Run the <Link to="/setup" className="text-blue-600 font-semibold hover:underline">Setup Wizard</Link> again.
          </p>
        </div>
      </div>
    </div>
  );
}
