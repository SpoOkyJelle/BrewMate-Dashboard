import type { Beer, Dataset, UserStats } from './data';

/** Grenzen voor wat we verdacht vinden. */
export const QUALITY_LIMITS = {
  /** Zoveel biertjes of meer binnen `burstWindowMs` is verdacht. */
  burstCount: 10,
  burstWindowMs: 60 * 60_000,
  /** Twee dezelfde biertjes binnen zoveel tijd zijn waarschijnlijk een dubbele tik. */
  duplicateMs: 10_000,
  /** Meer dan dit per biertje (in cl) is onrealistisch. */
  maxCl: 200,
  /** Speling voor klokken die net iets voorlopen. */
  futureSlackMs: 10 * 60_000,
};

export interface Burst {
  uid: string;
  count: number;
  from: Date;
  to: Date;
  beerIds: string[];
}

export interface QualityReport {
  /** Biertjes van een gebruiker die niet (meer) bestaat. */
  orphanBeers: Beer[];
  /** Biertjes met een tijdstip in de toekomst. */
  futureBeers: Beer[];
  /** Biertjes zonder tijdstip. */
  undatedBeers: Beer[];
  /** Biertjes met een onmogelijke hoeveelheid. */
  oddVolumes: Beer[];
  /** Waarschijnlijk per ongeluk twee keer gelogd (de tweede van het paar). */
  duplicates: Beer[];
  /** Per gebruiker het drukste uur, als dat boven de grens ligt. */
  bursts: Burst[];
  usersWithoutName: UserStats[];
  usersWithoutCreatedAt: UserStats[];
  /** Totaal aantal gevonden problemen. */
  total: number;
}

export function checkQuality(data: Dataset, now: Date, limits = QUALITY_LIMITS): QualityReport {
  const orphanBeers: Beer[] = [];
  const futureBeers: Beer[] = [];
  const undatedBeers: Beer[] = [];
  const oddVolumes: Beer[] = [];
  const byUser = new Map<string, Beer[]>();
  const futureLimit = now.getTime() + limits.futureSlackMs;

  for (const b of data.beers) {
    if (!data.usersById.has(b.userId)) orphanBeers.push(b);
    if (!b.date) undatedBeers.push(b);
    else if (b.date.getTime() > futureLimit) futureBeers.push(b);
    if (!(b.volume > 0) || b.volume > limits.maxCl) oddVolumes.push(b);
    if (b.date) {
      const list = byUser.get(b.userId);
      if (list) list.push(b);
      else byUser.set(b.userId, [b]);
    }
  }

  const duplicates: Beer[] = [];
  const bursts: Burst[] = [];
  for (const [uid, beers] of byUser) {
    const sorted = [...beers].sort((a, b) => a.date!.getTime() - b.date!.getTime());

    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a.volume === b.volume && b.date!.getTime() - a.date!.getTime() < limits.duplicateMs) duplicates.push(b);
    }

    // Schuivend venster: het drukste uur van deze gebruiker.
    let best = { count: 0, start: 0, end: 0 };
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      while (sorted[end].date!.getTime() - sorted[start].date!.getTime() >= limits.burstWindowMs) start++;
      const count = end - start + 1;
      if (count > best.count) best = { count, start, end };
    }
    if (best.count >= limits.burstCount) {
      const slice = sorted.slice(best.start, best.end + 1);
      bursts.push({
        uid,
        count: best.count,
        from: slice[0].date!,
        to: slice[slice.length - 1].date!,
        beerIds: slice.map((b) => b.id),
      });
    }
  }
  bursts.sort((a, b) => b.count - a.count);
  duplicates.sort((a, b) => b.date!.getTime() - a.date!.getTime());

  const usersWithoutName = data.users.filter((u) => !u.username.trim());
  const usersWithoutCreatedAt = data.users.filter((u) => !u.createdAt);

  return {
    orphanBeers, futureBeers, undatedBeers, oddVolumes, duplicates, bursts, usersWithoutName, usersWithoutCreatedAt,
    total:
      orphanBeers.length + futureBeers.length + undatedBeers.length + oddVolumes.length + duplicates.length
      + bursts.length + usersWithoutName.length + usersWithoutCreatedAt.length,
  };
}
