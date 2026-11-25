/**
 * First-run wizard: creates the superadmin account, then signs in.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AuthService } from '../services/authService';
import { ShieldCheck, Mail, Lock, ArrowRight } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import Brand from '../components/Brand';

export default function Setup() {
  usePageTitle('Setup');
  const navigate = useNavigate();
  const { refreshSetupStatus, setupCompleted, setCurrentUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Never re-expose the account-creating wizard once setup is done
  useEffect(() => {
    if (setupCompleted) navigate('/login');
  }, [setupCompleted, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (password.length < 8) return setErrorMessage('Password must contain at least 8 characters.');
    if (password !== confirmPassword) return setErrorMessage('Passwords do not match.');

    setIsSubmitting(true);
    try {
      const user = await AuthService.runPlatformSetup(email, password);
      setCurrentUser(user);
      await refreshSetupStatus();
      navigate('/admin');
    } catch (err: any) {
      setErrorMessage(err.message || 'Setup failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-400";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex items-center justify-center py-12 px-4 font-sans">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="ww-hero px-8 py-8 text-center">
          <Brand size="lg" />
          <p className="text-white/70 text-xs mt-3">First-run setup: create the superadmin account for this dashboard.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Superadmin account
          </h2>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs" id="setup-err" role="alert">{errorMessage}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="email">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="email" type="email" required autoComplete="username" placeholder="admin@yourorg.com" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="password">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="confirm-password">Confirm password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="confirm-password" type="password" required autoComplete="new-password" className={inputClass} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
          </div>

          <button id="setup-submit-btn" type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer">
            {isSubmitting ? 'Creating account…' : <>Create account <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
