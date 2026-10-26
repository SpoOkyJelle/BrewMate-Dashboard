import type { Beer, Dataset } from './data';
import { addDays, dayKey, fmtShortDate, startOfWeek, weeksBetween } from './utils';

export interface SeriesRow {
  key: string;
  label: string;
  beers: number;
  cl: number;
  signups: number;
  drinkerCount: number;
}

/**
 * Biertjes, centiliters, aanmeldingen en unieke drinkers per dag of per week,
 * van `from` (inclusief) tot `to` (exclusief, middernacht).
 */
export function series(data: Dataset, from: Date, to: Date, unit: 'day' | 'week'): SeriesRow[] {
  const start = unit === 'week' ? startOfWeek(from) : from;
  const rows: (SeriesRow & { drinkers: Set<string> })[] = [];
  for (let d = start; d < to; d = addDays(d, unit === 'week' ? 7 : 1)) {
    rows.push({
      key: dayKey(d),
      label: unit === 'week' ? `wk ${fmtShortDate(d)}` : fmtShortDate(d),
      beers: 0, cl: 0, signups: 0, drinkerCount: 0, drinkers: new Set(),
    });
  }
  const dayIndex = new Map(rows.map((r, i) => [r.key, i]));
  const indexOf = (d: Date) => {
    if (d < from || d >= to) return -1;
    if (unit === 'week') return weeksBetween(start, startOfWeek(d));
    return dayIndex.get(dayKey(d)) ?? -1;
  };

  for (const b of data.beers) {
    if (!b.date) continue;
    const r = rows[indexOf(b.date)];
    if (!r) continue;
    r.beers++;
    r.cl += b.volume;
    r.drinkers.add(b.userId);
  }
  for (const u of data.users) {
    if (!u.createdAt) continue;
    const r = rows[indexOf(u.createdAt)];
    if (r) r.signups++;
  }
  return rows.map(({ drinkers, ...r }) => ({ ...r, drinkerCount: drinkers.size }));
}

export function uniqueDrinkers(beers: Beer[], from: Date, to: Date): number {
  const s = new Set<string>();
  for (const b of beers) if (b.date && b.date >= from && b.date < to) s.add(b.userId);
  return s.size;
}

/** Het oudste biertje met een datum (biertjes staan nieuwste eerst). */
export function firstBeerDate(beers: Beer[]): Date | null {
  for (let i = beers.length - 1; i >= 0; i--) if (beers[i].date) return beers[i].date;
  return null;
}

export interface FunnelStep {
  label: string;
  value: number;
}

/** Van aanmelding tot vaste drinker die nog actief is. */
export function funnel(data: Dataset, today: Date): FunnelStep[] {
  const d30 = addDays(today, -29);
  const first = data.users.filter((u) => u.beerCount > 0);
  const regular = first.filter((u) => u.beerCount >= 10);
  const retained = regular.filter((u) => u.lastBeer && u.lastBeer >= d30);
  return [
    { label: 'Aangemeld', value: data.users.length },
    { label: 'Eerste biertje gelogd', value: first.length },
    { label: '10 of meer biertjes', value: regular.length },
    { label: 'Nog actief (30 dagen)', value: retained.length },
  ];
}

/** Top `n` drinkers op aantal biertjes in de gegeven lijst. */
export function topDrinkers(data: Dataset, beers: Beer[], n = 8) {
  const counts = new Map<string, { beers: number; cl: number }>();
  for (const b of beers) {
    const c = counts.get(b.userId) ?? { beers: 0, cl: 0 };
    c.beers++;
    c.cl += b.volume;
    counts.set(b.userId, c);
  }
  return [...counts.entries()]
    .map(([uid, c]) => ({ user: data.usersById.get(uid)!, uid, ...c }))
    .filter((r) => r.user)
    .sort((a, b) => b.beers - a.beers || b.cl - a.cl)
    .slice(0, n);
}
