/**
 * ==========================================
 * File: src/components/InfoTip.tsx
 * Project: AdBoard
 * Purpose:
 * Small "i" affordance that reveals a plain-English explanation
 * only while the cursor hovers over it.
 * ==========================================
 */

import React from 'react';
import { Info } from 'lucide-react';

export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex align-middle group/tip ml-1">
      <Info className="w-3 h-3 text-slate-400 hover:text-blue-600 cursor-help" aria-label={text} />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block w-56 bg-slate-900 text-slate-100 text-[10px] font-sans font-medium normal-case tracking-normal leading-relaxed rounded-lg px-3 py-2 shadow-xl z-50"
        role="tooltip"
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}
