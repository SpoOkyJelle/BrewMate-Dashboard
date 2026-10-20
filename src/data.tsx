import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface Beer {
  id: string;
  userId: string;
  volume: number; // centilitres
  date: Date | null;
  toasts: number;
  hasLocation: boolean;
}

export interface UserStats {
  uid: string;
  username: string;
  email: string;
  photoUrl: string;
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
  // Derived from the beers / friends collections
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
  beers: Beer[];
  friendshipCount: number;
  pendingRequests: number;
  loadedAt: Date;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null);

async function loadDataset(): Promise<Dataset> {
  const [usersSnap, beersSnap, friendsSnap, requestsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'beers')),
    getDocs(collection(db, 'friends')),
    getDocs(collection(db, 'friendRequests')),
  ]);

  const beers: Beer[] = beersSnap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      userId: String(b.userId ?? ''),
      volume: Number(b.volume) || 0,
      date: toDate(b.timestamp),
      toasts: Array.isArray(b.toasts) ? b.toasts.length : 0,
      hasLocation: typeof b.latitude === 'number',
    };
  });
  beers.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  // Friendships can live in either `friends` or accepted `friendRequests`; dedupe by pair.
  const pairs = new Set<string>();
  const addPair = (a: unknown, b: unknown) => {
    if (!a || !b || a === b) return;
    pairs.add([String(a), String(b)].sort().join('|'));
  };
  friendsSnap.docs.forEach((d) => {
    const f = d.data();
    if (f.status === 'pending' || f.status === 'declined') return;
    addPair(f.userId, f.friendId);
  });
  let pendingRequests = 0;
  requestsSnap.docs.forEach((d) => {
    const r = d.data();
    if (r.status === 'accepted') addPair(r.fromUserId, r.toUserId);
    else if (r.status === 'pending') pendingRequests++;
  });

  const friendMap = new Map<string, string[]>();
  pairs.forEach((p) => {
    const [a, b] = p.split('|');
    friendMap.set(a, [...(friendMap.get(a) ?? []), b]);
    friendMap.set(b, [...(friendMap.get(b) ?? []), a]);
  });

  const users: UserStats[] = usersSnap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      username: String(u.username ?? ''),
      email: String(u.email ?? ''),
      photoUrl: String(u.profilePictureUrl ?? ''),
      createdAt: toDate(u.createdAt),
      lastLogin: toDate(u.lastLogin),
      currentStreak: Number(u.currentStreak) || 0,
      longestStreak: Number(u.longestStreak) || 0,
      loginStreak: Number(u.loginStreak) || 0,
      showcasedAchievements: Array.isArray(u.showcasedAchievements) ? u.showcasedAchievements : [],
      hasPushToken: !!u.expoPushToken,
      notifyPushEnabled: boolOrNull(u.notifyPushEnabled),
      notifyFriendRequests: boolOrNull(u.notifyFriendRequests),
      notifyNearbyCheckin: boolOrNull(u.notifyNearbyCheckin),
      hasSeenOnboarding: boolOrNull(u.hasSeenOnboarding),
      beerCount: 0,
      totalCl: 0,
      toastsReceived: 0,
      firstBeer: null,
      lastBeer: null,
      friendIds: friendMap.get(d.id) ?? [],
    };
  });
  const usersById = new Map(users.map((u) => [u.uid, u]));

  // beers are sorted newest first
  for (const b of beers) {
    const u = usersById.get(b.userId);
    if (!u) continue;
    u.beerCount++;
    u.totalCl += b.volume;
    u.toastsReceived += b.toasts;
    if (b.date) {
      if (!u.lastBeer) u.lastBeer = b.date;
      u.firstBeer = b.date;
    }
  }

  return {
    users,
    usersById,
    beers,
    friendshipCount: pairs.size,
    pendingRequests,
    loadedAt: new Date(),
  };
}

interface DataState {
  data: Dataset | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DataContext = createContext<DataState>({ data: null, loading: true, error: null, refresh: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    loadDataset()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return <DataContext.Provider value={{ data, loading, error, refresh }}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
