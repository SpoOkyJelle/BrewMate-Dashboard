import type { Dataset } from './data';
import { DAY, startOfDay } from './utils';

export type Unit = 'week' | 'month';
export const PERIODS = 12;

export interface Cohort {
  key: string;
  label: string;
  size: number;
  /** Per periode: aandeel actief (0–1), of null als die periode nog niet voorbij is. */
  cells: (number | null)[];
  /** Per periode: aantal actieve gebruikers. */
  counts: (number | null)[];
  /** Per periode: aantal gebruikers voor wie die periode al voorbij is. */
  eligible: number[];
}

function periodLength(unit: Unit) {
  return unit === 'week' ? 7 * DAY : 30 * DAY;
}

export function buildCohorts(data: Dataset, unit: Unit, now: Date): Cohort[] {
  const len = periodLength(unit);
  // Biertjes per gebruiker als tijdstempels.
  const beerTimes = new Map<string, number[]>();
  for (const b of data.beers) {
    if (!b.date) continue;
    const list = beerTimes.get(b.userId);
    if (list) list.push(b.date.getTime());
    else beerTimes.set(b.userId, [b.date.getTime()]);
  }

  const groups = new Map<string, { label: string; start: Date; users: { start: number; times: number[] }[] }>();
  for (const u of data.users) {
    if (!u.createdAt) continue;
    const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, '0')}`;
    const g = groups.get(key) ?? {
      label: u.createdAt.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }),
      start: new Date(u.createdAt.getFullYear(), u.createdAt.getMonth(), 1),
      users: [],
    };
    g.users.push({ start: startOfDay(u.createdAt).getTime(), times: beerTimes.get(u.uid) ?? [] });
    groups.set(key, g);
  }

  const nowMs = now.getTime();
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, g]) => {
      const counts: (number | null)[] = [];
      const eligible: number[] = [];
      for (let p = 0; p < PERIODS; p++) {
        // Alleen gebruikers voor wie deze periode al helemaal voorbij is, tellen mee.
        const done = g.users.filter((u) => u.start + (p + 1) * len <= nowMs);
        eligible.push(done.length);
        counts.push(
          done.length
            ? done.filter((u) => u.times.some((t) => t >= u.start + p * len && t < u.start + (p + 1) * len)).length
            : null,
        );
      }
      return {
        key,
        label: g.label,
        size: g.users.length,
        counts,
        eligible,
        cells: counts.map((c, p) => (c === null ? null : c / eligible[p])),
      };
    });
}
