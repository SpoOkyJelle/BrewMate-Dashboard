import { useMemo, useSyncExternalStore } from 'react';
import { addDays, DAY, dayKey, fmtDate } from './utils';

/**
 * Eén periode voor het hele dashboard. Overzicht en Kaart rekenen ermee, en de keuze blijft
 * staan als je wisselt van pagina (en wordt in deze browser onthouden).
 */
export type PresetPeriod = '7' | '30' | '90' | '365' | 'all';
export type PeriodValue = PresetPeriod | { from: string; to: string }; // custom: 'YYYY-MM-DD', beide inclusief

export const PRESETS: { value: PresetPeriod; label: string; short: string }[] = [
  { value: '7', label: '7 dagen', short: '7d' },
  { value: '30', label: '30 dagen', short: '30d' },
  { value: '90', label: '90 dagen', short: '90d' },
  { value: '365', label: '1 jaar', short: '1j' },
  { value: 'all', label: 'Altijd', short: 'Alles' },
];

const KEY = 'period';
const listeners = new Set<() => void>();

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function read(): PeriodValue {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      if (PRESETS.some((p) => p.value === v)) return v as PresetPeriod;
      if (v && typeof v === 'object' && isDateStr((v as { from?: unknown }).from) && isDateStr((v as { to?: unknown }).to)) {
        return v as { from: string; to: string };
      }
    }
  } catch {
    // Opslag geblokkeerd of kapot: standaard gebruiken.
  }
  return '30';
}

let current: PeriodValue = read();

export function setPeriod(next: PeriodValue) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Alleen voor deze sessie dan.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface ResolvedPeriod {
  value: PeriodValue;
  /** Begin (inclusief), of null voor "altijd". */
  from: Date | null;
  /** Einde (exclusief): middernacht na de laatste dag. */
  to: Date;
  /** Leesbare omschrijving, bijv. "laatste 30 dagen". */
  label: string;
  /** Sleutel die verandert als de periode verandert (handig voor kaarten/animaties). */
  key: string;
}

/** Zet een keuze om naar echte datums, gerekend vanaf `today` (middernacht). */
export function resolvePeriod(value: PeriodValue, today: Date): ResolvedPeriod {
  const tomorrow = addDays(today, 1);
  if (typeof value === 'object') {
    let from = parseDay(value.from);
    let to = addDays(parseDay(value.to), 1);
    if (to <= from) [from, to] = [addDays(to, -1), addDays(from, 1)];
    return {
      value, from, to,
      label: `${fmtDate(from)} t/m ${fmtDate(addDays(to, -1))}`,
      key: `${value.from}_${value.to}`,
    };
  }
  if (value === 'all') return { value, from: null, to: tomorrow, label: 'altijd', key: 'all' };
  const days = Number(value);
  return {
    value,
    from: addDays(today, -(days - 1)),
    to: tomorrow,
    label: days === 365 ? 'afgelopen jaar' : `laatste ${days} dagen`,
    key: `${value}|${dayKey(today)}`,
  };
}

/** Of een datum in de periode valt. Biertjes zonder datum vallen alleen onder "altijd". */
export function inPeriod(d: Date | null, p: ResolvedPeriod): boolean {
  if (!d) return p.from === null;
  return (p.from === null || d >= p.from) && d < p.to;
}

/** Aantal dagen in de periode; voor "altijd" vanaf `first`. */
export function periodDays(p: ResolvedPeriod, first: Date | null): number {
  const from = p.from ?? first ?? p.to;
  return Math.max(1, Math.round((p.to.getTime() - from.getTime()) / DAY));
}

export function usePeriodValue(): PeriodValue {
  return useSyncExternalStore(subscribe, () => current);
}

export function usePeriod(today: Date): ResolvedPeriod {
  const value = usePeriodValue();
  return useMemo(() => resolvePeriod(value, today), [value, today]);
}
