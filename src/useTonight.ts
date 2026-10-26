import { useMemo } from 'react';
import { useData, type Beer, type UserStats } from './data';

/** De meest recente keer dat het `hour`:00 was, op of vóór `now`. */
export function sessionStartFrom(hour: number, now: Date): Date {
  const s = new Date(now);
  s.setHours(hour, 0, 0, 0);
  if (s > now) s.setDate(s.getDate() - 1);
  return s;
}

export type StartHour = 19 | 20 | 22;

export interface BoardRow {
  uid: string;
  user?: UserStats;
  beers: number;
  cl: number;
  toasts: number;
  last: Date;
}

export interface TonightStats {
  sessionStart: Date;
  startLabel: string;
  beers: Beer[];
  board: BoardRow[];
  max: number;
  totalBeers: number;
  totalCl: number;
  totalToasts: number;
  drinkers: number;
  lastBeer: Date | null;
  perPerson: number;
  perHour: number;
  level: number;
  pace: { label: string; biertjes: number }[];
}

/** Alle live cijfers voor de avondsessie die om `startHour`:00 begon. `null` zolang er geen data is. */
export function useTonight(startHour: StartHour): TonightStats | null {
  const { data, now } = useData();
  return useMemo(() => {
    if (!data) return null;
    const sessionStart = sessionStartFrom(startHour, now);
    const from = sessionStart.getTime();
    const beers = data.beers.filter((b) => b.date && b.date.getTime() >= from); // al nieuwste eerst

    const perUser = new Map<string, BoardRow>();
    let totalCl = 0;
    let totalToasts = 0;
    for (const b of beers) {
      totalCl += b.volume;
      totalToasts += b.toasts;
      const c = perUser.get(b.userId)
        ?? { uid: b.userId, user: data.usersById.get(b.userId), beers: 0, cl: 0, toasts: 0, last: b.date! };
      c.beers++;
      c.cl += b.volume;
      c.toasts += b.toasts;
      if (b.date! > c.last) c.last = b.date!;
      perUser.set(b.userId, c);
    }

    const board = [...perUser.values()].sort((a, b) => b.cl - a.cl || b.beers - a.beers);
    const hoursElapsed = Math.max(0.25, (now.getTime() - from) / 3_600_000);
    const drinkers = perUser.size;
    const target = Math.max(10, drinkers * 6);

    const slots = Math.min(24, Math.floor((now.getTime() - from) / 3_600_000) + 1);
    const pace = Array.from({ length: slots }, (_, i) => {
      const t = new Date(from + i * 3_600_000);
      return { label: `${t.getHours()}u`, biertjes: 0 };
    });
    for (const b of beers) {
      const i = Math.floor((b.date!.getTime() - from) / 3_600_000);
      if (i >= 0 && i < pace.length) pace[i].biertjes++;
    }

    return {
      sessionStart,
      startLabel: sessionStart.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      beers,
      board,
      max: board[0]?.cl ?? 1,
      totalBeers: beers.length,
      totalCl,
      totalToasts,
      drinkers,
      lastBeer: beers[0]?.date ?? null,
      perPerson: drinkers ? beers.length / drinkers : 0,
      perHour: beers.length / hoursElapsed,
      level: Math.min(1, beers.length / target),
      pace,
    };
  }, [data, startHour, now]);
}
