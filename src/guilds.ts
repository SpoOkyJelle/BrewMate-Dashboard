import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';

/* ---------------- Leagues (mirrors the app's src/types/league.ts) ---------------- */

export interface League {
  tier: number;
  name: string;
  subtitle: string;
  color: string;
}

export const LEAGUES: League[] = [
  { tier: 1, name: 'Novice Brewers',   subtitle: 'Waar elke nieuwe guild begint', color: '#9CA3AF' },
  { tier: 2, name: 'Tavern Keepers',   subtitle: 'Tappers die hun ritme vinden', color: '#A16207' },
  { tier: 3, name: 'Hop Brothers',     subtitle: 'De levendige, actieve crews', color: '#10B981' },
  { tier: 4, name: 'Master Alchemists', subtitle: 'De serieuze kenners', color: '#3B82F6' },
  { tier: 5, name: 'Lords of the Cask', subtitle: 'De zwaargewichten', color: '#8B5CF6' },
  { tier: 6, name: 'Master Brewers',   subtitle: 'Top 1% — de absolute elite', color: '#F59E0B' },
];

export function leagueForTier(tier: number | undefined | null): League {
  return LEAGUES.find((l) => l.tier === tier) ?? LEAGUES[0];
}

export function currentSeasonId(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function seasonLabel(seasonId: string): string {
  const [y, m] = seasonId.split('-').map(Number);
  if (!y || !m) return seasonId;
  return new Date(y, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
}

/* ---------------- Types ---------------- */

export interface GuildRow {
  id: string;
  name: string;
  tag: string;
  color: string;
  icon: string;
  description: string;
  ownerId: string;
  memberCount: number;
  leagueTier: number;
  seasonId: string;
  seasonPoints: number;
  /** Points that count for the *current* season (a stale season reads as 0). */
  effectivePoints: number;
}

export interface GuildMemberRow {
  uid: string;
  username: string;
  profilePictureUrl: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date | null;
}

export interface GuildScoreRow {
  uid: string;
  username: string;
  score: number;
  activeDays: number;
  totalCl: number;
  bestRhythm: number;
}

export interface GuildHistoryRow {
  season: string;
  tier: number;
  newTier: number;
  finalPoints: number;
  rankInTier: number;
  tierSize: number;
  outcome: 'promoted' | 'relegated' | 'stayed';
}

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null;

/* ---------------- Hooks ---------------- */

/** All guilds, live, ranked by current-season points. */
export function useGuilds() {
  const [guilds, setGuilds] = useState<GuildRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const season = currentSeasonId();
    return onSnapshot(
      collection(db, 'guilds'),
      (snap) => {
        setError(null);
        const rows = snap.docs.map((d) => {
          const g = d.data();
          const seasonId = String(g.seasonId ?? '');
          const seasonPoints = Number(g.seasonPoints) || 0;
          return {
            id: d.id,
            name: String(g.name ?? ''),
            tag: String(g.tag ?? ''),
            color: String(g.color ?? '#9CA3AF'),
            icon: String(g.icon ?? ''),
            description: String(g.description ?? ''),
            ownerId: String(g.ownerId ?? ''),
            memberCount: Number(g.memberCount) || 0,
            leagueTier: Number(g.leagueTier) || 1,
            seasonId,
            seasonPoints,
            effectivePoints: seasonId === season ? seasonPoints : 0,
          } as GuildRow;
        });
        rows.sort((a, b) => b.effectivePoints - a.effectivePoints || b.memberCount - a.memberCount);
        setGuilds(rows);
      },
      (err) => setError(err.message),
    );
  }, []);

  return { guilds, error };
}

/** One guild's member roster, live. */
export function useGuildMembers(guildId: string | undefined) {
  const [members, setMembers] = useState<GuildMemberRow[] | null>(null);
  useEffect(() => {
    if (!guildId) return;
    return onSnapshot(
      query(collection(db, 'guilds', guildId, 'members'), orderBy('joinedAt', 'asc')),
      (snap) => setMembers(snap.docs.map((d) => {
        const m = d.data();
        return {
          uid: String(m.uid ?? d.id),
          username: String(m.username ?? ''),
          profilePictureUrl: String(m.profilePictureUrl ?? ''),
          role: (m.role ?? 'member') as GuildMemberRow['role'],
          joinedAt: toDate(m.joinedAt),
        };
      })),
      () => setMembers([]),
    );
  }, [guildId]);
  return members;
}

/** One guild's per-member scores for a season, live. */
export function useGuildScores(guildId: string | undefined, seasonId: string) {
  const [scores, setScores] = useState<GuildScoreRow[] | null>(null);
  useEffect(() => {
    if (!guildId) return;
    return onSnapshot(
      query(collection(db, 'guilds', guildId, 'seasonScores'), where('seasonId', '==', seasonId)),
      (snap) => {
        // One row per member: a per-season doc (id contains '__') wins over a
        // stray legacy doc keyed by uid, so totals never double-count.
        const byUid = new Map<string, GuildScoreRow & { id: string }>();
        for (const d of snap.docs) {
          const x = d.data();
          const uid = String(x.uid ?? d.id);
          const row = {
            id: d.id, uid,
            username: String(x.username ?? ''),
            score: Number(x.score) || 0,
            activeDays: Number(x.activeDays) || 0,
            totalCl: Number(x.totalCl) || 0,
            bestRhythm: Number(x.bestRhythm) || 0,
          };
          const existing = byUid.get(uid);
          if (!existing || (row.id.includes('__') && !existing.id.includes('__'))) byUid.set(uid, row);
        }
        setScores([...byUid.values()].map(({ id: _id, ...rest }) => rest));
      },
      () => setScores([]),
    );
  }, [guildId, seasonId]);
  return scores;
}

/** One guild's season history (promotions/relegations), newest first. */
export function useGuildHistory(guildId: string | undefined) {
  const [history, setHistory] = useState<GuildHistoryRow[] | null>(null);
  useEffect(() => {
    if (!guildId) return;
    return onSnapshot(
      collection(db, 'guilds', guildId, 'history'),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const h = d.data();
          return {
            season: String(h.season ?? d.id),
            tier: Number(h.tier) || 1,
            newTier: Number(h.newTier) || 1,
            finalPoints: Number(h.finalPoints) || 0,
            rankInTier: Number(h.rankInTier) || 0,
            tierSize: Number(h.tierSize) || 0,
            outcome: (h.outcome ?? 'stayed') as GuildHistoryRow['outcome'],
          };
        });
        rows.sort((a, b) => b.season.localeCompare(a.season));
        setHistory(rows);
      },
      () => setHistory([]),
    );
  }, [guildId]);
  return history;
}
