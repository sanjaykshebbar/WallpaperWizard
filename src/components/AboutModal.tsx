/**
 * ==========================================
 * File: src/components/AboutModal.tsx
 * Project: AdBoard
 * Purpose:
 * About screen: what AdBoard is (a hobby project), its MIT license,
 * the open-source profile of its dependencies, and a plain-language
 * usage & privacy statement (no telemetry, data stays on your backend).
 * ==========================================
 */

import React, { useState } from 'react';
import {
  X,
  Info,
  Heart,
  Scale,
  ShieldCheck,
  EyeOff,
  Server,
  Github,
  ExternalLink,
  PackageOpen
} from 'lucide-react';

const APP_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/sanjaykshebbar/Adboard_v4';

type Tab = 'about' | 'license' | 'privacy';

export default function AboutModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('about');

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
        tab === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800'
      }`}
      id={`about-tab-${id}`}
    >
      {label}
    </button>
  );

  const link = (href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
    >
      {label} <ExternalLink className="w-3 h-3" />
    </a>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="about-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-extrabold text-white text-lg shadow-md">A3</div>
              <div>
                <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight">AdBoard</h3>
                <p className="text-[10px] text-slate-400 font-mono">v{APP_VERSION} · Self-hosted digital signage</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="about-modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-4">
            {tabBtn('about', 'About')}
            {tabBtn('license', 'License & Open Source')}
            {tabBtn('privacy', 'Usage & Privacy')}
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">

          {tab === 'about' && (
            <>
              <div className="flex items-start gap-3">
                <Heart className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">AdBoard is a hobby project.</strong> It was built for the joy of
                  building — not as a commercial product. There is no company behind it, no paid tier,
                  and no guaranteed support. It is shared so others can use it, learn from it, and make it better.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Host it as you need.</strong> Run it on Supabase, Firebase,
                  Vercel, or fully offline with the self-hosted Docker backend. Your deployment is yours:
                  every screen, every slide, every account lives on infrastructure you control.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Github className="w-4 h-4 text-slate-800 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Improve it as you need.</strong> The full source is on{' '}
                  {link(REPO_URL, 'GitHub')}. Fork it, patch it, extend it — the MIT License asks only
                  that you keep the copyright notice.
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
                <EyeOff className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-emerald-800">
                  <strong>No telemetry.</strong> This software collects no analytics, usage statistics,
                  or crash reports, and never "phones home".
                </p>
              </div>
            </>
          )}

          {tab === 'license' && (
            <>
              <div className="flex items-start gap-3">
                <Scale className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 mb-1">MIT License · © 2026 Sanjay KS</p>
                  <p>
                    You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of
                    this software — commercially or privately — provided the copyright and permission
                    notice are included. The software is provided <em>"as is"</em>, without warranty of any kind.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <PackageOpen className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 mb-1">Open-source dependencies</p>
                  <p>
                    AdBoard is built on 190 shipped open-source packages, all under permissive licenses
                    (MIT, Apache-2.0, ISC, BSD, 0BSD). <strong>No copyleft (GPL/AGPL) code is included.</strong>{' '}
                    A full FOSS review found the project low-risk for any kind of hosting or redistribution.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">Read the full documents</p>
                <p>{link('/legal/license.html', 'License')} — the full MIT license text</p>
                <p>{link('/legal/third-party-notices.html', 'Third-party notices')} — attribution for all 190 shipped packages</p>
                <p>{link('/legal/foss-review.html', 'FOSS review')} — the complete licensing &amp; compliance review</p>
              </div>
            </>
          )}

          {tab === 'privacy' && (
            <>
              <div className="flex items-start gap-3">
                <EyeOff className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">No telemetry, ever.</strong> AdBoard contains no analytics,
                  tracking, ad networks, or update checks. Nothing about your usage is collected or transmitted
                  to the author.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Your data stays with you.</strong> Accounts, media, settings,
                  viewer devices, and audit logs are stored only in the backend <em>you</em> configured
                  (your Supabase/Firebase project or your own server). The deployment operator is the data
                  controller for their instance.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 mb-1">External connections (complete list)</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Your backend</strong> — all app data; fully offline with the Docker backend</li>
                    <li><strong>Google Fonts</strong> — UI typefaces on page load (self-hostable if needed)</li>
                    <li><strong>ipify</strong> — only when an IP-based feature needs this device's public IP on cloud hosting</li>
                    <li><strong>GitHub</strong> — only when you explicitly submit the feedback form</li>
                  </ul>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p>
                  Read the {link('/legal/privacy.html', 'full usage & privacy policy')} — it changes
                  only when the software's actual behavior changes.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-mono">Made with care, shared under MIT</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
            <Github className="w-3 h-3" /> View source
          </a>
        </div>
      </div>
    </div>
  );
}
