/**
 * ==========================================
 * File: src/components/FeedbackModal.tsx
 * Project: AdBoard
 * Purpose:
 * Lets the operator report a bug or share feedback, which becomes a
 * GitHub issue on the project repository.
 * ==========================================
 */

import React, { useState } from 'react';
import { FeedbackService, FeedbackType, FeedbackOutcome } from '../services/feedbackService';
import { X, MessageSquarePlus, Bug, Lightbulb, MessageCircle, ExternalLink, Check, AlertCircle, ServerCog } from 'lucide-react';

const TYPES: { value: FeedbackType; label: string; icon: React.ReactNode }[] = [
  { value: 'bug', label: 'Bug', icon: <Bug className="w-3.5 h-3.5" /> },
  { value: 'feature', label: 'Idea', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { value: 'feedback', label: 'Feedback', icon: <MessageCircle className="w-3.5 h-3.5" /> }
];

export default function FeedbackModal({ defaultEmail, onClose }: { defaultEmail?: string; onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(defaultEmail || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ outcome: FeedbackOutcome; url: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !description.trim()) {
      setError('Please add a short title and a description.');
      return;
    }
    setBusy(true);
    try {
      const res = await FeedbackService.submit({ type, title, description, email: email.trim() || undefined });
      setResult(res);
      // Only for a public repo do we open GitHub for one-click submit
      if (res.outcome === 'prefill') {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setError(err.message || 'Could not submit feedback.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans" id="feedback-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-blue-600" /> Send Feedback
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Beta</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer" id="feedback-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result && result.outcome === 'unavailable' ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto">
              <ServerCog className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Feedback isn’t set up yet</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                This project’s repository is private, so feedback can only be filed by the server.
                The administrator needs to set a <code className="font-mono text-slate-700">GITHUB_TOKEN</code>
                (with “Issues: write”) on the deployment — see <strong>SUPABASE.md → Feedback</strong>.
                Until then, please share this directly with the administrator.
              </p>
            </div>
            <button onClick={onClose} className="mt-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold cursor-pointer">
              Close
            </button>
          </div>
        ) : result ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                {result.outcome === 'created' ? 'Thanks — issue created!' : 'Almost there!'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {result.outcome === 'created'
                  ? 'Your feedback was posted to the project’s GitHub issues.'
                  : 'We opened a pre-filled GitHub issue in a new tab — just review it and click “Submit new issue” to finish. (A GitHub account is required.)'}
              </p>
            </div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
            >
              {result.outcome === 'created' ? 'View the issue' : 'Open the issue again'} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <div>
              <button onClick={onClose} className="mt-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold cursor-pointer">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Found a bug or have an idea? It’s posted to the project’s GitHub issues so it can be tracked and fixed.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    type === t.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="fb-title">Title</label>
              <input
                id="fb-title"
                type="text"
                required
                maxLength={120}
                placeholder="Short summary"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="fb-desc">Details</label>
              <textarea
                id="fb-desc"
                required
                rows={5}
                placeholder="What happened, and what did you expect? Steps to reproduce help a lot."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400 resize-y"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono" htmlFor="fb-email">Your email (optional)</label>
              <input
                id="fb-email"
                type="email"
                placeholder="so we can follow up"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              id="feedback-submit-btn"
            >
              <MessageSquarePlus className="w-4 h-4" />
              {busy ? 'Submitting…' : 'Submit to GitHub'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
