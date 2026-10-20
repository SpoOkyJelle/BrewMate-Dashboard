import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { clearIndexedDbPersistence, doc, onSnapshot, terminate } from 'firebase/firestore';
import { auth, db } from './firebase';
import { clearImageCache } from './imageCache';

/** Uitloggen én alle lokaal bewaarde gebruikersdata en foto's wissen. */
async function logoutAndClear() {
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Lukt niet als een ander tabblad het dashboard nog open heeft. De cache blijft dan staan
    // tot de volgende keer uitloggen met maar één tabblad open.
  }
  await clearImageCache();
  // Firestore is na terminate() niet meer bruikbaar, dus start de app opnieuw.
  window.location.assign('/login');
}

export type AuthStatus = 'loading' | 'signedOut' | 'notAdmin' | 'admin';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  status: 'loading',
  user: null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let stopAdminWatch: (() => void) | null = null;

    const stopAuth = onAuthStateChanged(auth, (u) => {
      stopAdminWatch?.();
      stopAdminWatch = null;
      setUser(u);
      if (!u) {
        setStatus('signedOut');
        return;
      }
      setStatus('loading');
      // Live: een ingelogde gebruiker is admin zolang admins/{uid} bestaat.
      // Wordt iemand als admin verwijderd, dan verliest die direct de toegang.
      stopAdminWatch = onSnapshot(
        doc(db, 'admins', u.uid),
        (snap) => setStatus(snap.exists() ? 'admin' : 'notAdmin'),
        () => setStatus('notAdmin'),
      );
    });

    return () => {
      stopAdminWatch?.();
      stopAuth();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, logout: logoutAndClear }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
