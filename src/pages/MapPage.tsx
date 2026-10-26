import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../data';
import { BeerMap, toPoints, type MapMode } from '../components/BeerMap';
import { Avatar, Card, Segmented } from '../components/ui';
import { displayName, fmtNum, fmtPct, fmtRelative } from '../utils';
import { inPeriod as isInPeriod, usePeriod } from '../period';

/** Plekken: biertjes gegroepeerd op een raster van ongeveer 100 bij 100 meter. */
const spotKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export default function MapPage() {
  const { data, events, now, today } = useData();
  const [params, setParams] = useSearchParams();
  const period = usePeriod(today);
  const [mode, setMode] = useState<MapMode>('heat');
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const uid = params.get('user') ?? '';

  const setUid = (v: string) => setParams(v ? { user: v } : {}, { replace: true });

  const inPeriod = useMemo(() => {
    return data!.beers.filter((b) => isInPeriod(b.date, period) && (!uid || b.userId === uid));
  }, [data, period, uid]);

  const points = useMemo(() => toPoints(inPeriod), [inPeriod]);

  // Gebruikers die ooit een locatie deelden, voor de keuzelijst.
  const sharers = useMemo(() => {
    const counts = new Map<string, number>();
    data!.beers.forEach((b) => b.hasLocation && counts.set(b.userId, (counts.get(b.userId) ?? 0) + 1));
    return [...counts.entries()]
      .map(([id, n]) => ({ user: data!.usersById.get(id), n }))
      .filter((x) => x.user)
      .sort((a, b) => displayName(a.user!).localeCompare(displayName(b.user!)));
  }, [data]);

  const spots = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; n: number; users: Map<string, number>; last: Date | null }>();
    for (const p of points) {
      const k = spotKey(p.lat, p.lng);
      const s = m.get(k) ?? { lat: 0, lng: 0, n: 0, users: new Map(), last: null };
      s.lat += p.lat;
      s.lng += p.lng;
      s.n++;
      s.users.set(p.beer.userId, (s.users.get(p.beer.userId) ?? 0) + 1);
      if (p.beer.date && (!s.last || p.beer.date > s.last)) s.last = p.beer.date;
      m.set(k, s);
    }
    return [...m.values()]
      .map((s) => ({ ...s, lat: s.lat / s.n, lng: s.lng / s.n }))
      .sort((a, b) => b.n - a.n);
  }, [points]);

  const freshIds = useMemo(() => new Set(events.filter((e) => e.kind === 'beer').map((e) => e.docId)), [events]);
  const sharingUsers = new Set(points.map((p) => p.beer.userId)).size;

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>Kaart</h1>
          <p className="muted">Waar biertjes gelogd zijn ({period.label}), voor gebruikers die hun locatie delen. Nauwkeurig tot ongeveer 100 meter. De periode kies je rechtsboven.</p>
        </div>
      </header>

      <div className="map-toolbar">
        <Segmented
          label="Weergave"
          value={mode}
          onChange={setMode}
          options={[{ value: 'heat', label: 'Hittekaart' }, { value: 'points', label: 'Losse biertjes' }]}
        />
        <select className="select" value={uid} onChange={(e) => setUid(e.target.value)} aria-label="Gebruiker">
          <option value="">Alle gebruikers</option>
          {sharers.map(({ user, n }) => (
            <option key={user!.uid} value={user!.uid}>{displayName(user!)} ({fmtNum(n)})</option>
          ))}
        </select>
      </div>

      <div className="map-layout">
        <section className="panel map-panel">
          <BeerMap
            points={points}
            usersById={data!.usersById}
            mode={mode}
            fitKey={`${period.key}|${uid}`}
            freshIds={freshIds}
            focus={focus}
          />
        </section>

        <aside className="map-side">
          <dl className="facts map-facts">
            <div><dt>Biertjes met locatie</dt><dd>{fmtNum(points.length)}</dd></div>
            <div><dt>Van alle biertjes</dt><dd>{inPeriod.length ? fmtPct(points.length / inPeriod.length) : '—'}</dd></div>
            <div><dt>Gebruikers</dt><dd>{fmtNum(sharingUsers)}</dd></div>
            <div><dt>Verschillende plekken</dt><dd>{fmtNum(spots.length)}</dd></div>
          </dl>

          <Card title="Populairste plekken" hint="Klik om in te zoomen">
            {spots.length ? (
              <ol className="spots">
                {spots.slice(0, 10).map((s, i) => {
                  const top = [...s.users.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                  return (
                    <li key={`${s.lat},${s.lng}`}>
                      <button onClick={() => { setMode('points'); setFocus({ lat: s.lat, lng: s.lng, key: Date.now() }); }}>
                        <span className="spot-rank">{i + 1}</span>
                        <span className="spot-body">
                          <span className="spot-title">
                            {fmtNum(s.n)} {s.n === 1 ? 'biertje' : 'biertjes'}
                            <span className="muted small"> door {s.users.size} {s.users.size === 1 ? 'persoon' : 'personen'}</span>
                          </span>
                          <span className="spot-people">
                            {top.map(([id]) => {
                              const u = data!.usersById.get(id);
                              return u ? <Avatar key={id} url={u.photoUrl} name={displayName(u)} size={20} /> : null;
                            })}
                            <span className="muted small">laatst {fmtRelative(s.last, now)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted small">Nog geen plekken in deze selectie.</p>
            )}
          </Card>

          {uid && data!.usersById.get(uid) && (
            <Link to={`/users/${uid}`} className="text-link">Naar het profiel van {displayName(data!.usersById.get(uid)!)}</Link>
          )}
        </aside>
      </div>
    </div>
  );
}
