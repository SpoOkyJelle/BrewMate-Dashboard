import type { Beer, Dataset, UserStats } from '../data';
import { dayKey, DAY, startOfDay } from '../utils';
import { ACHIEVEMENTS, type AchievementDef, type AchievementStats } from './definitions';
import { ICONS } from './icons';

export { ACHIEVEMENTS };
export type { AchievementDef };

export type AchievementState = 'unlocked' | 'locked' | 'unknown';

export interface UserAchievements {
  byId: Map<string, AchievementState>;
  unlocked: number;
  /** Aantal achievements dat we wél kunnen bepalen. */
  known: number;
}

/** Achievements die afhangen van data die niet in Firestore staat. */
export const UNKNOWN_REASON: Record<string, string> = {
  supporter: 'Het premium-abonnement loopt via RevenueCat en staat niet in Firestore.',
  weekend_warrior: 'De app bepaalt deze via het premium-abonnement, en dat staat niet in Firestore.',
  share_profile: 'Hoe vaak iemand het profiel deelt, wordt niet opgeslagen.',
  share_five: 'Hoe vaak iemand het profiel deelt, wordt niet opgeslagen.',
  birthday_beer: 'De geboortedatum wordt niet opgeslagen.',
  streak_comeback: 'De vorige reeks wordt niet opgeslagen.',
  streak_broken: 'De vorige reeks wordt niet opgeslagen.',
};

const META = new Set(['achievement_hunter', 'completionist']);

export const achievementIcon = (def: AchievementDef) => ICONS[def.icon] ?? ICONS['trophy-outline'];

/** Bouwt dezelfde invoer als de app, maar dan uit de data die het dashboard heeft. */
function statsFor(user: UserStats, beers: Beer[]): AchievementStats {
  // `beers` is nieuwste eerst.
  const days = new Set<string>();
  const sizes = new Set<number>();
  for (const b of beers) {
    sizes.add(b.volume);
    if (b.date) days.add(dayKey(b.date));
  }
  const dated = beers.filter((b) => b.date);
  const last = dated[0]?.date ?? null;
  const prev = dated.find((b) => startOfDay(b.date!) < startOfDay(last ?? new Date()))?.date ?? null;
  return {
    totalBeers: beers.length,
    totalDays: days.size,
    totalVolumeCl: user.totalCl,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    createdAt: user.createdAt,
    isPremium: false,
    lastBeerTime: last,
    friendCount: user.friendIds.length,
    profileShareCount: 0,
    hasProfilePicture: !!user.photoUrl,
    hasProfileBanner: !!user.bannerUrl,
    birthDate: null,
    previousStreak: 0,
    // Aantal dagen stilte vóór het laatste biertje.
    daysSinceLastBeer: last && prev ? Math.round((startOfDay(last).getTime() - startOfDay(prev).getTime()) / DAY) : 0,
    loggedSizes: [...sizes],
    unlockedAchievementCount: 0,
  };
}

function check(def: AchievementDef, stats: AchievementStats): boolean {
  try {
    return !!def.check(stats);
  } catch {
    return false;
  }
}

function evaluate(user: UserStats, beers: Beer[]): UserAchievements {
  const stats = statsFor(user, beers);
  const byId = new Map<string, AchievementState>();
  let unlocked = 0;
  for (const def of ACHIEVEMENTS) {
    if (META.has(def.id)) continue;
    if (UNKNOWN_REASON[def.id]) {
      byId.set(def.id, 'unknown');
      continue;
    }
    const ok = check(def, stats);
    byId.set(def.id, ok ? 'unlocked' : 'locked');
    if (ok) unlocked++;
  }
  // Meta-achievements tellen het aantal andere behaalde achievements.
  stats.unlockedAchievementCount = unlocked;
  for (const def of ACHIEVEMENTS) {
    if (!META.has(def.id)) continue;
    const ok = check(def, stats);
    byId.set(def.id, ok ? 'unlocked' : 'locked');
    if (ok) unlocked++;
  }
  return { byId, unlocked, known: ACHIEVEMENTS.length - Object.keys(UNKNOWN_REASON).length };
}

const cache = new WeakMap<Dataset, Map<string, UserAchievements>>();

/** Achievements van alle gebruikers; één keer berekend per dataset-versie. */
export function achievementsFor(data: Dataset): Map<string, UserAchievements> {
  let result = cache.get(data);
  if (result) return result;
  const beersByUser = new Map<string, Beer[]>();
  for (const b of data.beers) {
    const list = beersByUser.get(b.userId);
    if (list) list.push(b);
    else beersByUser.set(b.userId, [b]);
  }
  result = new Map(data.users.map((u) => [u.uid, evaluate(u, beersByUser.get(u.uid) ?? [])]));
  cache.set(data, result);
  return result;
}
