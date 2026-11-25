/**
 * ==========================================
 * File: api/feedback.ts  (Vercel Serverless Function) — optional
 * Project: AdBoard
 * Purpose:
 * Auto-creates a GitHub issue from in-app feedback when deployed on
 * Vercel. Enable it by setting these Environment Variables in Vercel:
 *   GITHUB_TOKEN  — a fine-grained PAT with "Issues: write" on the repo
 *   GITHUB_REPO   — owner/repo (defaults to sanjaykshebbar/Adboard_v4)
 *
 * If GITHUB_TOKEN is not set it returns 501, and the browser falls back to
 * a pre-filled GitHub "new issue" URL — so nothing breaks either way. The
 * token stays server-side and is never shipped to the browser.
 * ==========================================
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'sanjaykshebbar/Adboard_v4';
  if (!token) {
    res.status(501).json({ error: 'Server-side feedback is not configured (no GITHUB_TOKEN).' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { type, title, description, email } = body;
  if (!title || !description) {
    res.status(400).json({ error: 'Title and description are required.' });
    return;
  }

  const typePrefix = type === 'feature' ? '[Feature]' : type === 'feedback' ? '[Feedback]' : '[Bug]';
  const label = type === 'feature' ? 'enhancement' : type === 'feedback' ? 'feedback' : 'bug';
  const issueBody =
    `${String(description).trim()}\n\n---\n- Type: ${type || 'bug'}\n` +
    `${email ? `- Reporter: ${email}\n` : ''}- Submitted from the AdBoard in-app feedback form.`;

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AdBoard-Feedback'
      },
      body: JSON.stringify({ title: `${typePrefix} ${title}`, body: issueBody, labels: [label] })
    });
    if (!ghRes.ok) {
      res.status(502).json({ error: 'Could not create the GitHub issue.' });
      return;
    }
    const issue = await ghRes.json();
    res.status(200).json({ url: issue.html_url });
  } catch {
    res.status(502).json({ error: 'Could not reach GitHub.' });
  }
}
