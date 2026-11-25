/**
 * ==========================================
 * File: src/shared/describeUserAgent.ts
 * Project: AdBoard
 * Purpose:
 * Turns a raw browser user-agent string into a short, human-readable
 * device descriptor like "Chrome · Windows" for the viewers list.
 * (A browser cannot expose the machine's real hostname; on the
 * self-hosted backend the server supplements this with reverse DNS.)
 * ==========================================
 */

export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const s = ua.toLowerCase();

  let browser = 'Browser';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('opr/') || s.includes('opera')) browser = 'Opera';
  else if (s.includes('samsungbrowser')) browser = 'Samsung Internet';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('chrome/') || s.includes('crios/')) browser = 'Chrome';
  else if (s.includes('safari/')) browser = 'Safari';

  let os = 'Unknown OS';
  if (s.includes('windows nt')) os = 'Windows';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) os = 'iOS';
  else if (s.includes('mac os x') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('cros')) os = 'ChromeOS';
  else if (s.includes('linux')) os = 'Linux';
  else if (s.includes('tizen')) os = 'Tizen TV';
  else if (s.includes('webos')) os = 'webOS TV';

  return `${browser} · ${os}`;
}
