/**
 * About WallpaperWizard: what it does, what it touches on your network, and its license.
 */

import { X, Scale, ShieldCheck, EyeOff, Server, ExternalLink } from 'lucide-react';
import Brand from './Brand';
import { version } from '../../package.json';

export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="about-modal" role="dialog" aria-modal="true" aria-label="About WallpaperWizard">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="ww-hero px-6 py-5 flex items-start justify-between">
          <div>
            <Brand />
            <p className="text-[10px] text-white/60 font-mono mt-2">v{version} · self-hosted, agentless</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg cursor-pointer" id="about-modal-close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="flex items-start gap-3">
            <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900">How it works.</strong> The server scans the network ranges you
              configure for Windows PCs and MacBooks that advertise a WallpaperWizard discovery marker over SSH.
              Once you approve a device, the server signs in with the shared admin account, copies the wallpaper,
              and applies it for the signed-in user.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900">Credentials.</strong> The device admin password is encrypted at rest
              on this server and is never sent back to the browser. Each device is pinned to its SSH host key, so the
              password is only ever sent to approved devices whose identity has not changed.
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
            <EyeOff className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-emerald-800">
              <strong>No telemetry.</strong> All data stays in this container's data volume. The only outside
              connection is Google Fonts for the dashboard typefaces.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Scale className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-900">MIT License.</strong> Built on AdBoard (© 2026 Sanjay KS, MIT).{' '}
              <a href="/legal/license.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold">
                License text <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
