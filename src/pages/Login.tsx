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
      return 'E-mailadres of wachtwoord klopt niet.';
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het over een paar minuten opnieuw.';
    case 'auth/invalid-email':
      return 'Dit is geen geldig e-mailadres.';
    case 'auth/network-request-failed':
      return 'Geen internetverbinding. Controleer je netwerk en probeer opnieuw.';
    default:
      return 'Inloggen mislukt. Probeer het opnieuw.';
  }
}

/** Glas dat zich vult bij het laden van de pagina. */
function FillingGlass() {
  return (
    <svg className="login-glass" viewBox="0 0 64 80" aria-hidden>
      <defs>
        <clipPath id="glass-inside">
          <path d="M12 14h32l-3 56a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" />
        </clipPath>
      </defs>
      <g clipPath="url(#glass-inside)">
        <rect className="beer" x="0" y="14" width="64" height="62" />
        <rect className="foam" x="0" y="14" width="64" height="8" />
        <circle className="bubble b1" cx="22" cy="70" r="1.4" />
        <circle className="bubble b2" cx="30" cy="72" r="1" />
        <circle className="bubble b3" cx="36" cy="70" r="1.2" />
      </g>
      <path d="M12 14h32l-3 56a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" className="glass-outline" />
      <path d="M44 26h5a7 7 0 0 1 0 14h-6" className="glass-outline" />
    </svg>
  );
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

  const working = busy || status === 'loading';

  return (
    <div className="login">
      <div className="login-card">
        <FillingGlass />
        <h1>BrewMate beheer</h1>
        <p className="muted">Log in met je BrewMate-account.</p>

        {status === 'notAdmin' && user ? (
          <div className="notice">
            <p><strong>{user.email}</strong> heeft geen beheerrechten.</p>
            <p className="muted small">
              Maak in Firestore een document aan op <code>admins/{user.uid}</code> en log daarna opnieuw in.
            </p>
            <button className="btn" onClick={logout}>Ander account gebruiken</button>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            <label>
              E-mailadres
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label>
              Wachtwoord
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn primary" type="submit" disabled={working}>
              {working ? 'Bezig met inloggen…' : 'Inloggen'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
