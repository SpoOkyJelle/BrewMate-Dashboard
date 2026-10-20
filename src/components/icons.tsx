import type { SVGProps } from 'react';

const base = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

type P = SVGProps<SVGSVGElement>;

export const IconGlass = (p: P) => (
  <svg {...base} {...p}><path d="M6 7h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M6 7a2.5 2.5 0 0 1 3-2.4 3 3 0 0 1 5 0A2.5 2.5 0 0 1 16 7" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base} {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 14a6.5 6.5 0 0 1 3 6" /></svg>
);
export const IconUserPlus = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6M16 11h6" /></svg>
);
export const IconCheers = (p: P) => (
  <svg {...base} {...p}><path d="m4 9 3.5-5 4 2.5-2 5.5a2.5 2.5 0 0 1-3.6 1.3L4.8 12.6A2.5 2.5 0 0 1 4 9z" /><path d="m20 9-3.5-5-4 2.5 2 5.5a2.5 2.5 0 0 0 3.6 1.3l1.1-.7A2.5 2.5 0 0 0 20 9z" /><path d="M7.5 14 6 20M16.5 14l1.5 6M4 20h4M16 20h4" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></svg>
);
export const IconArrowLeft = (p: P) => (
  <svg {...base} {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);
