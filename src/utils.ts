import { useEffect, useState } from 'react';

export const DAY = 86_400_000;
const LOCALE = 'nl-NL';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Maandag van de week waarin d valt. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aantal hele weken tussen twee maandagen (robuust tegen zomertijd). */
export const weeksBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (7 * DAY));

const nf = new Intl.NumberFormat(LOCALE);
export const fmtNum = (n: number) => nf.format(n);

export function fmtLiters(cl: number): string {
  const l = cl / 100;
  return `${l >= 100 ? fmtNum(Math.round(l)) : l.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} L`;
}

export function fmtVolume(cl: number): string {
  return cl >= 100 ? `${(cl / 100).toLocaleString(LOCALE)} L` : `${cl} cl`;
}

export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

export function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(d: Date | null, now = new Date()): string {
  if (!d) return '—';
  const diff = Math.max(0, now.getTime() - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'gisteren';
  if (days < 30) return `${days} dagen geleden`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} mnd geleden`;
  return `${(days / 365).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} jaar geleden`;
}

export function fmtDuration(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} uur`;
  return `${Math.round(h / 24)} dagen`;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function displayName(u: { username: string; email: string; uid: string }): string {
  return u.username || u.email.split('@')[0] || u.uid.slice(0, 8);
}

/** Leest grafiekkleuren uit CSS-variabelen, zodat grafieken licht/donker volgen. */
function readChartColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    accent: v('--amber'),
    accent2: v('--hop'),
    grid: v('--grid'),
    axis: v('--muted'),
    surface: v('--surface-2'),
    text: v('--text'),
    border: v('--line'),
  };
}

export function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setColors(readChartColors());
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return colors;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
