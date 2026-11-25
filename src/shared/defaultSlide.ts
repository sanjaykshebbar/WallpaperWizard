/**
 * ==========================================
 * File: src/shared/defaultSlide.ts
 * Project: AdBoard
 * Purpose:
 * Built-in standby slide shown on the public display when no
 * advertisement is active and the admin has not set a custom
 * default. Kept as an inline SVG data URI so it needs no network
 * and ships with the bundle.
 * ==========================================
 */

const DEFAULT_SLIDE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <g fill="none" stroke="#334155" stroke-width="2" opacity="0.4">
    <circle cx="960" cy="470" r="230"/>
    <circle cx="960" cy="470" r="300"/>
  </g>
  <g transform="translate(960 470)">
    <rect x="-70" y="-70" width="140" height="140" rx="28" fill="#3b82f6"/>
    <text x="0" y="26" font-family="Segoe UI, Arial, sans-serif" font-size="80" font-weight="700"
          fill="#ffffff" text-anchor="middle">A3</text>
  </g>
  <text x="960" y="800" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="600"
        fill="#f1f5f9" text-anchor="middle">AdBoard</text>
  <text x="960" y="870" font-family="Segoe UI, Arial, sans-serif" font-size="30"
        fill="#94a3b8" text-anchor="middle">Digital Signage Display</text>
</svg>`.trim();

export const BUILT_IN_DEFAULT_SLIDE_URL =
  `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_SLIDE_SVG)}`;
