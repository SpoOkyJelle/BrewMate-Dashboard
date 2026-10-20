import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { pruneImageCache } from './imageCache';

export interface Beer {
  id: string;
  userId: string;
  volume: number; // centiliter
  date: Date | null;
  toasts: number;
  hasLocation: boolean;
  /** GPS-locatie bij het loggen, als de gebruiker locatie deelt (± 100 m nauwkeurig). */
  lat: number | null;
  lng: number | null;
}

export interface UserStats {
  uid: string;
  username: string;
  email: string;
  photoUrl: string;
  bannerUrl: string;
  createdAt: Date | null;
  lastLogin: Date | null;
  currentStreak: number;
  longestStreak: number;
  loginStreak: number;
  showcasedAchievements: string[];
  hasPushToken: boolean;
  notifyPushEnabled: boolean | null;
  notifyFriendRequests: boolean | null;
  notifyNearbyCheckin: boolean | null;
  hasSeenOnboarding: boolean | null;
  // Afgeleid uit beers / friends
  beerCount: number;
  totalCl: number;
  toastsReceived: number;
  firstBeer: Date | null;
  lastBeer: Date | null;
  friendIds: string[];
}

export interface Dataset {
  users: UserStats[];
  usersById: Map<string, UserStats>;
  beers: Beer[]; // nieuwste eerst
  friendshipCount: number;
  pendingRequests: number;
}

/** Iets dat net live binnenkwam (na het eerste laden). */
export interface LiveEvent {
  key: string;
  kind: 'beer' | 'signup' | 'friend';
  docId: string;
  uid: string;
  otherUid?: string;
  volume?: number;
  at: Date;
}

type Coll = 'users' | 'beers' | 'friends' | 'friendRequests';
const COLLECTIONS: Coll[] = ['users', 'beers', 'friends', 'friendRequests'];
type RawDoc = { id: string; d: DocumentData };
type Raw = Partial<Record<Coll, RawDoc[]>>;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (v instanceof Date) return v;
  return null;
}

const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null);

function buildDataset(raw: Required<Raw>): Dataset {
  const beers: Beer[] = raw.beers.map(({ id, d }) => ({
    id,
    userId: String(d.userId ?? ''),
    volume: Number(d.volume) || 0,
    date: toDate(d.timestamp),
    toasts: Array.isArray(d.toasts) ? d.toasts.length : 0,
    hasLocation: typeof d.latitude === 'number' && typeof d.longitude === 'number',
    lat: typeof d.latitude === 'number' ? d.latitude : null,
    lng: typeof d.longitude === 'number' ? d.longitude : null,
  }));
  beers.sort((a, b) => (b.date?.getTime() ?? Number.MAX_SAFE_INTEGER) - (a.date?.getTime() ?? Number.MAX_SAFE_INTEGER));

  // Vriendschappen staan in `friends` of in geaccepteerde `friendRequests`; ontdubbel per paar.
  const pairs = new Set<string>();
  const addPair = (a: unknown, b: unknown) => {
    if (!a || !b || a === b) return;
    pairs.add([String(a), String(b)].sort().join('|'));
  };
  raw.friends.forEach(({ d }) => {
    if (d.status === 'pending' || d.status === 'declined') return;
    addPair(d.userId, d.friendId);
  });
  let pendingRequests = 0;
  raw.friendRequests.forEach(({ d }) => {
    if (d.status === 'accepted') addPair(d.fromUserId, d.toUserId);
    else if (d.status === 'pending') pendingRequests++;
  });
  const friendMap = new Map<string, string[]>();
  pairs.forEach((p) => {
    const [a, b] = p.split('|');
    friendMap.set(a, [...(friendMap.get(a) ?? []), b]);
    friendMap.set(b, [...(friendMap.get(b) ?? []), a]);
  });

  const users: UserStats[] = raw.users.map(({ id, d }) => ({
    uid: id,
    username: String(d.username ?? ''),
    email: String(d.email ?? ''),
    photoUrl: String(d.profilePictureUrl ?? ''),
    bannerUrl: String(d.bannerImageUrl ?? ''),
    createdAt: toDate(d.createdAt),
    lastLogin: toDate(d.lastLogin),
    currentStreak: Number(d.currentStreak) || 0,
    longestStreak: Number(d.longestStreak) || 0,
    loginStreak: Number(d.loginStreak) || 0,
    showcasedAchievements: Array.isArray(d.showcasedAchievements) ? d.showcasedAchievements : [],
    hasPushToken: !!d.expoPushToken,
    notifyPushEnabled: boolOrNull(d.notifyPushEnabled),
    notifyFriendRequests: boolOrNull(d.notifyFriendRequests),
    notifyNearbyCheckin: boolOrNull(d.notifyNearbyCheckin),
    hasSeenOnboarding: boolOrNull(d.hasSeenOnboarding),
    beerCount: 0,
    totalCl: 0,
    toastsReceived: 0,
    firstBeer: null,
    lastBeer: null,
    friendIds: friendMap.get(id) ?? [],
  }));
  const usersById = new Map(users.map((u) => [u.uid, u]));

  for (const b of beers) {
    const u = usersById.get(b.userId);
    if (!u) continue;
    u.beerCount++;
    u.totalCl += b.volume;
    u.toastsReceived += b.toasts;
    if (b.date) {
      if (!u.lastBeer || b.date > u.lastBeer) u.lastBeer = b.date;
      if (!u.firstBeer || b.date < u.firstBeer) u.firstBeer = b.date;
    }
  }

  return { users, usersById, beers, friendshipCount: pairs.size, pendingRequests };
}

