/**
 * ==========================================
 * File: src/components/OnboardingTour.tsx
 * Project: AdBoard
 * Purpose:
 * First-run walkthrough of the admin dashboard. Shows once after
 * the first login (skippable) and can be replayed from the sidebar.
 * ==========================================
 */

import React, { useState } from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  Images,
  SlidersHorizontal,
  MonitorPlay,
  ShieldCheck,
  X,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

interface TourStep {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: <LayoutDashboard className="w-8 h-8 text-blue-600" />,
    title: 'Welcome to AdBoard',
    body: 'This dashboard is where you manage everything your public display screen shows. This quick tour points out the main areas — you can skip it at any time and replay it later from the sidebar.'
  },
  {
    icon: <UploadCloud className="w-8 h-8 text-blue-600" />,
    title: 'Publish a slide',
    body: 'Use the "Publish advertisement" panel on the right to upload an image or video. Give it a title, choose how many seconds it stays on screen, and optionally set a start and end date so it only runs during a campaign window.'
  },
  {
    icon: <Images className="w-8 h-8 text-blue-600" />,
    title: 'Manage your gallery',
    body: 'The media gallery lists every slide. Click "Adjust Settings" on a slide to rename it, change its duration, reorder it, schedule it, or switch it between Active (shown on screen) and Muted (hidden). The trash button removes it permanently.'
  },
  {
    icon: <SlidersHorizontal className="w-8 h-8 text-blue-600" />,
    title: 'Tune the display',
    body: 'The "Kiosk Display Parameters" panel controls the screen itself: how long slides stay up by default, the transition animation, a default slide for when nothing is scheduled, and Kiosk Lockout, which hides the on-screen controls from the public.'
  },
  {
    icon: <MonitorPlay className="w-8 h-8 text-blue-600" />,
    title: 'Open the display screen',
    body: 'Click "Interactive Board" in the sidebar to open the public display in a new tab. Put that tab in fullscreen on the screen or TV you want to use. It refreshes itself every 30 seconds, so new slides appear automatically.'
  },
  {
    icon: <ShieldCheck className="w-8 h-8 text-blue-600" />,
    title: 'Secure your account',
    body: 'Open "Account & Security" from the sidebar to change your password or add two-factor authentication with an authenticator app such as Google Authenticator or Authy. You are all set — enjoy AdBoard!'
  }
];

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  // Persistence is handled by the parent's onClose (writes to the user's
  // account record), so the tutorial never reappears on a new session.
  const finish = () => {
    onClose();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="onboarding-tour">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
            Getting started · {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={finish}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
            title="Skip tutorial"
            id="tour-skip-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6 text-center space-y-3">
          <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto">
            {current.icon}
          </div>
          <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">{current.title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">{current.body}</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${i === step ? 'w-6 bg-blue-600' : 'w-1.5 bg-slate-200 hover:bg-slate-300'}`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={finish}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep(step + 1))}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
              id="tour-next-btn"
            >
              {isLast ? 'Finish' : 'Next'} {!isLast && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
