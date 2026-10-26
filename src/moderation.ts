import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, functions } from './firebase';

/** Vertaalt een fout van een Cloud Function naar een begrijpelijke melding. */
export function functionErrorMessage(err: unknown, fnName: string): string {
  const code = (err as { code?: string }).code ?? '';
  const msg = (err as { message?: string }).message ?? '';
  if (code === 'functions/not-found' || (code === 'functions/internal' && /not found|404/i.test(msg))) {
    return `De Cloud Function ${fnName} is nog niet uitgerold. Zie de README.`;
  }
  if (code === 'functions/permission-denied') return 'Alleen beheerders kunnen dit doen.';
  if (code === 'functions/invalid-argument' || code === 'functions/failed-precondition') return msg;
  if (code === 'functions/unavailable' || code === 'functions/internal') {
    return `De Cloud Function ${fnName} is niet bereikbaar. Is hij uitgerold (zie README)? Probeer het anders zo opnieuw.`;
  }
  return msg || 'Dat lukte niet. Probeer het opnieuw.';
}

export async function deleteBeer(beerId: string) {
  await httpsCallable(functions, 'deleteBeer')({ beerId });
}

export async function setUserBlocked(uid: string, blocked: boolean, reason = '') {
  await httpsCallable(functions, 'setUserBlocked')({ uid, blocked, reason });
}

export interface BlockInfo {
  blockedAt: Date | null;
  byEmail: string;
  reason: string;
}

/** Geblokkeerde gebruikers, live. Leeg als de regels het (nog) niet toestaan. */
export function useBlockedUsers() {
  const [blocked, setBlocked] = useState<Map<string, BlockInfo>>(new Map());
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'blockedUsers'),
        (snap) =>
          setBlocked(new Map(snap.docs.map((d) => {
            const x = d.data();
            return [d.id, {
              blockedAt: typeof x.blockedAt?.toDate === 'function' ? x.blockedAt.toDate() : null,
              byEmail: String(x.byEmail ?? ''),
              reason: String(x.reason ?? ''),
            }];
          }))),
        () => setBlocked(new Map()),
      ),
    [],
  );
  return blocked;
}
