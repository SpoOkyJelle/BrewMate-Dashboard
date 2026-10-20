import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import type { UserStats } from './data';

export interface AdminEntry {
  uid: string;
  email: string;
  name: string;
  addedAt: Date | null;
  addedByUid: string;
  addedByEmail: string;
}

/** Alle beheerders, live. */
export function useAdmins() {
  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          setError(null);
          setAdmins(
            snap.docs.map((d) => {
              const a = d.data();
              return {
                uid: d.id,
                email: String(a.email ?? ''),
                name: String(a.name ?? ''),
                addedAt: typeof a.addedAt?.toDate === 'function' ? a.addedAt.toDate() : null,
                addedByUid: String(a.addedByUid ?? ''),
                addedByEmail: String(a.addedByEmail ?? ''),
              };
            }),
          );
        },
        (err) => setError(err.message),
      ),
    [],
  );

  return { admins, error };
}

export async function addAdmin(target: UserStats, by: User) {
  await setDoc(doc(db, 'admins', target.uid), {
    email: target.email,
    name: target.username,
    addedAt: serverTimestamp(),
    addedByUid: by.uid,
    addedByEmail: by.email ?? '',
  });
}

export async function removeAdmin(uid: string) {
  await deleteDoc(doc(db, 'admins', uid));
}

/** Vertaalt Firestore-fouten naar een bruikbare melding. */
export function adminErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  if (code === 'permission-denied') {
    return 'Firestore staat dit niet toe. Pas de regels voor de collectie admins aan (zie firestore.rules.example).';
  }
  return 'Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.';
}
