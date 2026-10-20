import { useEffect, useState } from 'react';

export const DAY = 86_400_000;

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

/** Monday of the week containing d. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7;
  return addDays(x, -offset);
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const nf = new Intl.NumberFormat('en-US');
export const fmtNum = (n: number) => nf.format(n);

export function fmtLiters(cl: number): string {
  const l = cl / 100;
  return `${l >= 100 ? Math.round(l).toLocaleString('en-US') : l.toFixed(1)} L`;
}

export function fmtVolume(cl: number): string {
  return cl >= 100 ? `${cl / 100} L` : `${cl} cl`;
}

export function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(d: Date | null, now = new Date()): string {
  if (!d) return '—';
  const diff = now.getTime() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(diff / DAY);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} mo ago`;
  return `${(days / 365).toFixed(1)} y ago`;
}

export function displayName(u: { username: string; email: string; uid: string }): string {
  return u.username || u.email || u.uid.slice(0, 8);
}

/** Reads the chart colors from CSS variables so charts follow light/dark mode. */
function readChartColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    accent: v('--accent'),
    accent2: v('--accent-2'),
    grid: v('--chart-grid'),
    axis: v('--text-muted'),
    surface: v('--surface'),
    text: v('--text'),
    border: v('--border'),
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
