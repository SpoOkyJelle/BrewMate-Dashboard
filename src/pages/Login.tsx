import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth';

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    default:
      return 'Sign in failed. Please try again.';
  }
}

export default function Login() {
  const { status, user, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'admin') return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      setError(friendlyError((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen login-bg">
      <div className="card login-card">
        <div className="login-head">
          <img src="/favicon.svg" alt="" width={48} height={48} />
          <h1>BrewMate Admin</h1>
          <p className="muted">Sign in with your BrewMate account</p>
        </div>

        {status === 'notAdmin' && user ? (
          <div className="notice">
            <p>
              <strong>{user.email}</strong> is not an admin.
            </p>
            <p className="muted small">
              To grant access, create a document in Firestore at <code>admins/{user.uid}</code> (it can be empty), then
              sign in again.
            </p>
            <button className="btn" onClick={logout}>Use another account</button>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            <label>
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn primary" type="submit" disabled={busy || status === 'loading'}>
              {busy || status === 'loading' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
