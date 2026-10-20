import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, type LiveEvent, type UserStats } from '../data';
import { displayName, fmtRelative, fmtVolume } from '../utils';
import { Avatar } from './ui';
import { IconCheers, IconGlass, IconUserPlus } from './icons';

type FeedItem = {
  key: string;
  kind: 'beer' | 'signup';
  user: UserStats | undefined;
  uid: string;
  at: Date;
  volume?: number;
  toasts?: number;
};

/** Laatste activiteit: biertjes en aanmeldingen, live bijgewerkt. Nieuwe items lichten op. */
export function LiveFeed({ limit = 30 }: { limit?: number }) {
  const { data, events, now } = useData();

  const freshKeys = useMemo(() => new Set(events.map((e) => e.key)), [events]);

  const items = useMemo<FeedItem[]>(() => {
    if (!data) return [];
    const beers: FeedItem[] = data.beers.slice(0, limit).filter((b) => b.date).map((b) => ({
      key: `beer-${b.id}`, kind: 'beer', uid: b.userId, user: data.usersById.get(b.userId),
      at: b.date!, volume: b.volume, toasts: b.toasts,
    }));
    const signups: FeedItem[] = data.users.filter((u) => u.createdAt)
      .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())
      .slice(0, 10)
      .map((u) => ({ key: `signup-${u.uid}`, kind: 'signup', uid: u.uid, user: u, at: u.createdAt! }));
    return [...beers, ...signups].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }, [data, limit]);

  if (!items.length) return <div className="empty">Zodra iemand een biertje logt, zie je het hier.</div>;

  return (
    <ol className="feed" aria-live="polite">
      {items.map((it) => {
        const name = it.user ? displayName(it.user) : 'Verwijderd account';
        return (
          <li key={it.key} className={freshKeys.has(it.key) ? 'feed-item fresh' : 'feed-item'}>
            <span className={`feed-icon ${it.kind}`}>
              {it.kind === 'beer' ? <IconGlass width={15} height={15} /> : <IconUserPlus width={15} height={15} />}
            </span>
            <div className="feed-body">
              <div className="feed-text">
                {it.user ? <Link to={`/users/${it.uid}`}>{name}</Link> : <span className="muted">{name}</span>}{' '}
                {it.kind === 'beer'
                  ? <>logde <strong>{fmtVolume(it.volume ?? 0)}</strong></>
                  : <>heeft zich aangemeld</>}
                {!!it.toasts && <span className="feed-toasts" title="Proostjes van vrienden"> 🍻 {it.toasts}</span>}
              </div>
              <time className="feed-time" dateTime={it.at.toISOString()} title={it.at.toLocaleString('nl-NL')}>
                {fmtRelative(it.at, now)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Toast = LiveEvent & { leaving?: boolean };

/** Meldingen rechtsonder voor nieuwe gebruikers en nieuwe vriendschappen. */
export function Toasts() {
  const { data, events } = useData();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = events.filter((e) => e.kind !== 'beer' && !seen.current.has(e.key));
    if (!fresh.length) return;
    fresh.forEach((e) => seen.current.add(e.key));
    setToasts((t) => [...fresh, ...t].slice(0, 4));
    fresh.forEach((e) => {
      setTimeout(() => setToasts((t) => t.map((x) => (x.key === e.key ? { ...x, leaving: true } : x))), 5200);
      setTimeout(() => setToasts((t) => t.filter((x) => x.key !== e.key)), 5600);
    });
  }, [events]);

  const name = (uid?: string) => {
    const u = uid ? data?.usersById.get(uid) : undefined;
    return u ? displayName(u) : 'Iemand';
  };

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const u = data?.usersById.get(t.uid);
        return (
          <Link key={t.key} to={`/users/${t.uid}`} className={t.leaving ? 'toast leaving' : 'toast'}>
            {t.kind === 'signup'
              ? (u ? <Avatar url={u.photoUrl} name={displayName(u)} size={32} /> : <span className="feed-icon signup"><IconUserPlus /></span>)
              : <span className="feed-icon friend"><IconCheers /></span>}
            <div>
              <div className="toast-title">{t.kind === 'signup' ? 'Nieuwe gebruiker' : 'Nieuwe vriendschap'}</div>
              <div className="toast-text">
                {t.kind === 'signup' ? `${name(t.uid)} heeft zich aangemeld` : `${name(t.uid)} en ${name(t.otherUid)} zijn nu vrienden`}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