/** cached = data komt (nog) uit de lokale cache, de server is nog niet bijgewerkt of je bent offline. */
export type LiveStatus = 'connecting' | 'cached' | 'live' | 'error';

interface DataState {
  data: Dataset | null;
  status: LiveStatus;
  error: string | null;
  events: LiveEvent[];
  lastChange: Date | null;
  /** Tikt elke 15 s, zodat "x min geleden" vanzelf bijwerkt. */
  now: Date;
}

const DataContext = createContext<DataState>({
  data: null, status: 'connecting', error: null, events: [], lastChange: null, now: new Date(),
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Raw>({});
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [lastChange, setLastChange] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [fromCache, setFromCache] = useState<Partial<Record<Coll, boolean>>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubs = COLLECTIONS.map((name) => {
      let loaded = false;
      // Pas na de eerste snapshot van de server weten we wat "nieuw" is. Wat tussen
      // het vorige bezoek (de cache) en nu veranderde, telt niet als live-melding.
      let baseline = false;
      return onSnapshot(
        collection(db, name),
        { includeMetadataChanges: true },
        (snap) => {
          setFromCache((f) => (f[name] === snap.metadata.fromCache ? f : { ...f, [name]: snap.metadata.fromCache }));
          const changes = snap.docChanges();
          if (!loaded || changes.length) {
            loaded = true;
            setRaw((r) => ({ ...r, [name]: snap.docs.map((doc) => ({ id: doc.id, d: doc.data() })) }));
            setLastChange(new Date());
            setNow(new Date());
          }
          if (!baseline) {
            if (!snap.metadata.fromCache) baseline = true;
            return;
          }
          if (!changes.length) return;
          const at = new Date();
          const fresh: LiveEvent[] = [];
          changes.forEach((ch) => {
            const d = ch.doc.data();
            const id = ch.doc.id;
            if (name === 'beers' && ch.type === 'added') {
              fresh.push({ key: `beer-${id}`, kind: 'beer', docId: id, uid: String(d.userId), volume: Number(d.volume), at });
            } else if (name === 'users' && ch.type === 'added') {
              fresh.push({ key: `signup-${id}`, kind: 'signup', docId: id, uid: id, at });
            } else if (name === 'friendRequests' && ch.type === 'modified' && d.status === 'accepted') {
              fresh.push({
                key: `friend-${id}-${at.getTime()}`, kind: 'friend', docId: id,
                uid: String(d.fromUserId), otherUid: String(d.toUserId), at,
              });
            }
          });
          if (fresh.length) setEvents((e) => [...fresh, ...e].slice(0, 100));
        },
        (err) => setError(err.message),
      );
    });
    return () => unsubs.forEach((u) => u());
  }, []);

  const data = useMemo(
    () => (COLLECTIONS.every((c) => raw[c]) ? buildDataset(raw as Required<Raw>) : null),
    [raw],
  );

  // Kleine opruimactie: foto's van oude profielfoto-URL's uit de cache halen.
  useEffect(() => {
    if (!data || Object.values(fromCache).some(Boolean)) return;
    const keep = new Set<string>();
    data.users.forEach((u) => {
      if (u.photoUrl) keep.add(u.photoUrl);
      if (u.bannerUrl) keep.add(u.bannerUrl);
    });
    pruneImageCache(keep);
  }, [data, fromCache]);

  const status: LiveStatus = error
    ? 'error'
    : !data
      ? 'connecting'
      : COLLECTIONS.some((c) => fromCache[c] !== false)
        ? 'cached'
        : 'live';

  return (
    <DataContext.Provider value={{ data, status, error, events, lastChange, now }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
