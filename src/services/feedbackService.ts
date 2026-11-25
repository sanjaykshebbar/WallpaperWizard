/**
 * ==========================================
 * File: src/services/feedbackService.ts
 * Project: AdBoard
 * Purpose:
 * Turns user feedback into a GitHub issue. Two paths:
 *   1. If a backend feedback endpoint is available AND configured with a
 *      GitHub token (self-hosted Express, or a Vercel /api function), it
 *      creates the issue directly and returns its URL.
 *   2. Otherwise it builds a pre-filled "New issue" GitHub URL for the user
 *      to submit themselves. This needs no secret token in the browser
 *      (a token bundled into client JS would be extractable), so it is the
 *      safe, universal default.
 * ==========================================
 */

export type FeedbackType = 'bug' | 'feature' | 'feedback';

export interface FeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  email?: string;
}

export type FeedbackOutcome = 'created' | 'prefill' | 'unavailable';

export interface FeedbackResult {
  outcome: FeedbackOutcome;
  /** created issue URL (created), or the pre-fill URL to open (prefill); empty for unavailable */
  url: string;
}

// owner/repo — override with VITE_GITHUB_REPO for a fork
const GITHUB_REPO = (import.meta as any).env?.VITE_GITHUB_REPO || 'sanjaykshebbar/Adboard_v4';

// Private repos cannot accept issues from non-collaborators via the pre-fill URL,
// so when the server-side auto-create isn't available we must NOT open a broken
// GitHub page. Defaults to true for this (private) repo; set to 'false' for a
// public fork to re-enable the pre-fill fallback.
const REPO_IS_PRIVATE = ((import.meta as any).env?.VITE_GITHUB_REPO_PRIVATE ?? 'true') !== 'false';

const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: 'bug',
  feature: 'enhancement',
  feedback: 'feedback'
};

const TYPE_PREFIX: Record<FeedbackType, string> = {
  bug: '[Bug]',
  feature: '[Feature]',
  feedback: '[Feedback]'
};

function buildBody(input: FeedbackInput): string {
  const lines = [
    input.description.trim(),
    '',
    '---',
    `- Type: ${input.type}`,
    input.email ? `- Reporter: ${input.email}` : '',
    `- Page: ${typeof window !== 'undefined' ? window.location.href : ''}`,
    `- User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    '',
    '_Submitted from the AdBoard in-app feedback form._'
  ];
  return lines.filter(l => l !== null && l !== undefined).join('\n');
}

/** Pre-filled GitHub "new issue" URL — always available, needs no token. */
export function buildPrefillUrl(input: FeedbackInput): string {
  const title = `${TYPE_PREFIX[input.type]} ${input.title.trim()}`;
  const params = new URLSearchParams({
    title,
    body: buildBody(input),
    labels: TYPE_LABEL[input.type]
  });
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

export const FeedbackService = {
  isPrivateRepo(): boolean {
    return REPO_IS_PRIVATE;
  },

  /**
   * Submits feedback. Tries the backend auto-create endpoint first (the only
   * way to file into a PRIVATE repo without the submitter having repo access).
   * On failure it falls back to the pre-fill URL only for PUBLIC repos; for a
   * private repo it reports 'unavailable' rather than opening a page that would
   * 404 for anyone who is not a signed-in collaborator.
   */
  async submit(input: FeedbackInput): Promise<FeedbackResult> {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) return { outcome: 'created', url: data.url };
      }
      // 404/501/etc → endpoint absent or not configured; fall through
    } catch {
      // network error / static host with no /api → fall through
    }
    if (REPO_IS_PRIVATE) {
      return { outcome: 'unavailable', url: '' };
    }
    return { outcome: 'prefill', url: buildPrefillUrl(input) };
  }
};
