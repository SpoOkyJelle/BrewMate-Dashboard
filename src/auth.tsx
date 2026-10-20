import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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

// A signed-in user is an admin when a document exists at admins/{uid}.
async function checkAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setStatus('signedOut');
        return;
      }
      setStatus('loading');
      setStatus((await checkAdmin(u.uid)) ? 'admin' : 'notAdmin');
    });
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, logout: () => signOut(auth) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
