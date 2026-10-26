import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../data';
import { useAuth } from '../auth';
import { useCachedImage } from '../imageCache';
import { achievementsFor } from '../achievements';
import { AchievementGrid } from '../components/achievements';
import { addAdmin, adminErrorMessage, useAdmins } from '../admins';
import { Avatar, Card, ConfirmButton, Empty, useChartProps } from '../components/ui';
import { deleteBeer, functionErrorMessage, setUserBlocked, useBlockedUsers } from '../moderation';
import { CalendarHeatmap } from '../components/charts';
import { IconArrowLeft, IconCopy, IconTrash } from '../components/icons';
import {
  addDays, dayKey, displayName, fmtDate, fmtDateTime, fmtLiters, fmtNum, fmtRelative, fmtShortDate, fmtVolume,
  startOfWeek, weeksBetween,
} from '../utils';

const WEEKS = 26;
const UserMap = lazy(() => import('../components/UserMap'));
const DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

function Pref({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="pref">
      <span>{label}</span>
      <span className={value === true ? 'pill on' : value === false ? 'pill off' : 'pill'}>
        {value === true ? 'Aan' : value === false ? 'Uit' : 'Onbekend'}
      </span>
    </div>
  );
}

export default function UserDetail() {
  const { uid = '' } = useParams();
  const { data, now, today, events } = useData();
  const chart = useChartProps();
  const [copied, setCopied] = useState(false);
  const { user: me } = useAuth();
  const { admins } = useAdmins();
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const user = data!.usersById.get(uid);
  const isAdmin = !!admins?.some((a) => a.uid === uid);
  const blockedUsers = useBlockedUsers();
  const block = blockedUsers.get(uid);

  /** Voert een Cloud Function uit en zet een fout om in een leesbare melding. */
  const call = (fnName: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err) {
      throw new Error(functionErrorMessage(err, fnName));
    }
  };
  const bannerSrc = useCachedImage(user?.bannerUrl);
  const achievements = useMemo(() => achievementsFor(data!).get(uid), [data, uid]);

  const makeAdmin = async () => {
    if (!user || !me) return;
    setAdminBusy(true);
    setAdminError(null);
    try {
      await addAdmin(user, me);
    } catch (err) {
      setAdminError(adminErrorMessage(err));
    } finally {
      setAdminBusy(false);
    }
  };

  const beers = useMemo(() => data!.beers.filter((b) => b.userId === uid), [data, uid]);
  const freshBeerIds = useMemo(() => new Set(events.filter((e) => e.kind === 'beer').map((e) => e.docId)), [events]);

  const weekly = useMemo(() => {
    const start = addDays(startOfWeek(today), -7 * (WEEKS - 1));
    const rows = Array.from({ length: WEEKS }, (_, i) => ({ label: fmtShortDate(addDays(start, i * 7)), biertjes: 0 }));
    for (const b of beers) {
      if (!b.date || b.date < start) continue;
      const i = weeksBetween(start, startOfWeek(b.date));
      if (i >= 0 && i < WEEKS) rows[i].biertjes++;
    }
    return rows;
  }, [beers, today]);

  const insights = useMemo(() => {
    const days = new Map<string, number>();
    const weekday = new Array(7).fill(0) as number[];
    const sizes = new Map<number, number>();
    for (const b of beers) {
      sizes.set(b.volume, (sizes.get(b.volume) ?? 0) + 1);
      if (!b.date) continue;
      days.set(dayKey(b.date), (days.get(dayKey(b.date)) ?? 0) + 1);
      weekday[(b.date.getDay() + 6) % 7]++;
    }
    const best = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
    const favDay = weekday.some(Boolean) ? weekday.indexOf(Math.max(...weekday)) : -1;
    const favSize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      activeDays: days.size,
      bestDay: best ? { date: new Date(best[0] + 'T00:00:00'), count: best[1] } : null,
      favDay: favDay >= 0 ? DAYS[favDay] : null,
      favSize: favSize ? fmtVolume(favSize[0]) : null,
      sizes: [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => ({ label: fmtVolume(v), biertjes: n })),
    };
  }, [beers]);

  if (!user) {
    return (
      <div className="page">
        <Link to="/users" className="back"><IconArrowLeft /> Gebruikers</Link>
        <Card><Empty>Deze gebruiker bestaat niet (meer). Misschien is het account verwijderd.</Empty></Card>
      </div>
    );
  }

  const friends = user.friendIds.map((id) => data!.usersById.get(id)).filter((f) => f !== undefined);
  const { colors } = chart;
  const copyUid = async () => {
    await navigator.clipboard.writeText(user.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="page">
      <Link to="/users" className="back"><IconArrowLeft /> Gebruikers</Link>

      <section className="profile">
        {/* De foto ligt over het verloop; laadt hij niet, dan blijft het verloop zichtbaar. */}
        <div className="profile-banner" style={bannerSrc ? { ['--banner' as string]: `url("${bannerSrc}")` } : undefined} />
        <div className="profile-body">
          <Avatar url={user.photoUrl} name={displayName(user)} size={88} />
          <div className="profile-info">
            <h1 className="profile-name">
              {user.username || 'Geen gebruikersnaam'}
              {isAdmin && <Link to="/admins" className="status s-admin">Beheerder</Link>}
              {block && <span className="status s-blocked" title={block.reason || undefined}>Geblokkeerd</span>}
            </h1>
            <div className="muted">{user.email}</div>
            <button className="uid" onClick={copyUid} title="Kopieer gebruikers-ID">
              <code>{user.uid}</code> <IconCopy width={14} height={14} /> <span>{copied ? 'Gekopieerd' : ''}</span>
            </button>
          </div>
          <dl className="profile-meta">
            <div><dt>Lid sinds</dt><dd>{fmtDate(user.createdAt)}</dd></div>
            <div><dt>Laatst ingelogd</dt><dd>{fmtRelative(user.lastLogin, now)}</dd></div>
            <div><dt>Laatste biertje</dt><dd>{fmtRelative(user.lastBeer, now)}</dd></div>
          </dl>
          <div className="profile-actions">
            <Link className="btn sm" to={`/compare?u=${user.uid}`}>Vergelijken</Link>
            {user.hasPushToken && user.notifyPushEnabled !== false && (
              <Link className="btn sm" to={`/messages?u=${user.uid}`}>Stuur bericht</Link>
            )}
            {admins && !isAdmin && !block && (
              <button className="btn sm" onClick={makeAdmin} disabled={adminBusy}>
                {adminBusy ? 'Bezig…' : 'Maak beheerder'}
              </button>
            )}
            {!isAdmin && uid !== me?.uid && (
              block ? (
                <ConfirmButton
                  label="Deblokkeren"
                  confirmLabel="Ja, deblokkeer"
                  danger={false}
                  onConfirm={call('setUserBlocked', () => setUserBlocked(uid, false))}
                />
              ) : (
                <ConfirmButton
                  label="Blokkeren"
                  confirmLabel="Ja, blokkeer"
                  title="Zet het account uit: de persoon kan niet meer inloggen"
                  onConfirm={call('setUserBlocked', () => setUserBlocked(uid, true))}
                />
              )
            )}
          </div>
        </div>
        {adminError && <div className="banner error profile-banner-msg" role="alert">{adminError}</div>}
        {block && (
          <div className="banner error profile-banner-msg" role="status">
            Geblokkeerd{block.blockedAt ? ` op ${fmtDateTime(block.blockedAt)}` : ''}{block.byEmail ? ` door ${block.byEmail}` : ''}.
            Deze persoon kan niet meer inloggen in de app.{block.reason ? ` Reden: ${block.reason}` : ''}
          </div>
        )}
      </section>

      <dl className="facts">
        <div><dt>Biertjes</dt><dd>{fmtNum(user.beerCount)}</dd></div>
        <div><dt>Volume</dt><dd>{fmtLiters(user.totalCl)}</dd></div>
        <div><dt>Drinkdagen</dt><dd>{fmtNum(insights.activeDays)}</dd></div>
        <div><dt>Per drinkdag</dt><dd>{insights.activeDays ? (user.beerCount / insights.activeDays).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '—'}</dd></div>
        <div><dt>Huidige reeks</dt><dd>{user.currentStreak} d</dd></div>
        <div><dt>Langste reeks</dt><dd>{user.longestStreak} d</dd></div>
        <div><dt>Loginreeks</dt><dd>{user.loginStreak} d</dd></div>
        <div><dt>Proostjes ontvangen</dt><dd>{fmtNum(user.toastsReceived)}</dd></div>
      </dl>

      {beers.some((b) => b.hasLocation) && (
        <Card
          title="Waar gedronken"
          hint={`${fmtNum(beers.filter((b) => b.hasLocation).length)} van ${fmtNum(beers.length)} biertjes met locatie`}
          actions={<Link to={`/map?user=${user.uid}`} className="text-link">Grote kaart</Link>}
        >
          <Suspense fallback={<div className="map-wrap" style={{ height: 340 }} />}>
            <UserMap beers={beers} />
          </Suspense>
        </Card>
      )}

      {achievements && (
        <Card
          title="Achievements"
          hint="Berekend met dezelfde regels als de app. ★ staat op het profiel van de gebruiker."
        >
          <AchievementGrid result={achievements} showcased={user.showcasedAchievements} />
        </Card>
      )}

      <Card
        title="Het afgelopen jaar"
        hint={[
          insights.bestDay && `Drukste dag: ${fmtShortDate(insights.bestDay.date)} met ${insights.bestDay.count} biertjes`,
          insights.favDay && `Favoriete dag: ${insights.favDay}`,
          insights.favSize && `Meestal ${insights.favSize}`,
        ].filter(Boolean).join('. ') || 'Nog geen biertjes gelogd'}
      >
        <CalendarHeatmap beers={beers} />
      </Card>

      <div className="grid-2">
        <Card title="Biertjes per week" hint={`Laatste ${WEEKS} weken`}>
          <div className="chart-md">
            <ResponsiveContainer>
              <BarChart data={weekly} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={28} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="biertjes" name="Biertjes" fill={colors.accent} radius={[8, 8, 8, 8]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Glasmaten">
          {insights.sizes.length ? (
            <div className="chart-md">
              <ResponsiveContainer>
                <BarChart data={insights.sizes} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid {...chart.grid} horizontal={false} vertical />
                  <XAxis type="number" {...chart.axis} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" {...chart.axis} width={52} />
                  <Tooltip {...chart.tooltip} />
                  <Bar dataKey="biertjes" name="Biertjes" fill={colors.accent} radius={[8, 8, 8, 8]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </Card>

        <Card title="Gelogde biertjes" hint={beers.length > 50 ? 'De laatste 50' : undefined}>
          {beers.length ? (
            <div className="table-wrap tall">
              <table className="table compact">
                <thead>
                  <tr><th>Wanneer</th><th className="num">Maat</th><th className="num">Proostjes</th><th>Locatie</th><th aria-label="Acties" /></tr>
                </thead>
                <tbody>
                  {beers.slice(0, 50).map((b) => (
                    <tr key={b.id} className={freshBeerIds.has(b.id) ? 'no-hover fresh' : 'no-hover'}>
                      <td>{fmtDateTime(b.date)}</td>
                      <td className="num">{fmtVolume(b.volume)}</td>
                      <td className="num">{b.toasts || ''}</td>
                      <td className="muted small">{b.hasLocation ? 'Gedeeld' : ''}</td>
                      <td className="row-actions">
                        <ConfirmButton
                          label={<IconTrash width={15} height={15} />}
                          title="Biertje verwijderen"
                          confirmLabel="Verwijder"
                          className="btn xs"
                          onConfirm={call('deleteBeer', () => deleteBeer(b.id))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Nog geen biertjes gelogd</Empty>}
        </Card>

        <div className="stack">
          <Card title="Vrienden" hint={`${friends.length} ${friends.length === 1 ? 'vriend' : 'vrienden'}`}>
            {friends.length ? (
              <ul className="people">
                {friends.sort((a, b) => b.beerCount - a.beerCount).map((f) => (
                  <li key={f.uid}>
                    <Link to={`/users/${f.uid}`} className="lb-user">
                      <Avatar url={f.photoUrl} name={displayName(f)} size={30} />
                      <span className="lb-name">{displayName(f)}</span>
                    </Link>
                    <span className="lb-sub">{fmtNum(f.beerCount)} biertjes</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nog geen vrienden</Empty>}
          </Card>

          <Card title="Instellingen in de app">
            <Pref label="Pushmeldingen" value={user.notifyPushEnabled} />
            <Pref label="Meldingen bij vriendschapsverzoeken" value={user.notifyFriendRequests} />
            <Pref label="Meldingen als vrienden in de buurt drinken" value={user.notifyNearbyCheckin} />
            <Pref label="Apparaat geregistreerd voor push" value={user.hasPushToken} />
            <Pref label="Introductie afgerond" value={user.hasSeenOnboarding} />
          </Card>
        </div>
      </div>
    </div>
  );
}
