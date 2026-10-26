import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { pruneImageCache } from './imageCache';
import { dayKey, startOfDay } from './utils';
import { buildDataset, COLLECTIONS, type Coll, type Dataset, type Raw } from './dataset';

export type { Beer, Dataset, UserStats } from './dataset';

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
  /**
   * Middernacht van vandaag. Verandert maar één keer per dag, dus berekeningen die alleen
   * per dag rekenen hangen hiervan af in plaats van `now` en draaien niet elke 15 s opnieuw.
   */
  today: Date;
}

const DataContext = createContext<DataState>({
  data: null, status: 'connecting', error: null, events: [], lastChange: null, now: new Date(), today: startOfDay(new Date()),
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

  const todayKey = dayKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => startOfDay(now), [todayKey]);

  const status: LiveStatus = error
    ? 'error'
    : !data
      ? 'connecting'
      : COLLECTIONS.some((c) => fromCache[c] !== false)
        ? 'cached'
        : 'live';

  return (
    <DataContext.Provider value={{ data, status, error, events, lastChange, now, today }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
