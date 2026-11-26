/**
 * ==========================================
 * File: src/components/OnboardingTour.tsx
 * Project: WallpaperWizard
 * Purpose:
 * First-run walkthrough of the admin dashboard. Shows once after
 * the first login (skippable) and can be replayed from the sidebar.
 * ==========================================
 */

import React, { useState } from 'react';
import {
  LayoutDashboard,
  KeyRound,
  Radar,
  UploadCloud,
  Send,
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
    title: 'Welcome to WallpaperWizard',
    body: 'This dashboard sets the desktop wallpaper on your organization\'s Windows PCs and MacBooks without installing an agent. You can replay this tour from the sidebar.'
  },
  {
    icon: <KeyRound className="w-8 h-8 text-blue-600" />,
    title: '1. Save the device credentials',
    body: 'Open Push Settings. Enter the device admin username and password, then add your network ranges. Run the setup command on each device and paste each MacBook fingerprint into Push Settings before saving.'
  },
  {
    icon: <Radar className="w-8 h-8 text-blue-600" />,
    title: '2. Scan and approve devices',
    body: 'Select Scan now in Devices to find Windows PCs and enrolled MacBooks. Verify a pending device before approving it. You can give each device a name and a group, such as Sales or Lobby.'
  },
  {
    icon: <UploadCloud className="w-8 h-8 text-blue-600" />,
    title: '3. Add wallpapers',
    body: 'Upload a JPG or PNG on the Wallpapers tab and choose who gets it: everyone, one group, or one device. Optionally schedule a start and end time. When several apply, the most specific wins (device over group over everyone).'
  },
  {
    icon: <Send className="w-8 h-8 text-blue-600" />,
    title: '4. Pushes happen automatically',
    body: 'Changes go out right away and the scan repeats on your chosen interval, so new devices and schedule changes are picked up. Use "Push now" to resend. Each device shows its last push result.'
  },
  {
    icon: <ShieldCheck className="w-8 h-8 text-blue-600" />,
    title: 'Secure your account',
    body: 'Open "Account & Security" in the sidebar to change your password or add two-factor authentication. You are all set!'
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
