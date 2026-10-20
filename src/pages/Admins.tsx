import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useData } from '../data';
import { addAdmin, adminErrorMessage, removeAdmin, useAdmins, type AdminEntry } from '../admins';
import { Avatar, Card, Empty } from '../components/ui';
import { IconSearch } from '../components/icons';
import { displayName, fmtDate } from '../utils';

export default function Admins() {
  const { user } = useAuth();
  const { data } = useData();
  const { admins, error: loadError } = useAdmins();
  const [query, setQuery] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmUid, setConfirmUid] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const adminUids = useMemo(() => new Set(admins?.map((a) => a.uid)), [admins]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return data!.users
      .filter((u) => !adminUids.has(u.uid))
      .filter((u) => `${u.username} ${u.email} ${u.uid}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, data, adminUids]);

  const sortedAdmins = useMemo(
    () => [...(admins ?? [])].sort((a, b) => (a.addedAt?.getTime() ?? 0) - (b.addedAt?.getTime() ?? 0)),
    [admins],
  );

  const handleAdd = async (uid: string) => {
    const target = data!.usersById.get(uid);
    if (!target || !user) return;
    setBusyUid(uid);
    setMessage(null);
    try {
      await addAdmin(target, user);
      setQuery('');
      setMessage({ kind: 'ok', text: `${displayName(target)} is nu beheerder.` });
    } catch (err) {
      setMessage({ kind: 'error', text: adminErrorMessage(err) });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async (a: AdminEntry) => {
    setBusyUid(a.uid);
    setMessage(null);
    try {
      await removeAdmin(a.uid);
      setConfirmUid(null);
      setMessage({ kind: 'ok', text: `${labelFor(a)} is geen beheerder meer.` });
    } catch (err) {
      setMessage({ kind: 'error', text: adminErrorMessage(err) });
    } finally {
      setBusyUid(null);
    }
  };

  const labelFor = (a: AdminEntry) => {
    const u = data!.usersById.get(a.uid);
    return u ? displayName(u) : a.name || a.email || a.uid.slice(0, 8);
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Beheerders</h1>
          <p className="muted">Beheerders kunnen dit dashboard openen en andere beheerders toevoegen of verwijderen.</p>
        </div>
      </header>

      {message && (
        <div className={`banner ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}

      <Card title="Beheerder toevoegen" hint="Zoek een bestaand BrewMate-account. Die persoon logt daarna in met het eigen wachtwoord.">
        <label className="search wide">
          <IconSearch />
          <input
            type="search"
            placeholder="Naam of e-mailadres"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Zoek een gebruiker om beheerder te maken"
          />
        </label>
        {query.trim().length >= 2 && (
          candidates.length ? (
            <ul className="people pick-list">
              {candidates.map((u) => (
                <li key={u.uid}>
                  <Link to={`/users/${u.uid}`} className="lb-user">
                    <Avatar url={u.photoUrl} name={displayName(u)} size={34} />
                    <span>
                      <span className="lb-name">{displayName(u)}</span>
                      <span className="muted small block">{u.email}</span>
                    </span>
                  </Link>
                  <button className="btn primary sm" onClick={() => handleAdd(u.uid)} disabled={busyUid === u.uid}>
                    {busyUid === u.uid ? 'Bezig…' : 'Maak beheerder'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small pick-empty">
              Geen gebruiker gevonden die nog geen beheerder is. De persoon moet eerst een account hebben in de BrewMate-app.
            </p>
          )
        )}
      </Card>

      <Card title="Huidige beheerders" hint={admins ? `${admins.length} ${admins.length === 1 ? 'beheerder' : 'beheerders'}` : undefined}>
        {loadError ? (
          <p className="muted">
            De lijst kan niet geladen worden: {loadError}. Beheerders moeten de collectie <code>admins</code> mogen lezen
            (zie firestore.rules.example).
          </p>
        ) : !admins ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : !admins.length ? (
          <Empty>Nog geen beheerders</Empty>
        ) : (
          <ul className="people admin-list">
            {sortedAdmins.map((a) => {
              const u = data!.usersById.get(a.uid);
              const isMe = a.uid === user?.uid;
              const isLast = admins.length === 1;
              return (
                <li key={a.uid}>
                  <Link to={`/users/${a.uid}`} className="lb-user">
                    <Avatar url={u?.photoUrl ?? ''} name={labelFor(a)} size={38} />
                    <span>
                      <span className="lb-name">
                        {labelFor(a)} {isMe && <span className="status s-active">Jij</span>}
                      </span>
                      <span className="muted small block">{u?.email || a.email || a.uid}</span>
                    </span>
                  </Link>
                  <span className="muted small admin-meta">
                    {a.addedAt
                      ? `Toegevoegd op ${fmtDate(a.addedAt)}${a.addedByEmail ? ` door ${a.addedByEmail}` : ''}`
                      : 'Handmatig toegevoegd'}
                  </span>
                  {isMe || isLast ? (
                    <span className="muted small admin-action" title={isLast ? 'Er moet altijd minstens één beheerder zijn' : 'Je kunt jezelf niet verwijderen'}>
                      {isLast ? 'Laatste beheerder' : ''}
                    </span>
                  ) : confirmUid === a.uid ? (
                    <span className="admin-action confirm">
                      <button className="btn danger sm" onClick={() => handleRemove(a)} disabled={busyUid === a.uid}>
                        {busyUid === a.uid ? 'Bezig…' : 'Ja, verwijderen'}
                      </button>
                      <button className="btn sm" onClick={() => setConfirmUid(null)}>Annuleren</button>
                    </span>
                  ) : (
                    <button className="btn sm admin-action" onClick={() => setConfirmUid(a.uid)}>Verwijderen</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
