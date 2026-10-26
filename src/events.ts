import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

/* ---------------- Types (mirror the app's src/types/guildEvent.ts) ---------------- */

export type EventMetric = 'volume' | 'count';
export type EventScope = 'guild' | 'solo';
export type EventStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export interface GuildStanding {
  guildId: string;
  name: string;
  tag: string;
  color: string;
  value: number;
  contributors: number;
  topContributor: string;
}

export interface SoloStanding {
  uid: string;
  username: string;
  guildId: string;
  guildName: string;
  value: number;
}

export interface GuildEventRow {
  id: string;
  title: string;
  description: string;
  metric: EventMetric;
  scope: EventScope;
  status: EventStatus;
  startAt: Date | null;
  endAt: Date | null;
  notifyOnStart: boolean;
  notifyOnEnd: boolean;
  startNotifiedAt: Date | null;
  endNotifiedAt: Date | null;
  lastComputedAt: Date | null;
  guildStandings: GuildStanding[];
  soloStandings: SoloStanding[];
  createdByEmail: string;
}

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null;

export const METRIC_LABEL: Record<EventMetric, string> = {
  volume: 'Volume (cl)',
  count: 'Aantal biertjes',
};

export const SCOPE_LABEL: Record<EventScope, string> = {
  guild: 'Guilds onderling',
  solo: 'Leden (solo)',
};

export const STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: 'Gepland',
  active: 'Actief',
  ended: 'Afgelopen',
  cancelled: 'Geannuleerd',
};

/** Human label for a metric total, e.g. "1.250 cl" or "42 biertjes". */
export function metricValue(metric: EventMetric, value: number): string {
  if (metric === 'volume') return `${Math.round(value).toLocaleString('nl-NL')} cl`;
  return `${value.toLocaleString('nl-NL')} ${value === 1 ? 'biertje' : 'biertjes'}`;
}

/** Derive the live status: a doc can still say "scheduled" between cron runs. */
export function liveStatus(ev: GuildEventRow, now = new Date()): EventStatus {
  if (ev.status === 'cancelled') return 'cancelled';
  if (ev.endAt && ev.endAt <= now) return 'ended';
  if (ev.startAt && ev.startAt <= now) return 'active';
  return 'scheduled';
}

/* ---------------- Hook ---------------- */

/** All guild events, live, newest start first. */
export function useGuildEvents() {
  const [events, setEvents] = useState<GuildEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'events'), orderBy('startAt', 'desc')),
      (snap) => {
        setError(null);
        setEvents(snap.docs.map((d) => {
          const e = d.data();
          return {
            id: d.id,
            title: String(e.title ?? ''),
            description: String(e.description ?? ''),
            metric: (e.metric === 'count' ? 'count' : 'volume') as EventMetric,
            scope: (e.scope === 'solo' ? 'solo' : 'guild') as EventScope,
            status: (e.status ?? 'scheduled') as EventStatus,
            startAt: toDate(e.startAt),
            endAt: toDate(e.endAt),
            notifyOnStart: e.notifyOnStart !== false,
            notifyOnEnd: e.notifyOnEnd !== false,
            startNotifiedAt: toDate(e.startNotifiedAt),
            endNotifiedAt: toDate(e.endNotifiedAt),
            lastComputedAt: toDate(e.lastComputedAt),
            guildStandings: Array.isArray(e.guildStandings) ? (e.guildStandings as GuildStanding[]) : [],
            soloStandings: Array.isArray(e.soloStandings) ? (e.soloStandings as SoloStanding[]) : [],
            createdByEmail: String(e.createdByEmail ?? ''),
          } as GuildEventRow;
        }));
      },
      (err) => setError(err.message),
    );
  }, []);

  return { events, error };
}
