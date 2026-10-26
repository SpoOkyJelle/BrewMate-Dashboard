import type { DocumentData } from 'firebase/firestore';

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

export type Coll = 'users' | 'beers' | 'friends' | 'friendRequests';
export const COLLECTIONS: Coll[] = ['users', 'beers', 'friends', 'friendRequests'];
export type RawDoc = { id: string; d: DocumentData };
export type Raw = Partial<Record<Coll, RawDoc[]>>;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (v instanceof Date) return v;
  return null;
}

const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null);

/** Zet de ruwe Firestore-documenten om naar wat het dashboard gebruikt. Puur: geen Firebase nodig. */
export function buildDataset(raw: Required<Raw>): Dataset {
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
