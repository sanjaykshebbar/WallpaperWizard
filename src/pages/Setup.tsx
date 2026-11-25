/**
 * ==========================================
 * File: src/pages/Setup.tsx
 * Project: AdBoard V3
 * Purpose:
 * First run setup wizard leading the administrator through
 * credential creation and step-by-step Firebase systems configurations.
 * ==========================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { FirebaseService } from '../services/firebaseService';
import { ShieldCheck, Mail, Lock, CheckCircle2, Sliders, Database, ArrowRight, HelpCircle } from 'lucide-react';
import { isSupabaseBackend } from '../supabase/config';
import { usePageTitle } from '../hooks/usePageTitle';

export default function Setup() {
  usePageTitle('Setup · AdBoard');
  const navigate = useNavigate();
  const { refreshSetupStatus, setupCompleted } = useFirebase();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);

  // If already configured, redirect safely rather than nesting setup loops.
  // Re-verify against the backend on mount so a stale or empty local cache
  // can never re-expose the account-creating wizard on a live deployment.
  React.useEffect(() => {
    if (setupCompleted) {
      navigate('/login');
      return;
    }
    FirebaseService.getSetupState().then((state) => {
      if (state === 'complete') {
        navigate('/login');
      }
    });
  }, [setupCompleted, navigate]);

  /**
   * Finalises administrative credentials and marks platform setup complete
   */
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Pre-submission audits
    if (!email) {
      setErrorMessage("Please enter a valid administrator email.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Security restriction: Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Credentials mismatch: Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create user profile and commit completed states
      await FirebaseService.runPlatformSetup(email, password);
      
      // Refresh context-level setup indicators
      await refreshSetupStatus();
      
      // Advance to visual step with Firebase detailed guidance
      setSetupStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || 'Setup transaction error. Please check system configurations.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        
        {/* Banner header using enterprise Slate Theme */}
        <div className="bg-[#0F172A] px-8 py-8 text-center border-b border-slate-800 relative">
          <div className="absolute top-4 left-4 bg-blue-600 text-white text-[10px] font-mono font-bold rounded px-2.5 py-0.5 tracking-wide uppercase">
            v3.0.0 Stable
          </div>
          
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-white shadow-lg text-base">A3</div>
            <span className="text-white font-bold text-2xl tracking-tight">AdBoard V3 Setup</span>
          </div>
          
          <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
            Configure administrative permissions and connect your digital signage kiosk platform to Firebase Cloud systems.
          </p>
        </div>

        <div className="p-8">
          {setupStep === 1 ? (
            <form onSubmit={handleSetupSubmit} className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  Owner Accounts Credentials
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Specify username and passcode credentials. These parameters authenticate dashboard administrative sessions.
                </p>
              </div>

              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-xs leading-relaxed font-medium" id="setup-err">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="email">
                    Administrator Username/Email
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="admin@organization.org"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-450 transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="password">
                    System Access Security Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="password"
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-450 transition-colors"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="confirm-password">
                    Verify Password Range Check
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      placeholder="Re-enter password to match"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-450 transition-colors"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Offline notice check */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex gap-3 text-xs text-slate-600 leading-relaxed">
                <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-950 block">Offline-Safe Local Storage Support</span>
                  Testing inside an isolated workspace context? AdBoard automatically stores system configurations and state records inside localized caches dynamically when Firestore bindings are temporarily absent.
                </div>
              </div>

              <button
                id="setup-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-blue-200"
              >
                {isSubmitting ? (
                  <span>Saving Administrator account records...</span>
                ) : (
                  <>
                    <span>Confirm &amp; Proceed to Integration Guide</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="text-center pb-5 border-b border-slate-100">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-xl font-display font-bold text-slate-900">
                  Account Ready for Actions!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Primary system credentials stored successfully: <span className="font-mono text-blue-600 font-semibold">{email}</span>
                </p>
              </div>

              {isSupabaseBackend ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600 font-bold" />
                    Supabase Setup &amp; Email Activation Required
                  </h4>
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg text-xs leading-relaxed space-y-2">
                    <p className="font-bold text-amber-950">
                      ⚠️ Action Required: Confirm Email / Manual Invite Only
                    </p>
                    <p>
                      Because this platform is running on Supabase with security parameters enabled, signups are configured as <strong className="font-bold">manual invite only</strong> and require a verified address.
                    </p>
                    <p>
                      An activation message has been dispatched to <span className="font-mono font-bold text-amber-950">{email}</span>. Please click the verification link in that email to authorize and unlock your administrative account.
                    </p>
                    <p className="text-[10px] text-slate-500 italic">
                      Administrative Note: If you want to bypass verification and log in instantly, toggle off the "Confirm email" setting under <strong>Auth &rarr; Providers &rarr; Email</strong> inside your Supabase dashboard.
                    </p>
                  </div>

                  <div className="space-y-4 font-mono text-[11px] text-slate-600 max-h-72 overflow-y-auto bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="border-b border-slate-200/60 pb-3">
                      <p className="text-emerald-700 font-bold mb-1">[1] Enable Email Authentication</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Log in to your Supabase Dashboard.</li>
                        <li>Go to <span className="text-slate-950 font-semibold">Authentication &gt; Providers</span>.</li>
                        <li>Ensure the <span className="text-slate-950 font-semibold">Email</span> provider is enabled.</li>
                      </ol>
                    </div>

                    <div className="py-2">
                      <p className="text-emerald-700 font-bold mb-1">[2] Storage Bucket Security Policies</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Go to <span className="text-slate-950 font-semibold">Storage &gt; Buckets</span>.</li>
                        <li>Ensure the bucket name <span className="text-slate-950 font-semibold">adboard-assets</span> exists and is marked as <span className="font-semibold text-slate-950">Public</span>.</li>
                        <li>Configure policies to grant full access to <span className="text-slate-950 font-semibold">Authenticated</span> users.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600 font-bold" />
                    Cloud Firebase Deploy Guidelines
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Before launching the kiosk on physical public screens, review these instructions to configure permanent Firestore cloud clusters:
                  </p>

                  <div className="space-y-4 font-mono text-[11px] text-slate-600 max-h-72 overflow-y-auto bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="border-b border-slate-200/60 pb-3">
                      <p className="text-blue-700 font-bold mb-1">[1] Enable Email Authentication</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Log in to your <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Firebase Console</a> portals.</li>
                        <li>In the primary drawer, select <span className="text-slate-950 font-semibold">Build &gt; Authentication</span>.</li>
                        <li>Enable <span className="text-slate-950 font-semibold">Email/Password</span> sign-in parameters from the provider matrix.</li>
                      </ol>
                    </div>

                    <div className="border-b border-slate-200/60 py-3">
                      <p className="text-blue-700 font-bold mb-1">[2] Publish Firestore Schema Settings</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Go to <span className="text-slate-950 font-semibold">Build &gt; Firestore Database</span>.</li>
                        <li>Replace default production rules with coordinates defined in <span className="text-slate-950 font-semibold">firestore.rules</span> to prevent database spoofing.</li>
                      </ol>
                    </div>

                    <div className="py-2">
                      <p className="text-blue-700 font-bold mb-1">[3] Activate Storage Buckets</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Go to <span className="text-slate-950 font-semibold">Build &gt; Storage</span>.</li>
                        <li>Initialize directories and configure MIME validations located within <span className="text-slate-950 font-semibold">storage.rules</span>.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  id="guide-finish-btn"
                  onClick={() => navigate('/login')}
                  className="flex-1 bg-slate-900 hover:bg-black text-white font-semibold py-2.5 rounded-lg transition-all text-xs text-center cursor-pointer shadow-md"
                >
                  Enter Login Screen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
