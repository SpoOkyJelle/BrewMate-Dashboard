import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData, type Beer, type UserStats } from '../data';
import { ACHIEVEMENTS, achievementsFor, UNKNOWN_REASON } from '../achievements';
import { AchievementIcon } from '../components/achievements';
import { Avatar, Card, Empty, Segmented, useChartProps } from '../components/ui';
import { IconSearch } from '../components/icons';
import {
  addDays, dayKey, displayName, fmtDate, fmtLiters, fmtNum, fmtRelative, fmtShortDate, fmtVolume, startOfDay,
  startOfWeek, weeksBetween,
} from '../utils';

const MAX = 4;
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const DAYS_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

interface Profile {
  user: UserStats;
  beers: Beer[];
  days: Set<string>;
  perWeek12: number;
  perDay: number | null;
  favSize: string | null;
  favDay: string | null;
  favHour: string | null;
  bestDay: number;
  achievements: number;
  hours: number[];
  weekdays: number[];
}

function argmax(arr: number[]): number {
  let best = -1;
  let bestV = 0;
  arr.forEach((v, i) => {
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

function buildProfile(user: UserStats, beers: Beer[], achievements: number, now: Date): Profile {
  const days = new Map<string, number>();
  const sizes = new Map<number, number>();
  const hours = new Array(24).fill(0) as number[];
  const weekdays = new Array(7).fill(0) as number[];
  const since12 = addDays(startOfDay(now), -7 * 12);
  let last12 = 0;
  for (const b of beers) {
    sizes.set(b.volume, (sizes.get(b.volume) ?? 0) + 1);
    if (!b.date) continue;
    days.set(dayKey(b.date), (days.get(dayKey(b.date)) ?? 0) + 1);
    hours[b.date.getHours()]++;
    weekdays[(b.date.getDay() + 6) % 7]++;
    if (b.date >= since12) last12++;
  }
  const size = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
  const h = argmax(hours);
  const d = argmax(weekdays);
  return {
    user, beers, achievements, hours, weekdays,
    days: new Set(days.keys()),
    perWeek12: last12 / 12,
    perDay: days.size ? beers.length / days.size : null,
    favSize: size ? fmtVolume(size[0]) : null,
    favDay: d >= 0 ? DAYS_LONG[d] : null,
    favHour: h >= 0 ? `${String(h).padStart(2, '0')}:00` : null,
    bestDay: Math.max(0, ...days.values()),
  };
}

type Row = {
  label: string;
  hint?: string;
  value: (p: Profile) => number | null;
  format: (p: Profile) => ReactNode;
  better?: 'high' | 'low';
};

const ROWS: Row[] = [
  { label: 'Biertjes', value: (p) => p.user.beerCount, format: (p) => fmtNum(p.user.beerCount), better: 'high' },
  { label: 'Volume', value: (p) => p.user.totalCl, format: (p) => fmtLiters(p.user.totalCl), better: 'high' },
  { label: 'Drinkdagen', value: (p) => p.days.size, format: (p) => fmtNum(p.days.size), better: 'high' },
  { label: 'Biertjes per drinkdag', value: (p) => p.perDay, format: (p) => (p.perDay ? p.perDay.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '—'), better: 'high' },
  { label: 'Per week', hint: 'Gemiddeld, laatste 12 weken', value: (p) => p.perWeek12, format: (p) => p.perWeek12.toLocaleString('nl-NL', { maximumFractionDigits: 1 }), better: 'high' },
  { label: 'Drukste dag', hint: 'Meeste biertjes op één dag', value: (p) => p.bestDay, format: (p) => fmtNum(p.bestDay), better: 'high' },
  { label: 'Huidige reeks', value: (p) => p.user.currentStreak, format: (p) => `${p.user.currentStreak} d`, better: 'high' },
  { label: 'Langste reeks', value: (p) => p.user.longestStreak, format: (p) => `${p.user.longestStreak} d`, better: 'high' },
  { label: 'Achievements', value: (p) => p.achievements, format: (p) => fmtNum(p.achievements), better: 'high' },
  { label: 'Vrienden', value: (p) => p.user.friendIds.length, format: (p) => fmtNum(p.user.friendIds.length), better: 'high' },
  { label: 'Proostjes ontvangen', value: (p) => p.user.toastsReceived, format: (p) => fmtNum(p.user.toastsReceived), better: 'high' },
  { label: 'Favoriete glas', value: () => null, format: (p) => p.favSize ?? '—' },
  { label: 'Favoriete dag', value: () => null, format: (p) => p.favDay ?? '—' },
  { label: 'Favoriete uur', value: () => null, format: (p) => p.favHour ?? '—' },
  { label: 'Lid sinds', value: (p) => p.user.createdAt?.getTime() ?? null, format: (p) => fmtDate(p.user.createdAt), better: 'low' },
  { label: 'Laatste biertje', value: () => null, format: (p) => fmtRelative(p.user.lastBeer) },
];

function winners(row: Row, profiles: Profile[]): Set<number> {
  if (!row.better || profiles.length < 2) return new Set();
  const vals = profiles.map(row.value);
  const valid = vals.filter((v): v is number => v !== null);
  if (valid.length < 2) return new Set();
  const best = row.better === 'high' ? Math.max(...valid) : Math.min(...valid);
  if (valid.every((v) => v === best)) return new Set();
  return new Set(vals.flatMap((v, i) => (v === best ? [i] : [])));
}

export default function Compare() {
  const { data, today: now } = useData();
  const chart = useChartProps();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'week' | 'total'>('week');
  const [onlyDiff, setOnlyDiff] = useState(true);

  const uids = useMemo(
    () => [...new Set((params.get('u') ?? '').split(',').filter((id) => data!.usersById.has(id)))].slice(0, MAX),
    [params, data],
  );
  const setUids = (list: string[]) => setParams(list.length ? { u: list.join(',') } : {}, { replace: true });

  const allAch = useMemo(() => achievementsFor(data!), [data]);

  const profiles = useMemo(() => {
    const byUser = new Map<string, Beer[]>();
    for (const b of data!.beers) if (uids.includes(b.userId)) byUser.set(b.userId, [...(byUser.get(b.userId) ?? []), b]);
    return uids.map((id) => buildProfile(data!.usersById.get(id)!, byUser.get(id) ?? [], allAch.get(id)?.unlocked ?? 0, now));
  }, [uids, data, allAch, now]);

  const colors = chart.colors.series;
  const key = (i: number) => `u${i}`;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return data!.users
      .filter((u) => !uids.includes(u.uid) && `${u.username} ${u.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, data, uids]);

  const suggestion = useMemo(() => {
    const since = addDays(startOfDay(now), -29);
    const counts = new Map<string, number>();
    for (const b of data!.beers) if (b.date && b.date >= since) counts.set(b.userId, (counts.get(b.userId) ?? 0) + 1);
    return [...counts.entries()].filter(([id]) => data!.usersById.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  }, [data, now]);

  const timeline = useMemo(() => {
    if (!profiles.length) return [];
    if (mode === 'week') {
      const weeks = 26;
      const start = addDays(startOfWeek(now), -7 * (weeks - 1));
      const rows = Array.from({ length: weeks }, (_, i) => ({ label: fmtShortDate(addDays(start, i * 7)) } as Record<string, string | number>));
      profiles.forEach((p, pi) => {
        rows.forEach((r) => (r[key(pi)] = 0));
        for (const b of p.beers) {
          if (!b.date || b.date < start) continue;
          const i = weeksBetween(start, startOfWeek(b.date));
          if (i >= 0 && i < weeks) rows[i][key(pi)] = Number(rows[i][key(pi)]) + 1;
        }
      });
      return rows;
    }
    // Totaal over tijd, per week, vanaf het eerste biertje van de groep.
    const firsts = profiles.map((p) => p.user.firstBeer?.getTime()).filter((t): t is number => !!t);
    if (!firsts.length) return [];
    const start = startOfWeek(new Date(Math.min(...firsts)));
    const weeks = Math.max(1, weeksBetween(start, startOfWeek(now)) + 1);
    const step = Math.ceil(weeks / 60);
    const rows: Record<string, string | number>[] = [];
    for (let i = 0; i < weeks; i += step) {
      const end = addDays(start, (i + step) * 7);
      const row: Record<string, string | number> = { label: fmtShortDate(addDays(start, i * 7)) };
      profiles.forEach((p, pi) => (row[key(pi)] = p.beers.filter((b) => b.date && b.date < end).length));
      rows.push(row);
    }
    return rows;
  }, [profiles, mode, now]);

  const hourly = useMemo(
    () => Array.from({ length: 24 }, (_, h) => {
      const row: Record<string, string | number> = { label: String(h).padStart(2, '0') };
      profiles.forEach((p, pi) => {
        const total = p.beers.filter((b) => b.date).length;
        row[key(pi)] = total ? Math.round((p.hours[h] / total) * 1000) / 10 : 0;
      });
      return row;
    }),
    [profiles],
  );

  const weekly = useMemo(
    () => DAYS.map((label, d) => {
      const row: Record<string, string | number> = { label };
      profiles.forEach((p, pi) => {
        const total = p.beers.filter((b) => b.date).length;
        row[key(pi)] = total ? Math.round((p.weekdays[d] / total) * 1000) / 10 : 0;
      });
      return row;
    }),
    [profiles],
  );

  const together = useMemo(() => {
    if (profiles.length < 2) return null;
    const [first, ...rest] = profiles;
    const shared = [...first.days].filter((d) => rest.every((p) => p.days.has(d)));
    const mutual = first.user.friendIds.filter((id) => rest.every((p) => p.user.friendIds.includes(id)));
    const areFriends = profiles.every((a) => profiles.every((b) => a === b || a.user.friendIds.includes(b.user.uid)));
    return { sharedDays: shared.length, lastShared: shared.sort().at(-1) ?? null, mutual, areFriends };
  }, [profiles]);

  const achRows = useMemo(() => {
    return ACHIEVEMENTS.filter((def) => !UNKNOWN_REASON[def.id])
      .map((def) => ({ def, states: profiles.map((p) => allAch.get(p.user.uid)?.byId.get(def.id) === 'unlocked') }))
      .filter((r) => !onlyDiff || (r.states.some(Boolean) && !r.states.every(Boolean)));
  }, [profiles, allAch, onlyDiff]);

  const nameOf = (i: number) => (profiles[i] ? displayName(profiles[i].user) : '');
  const tooltipFormatter = (unit: string) => (v: number, name: string) => [`${v.toLocaleString('nl-NL')}${unit}`, nameOf(Number(name.slice(1)))];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Vergelijken</h1>
          <p className="muted">Zet tot {MAX} gebruikers naast elkaar.</p>
        </div>
      </header>

      <div className="cmp-picker">
        {profiles.map((p, i) => (
          <span key={p.user.uid} className="cmp-chip" style={{ ['--c' as string]: colors[i] }}>
            <Avatar url={p.user.photoUrl} name={displayName(p.user)} size={26} />
            <Link to={`/users/${p.user.uid}`}>{displayName(p.user)}</Link>
            <button onClick={() => setUids(uids.filter((id) => id !== p.user.uid))} aria-label={`${displayName(p.user)} weghalen`}>×</button>
          </span>
        ))}
        {uids.length < MAX && (
          <div className="cmp-add">
            <label className="search">
              <IconSearch />
              <input
                type="search"
                placeholder={uids.length ? 'Nog iemand toevoegen' : 'Zoek een gebruiker'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Zoek een gebruiker om te vergelijken"
              />
            </label>
            {candidates.length > 0 && (
              <ul className="cmp-suggest">
                {candidates.map((u) => (
                  <li key={u.uid}>
                    <button onClick={() => { setUids([...uids, u.uid]); setQuery(''); }}>
                      <Avatar url={u.photoUrl} name={displayName(u)} size={26} />
                      <span>{displayName(u)}</span>
                      <span className="muted small">{fmtNum(u.beerCount)} biertjes</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {profiles.length < 2 ? (
        <Card>
          <Empty>
            {profiles.length === 0 ? 'Kies minstens twee gebruikers om te vergelijken.' : 'Voeg nog iemand toe om te vergelijken.'}
            {profiles.length === 0 && suggestion.length >= 2 && (
              <div className="cmp-empty-action">
                <button className="btn primary" onClick={() => setUids(suggestion)}>Vergelijk de top {suggestion.length} van deze maand</button>
              </div>
            )}
          </Empty>
        </Card>
      ) : (
        <>
          {together && (
            <dl className="facts cmp-together">
              <div><dt>Samen gedronken</dt><dd>{fmtNum(together.sharedDays)} {together.sharedDays === 1 ? 'dag' : 'dagen'}</dd></div>
              <div><dt>Laatst samen</dt><dd>{together.lastShared ? fmtShortDate(new Date(together.lastShared + 'T00:00:00')) : '—'}</dd></div>
              <div><dt>Onderling bevriend</dt><dd>{together.areFriends ? 'Ja' : 'Nee'}</dd></div>
              <div><dt>Gemeenschappelijke vrienden</dt><dd>{fmtNum(together.mutual.length)}</dd></div>
            </dl>
          )}

          <Card title="Naast elkaar" hint="De beste waarde per rij is gemarkeerd">
            <div className="table-wrap">
              <table className="table compact cmp-table">
                <thead>
                  <tr>
                    <th />
                    {profiles.map((p, i) => (
                      <th key={p.user.uid} className="num">
                        <span className="cmp-head" style={{ ['--c' as string]: colors[i] }}>{displayName(p.user)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const win = winners(row, profiles);
                    return (
                      <tr key={row.label} className="no-hover">
                        <td>
                          {row.label}
                          {row.hint && <span className="muted small block">{row.hint}</span>}
                        </td>
                        {profiles.map((p, i) => (
                          <td key={p.user.uid} className={win.has(i) ? 'num cmp-win' : 'num'} style={{ ['--c' as string]: colors[i] }}>
                            {row.format(p)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title={mode === 'week' ? 'Biertjes per week' : 'Totaal aantal biertjes over tijd'}
            actions={
              <Segmented
                label="Weergave"
                value={mode}
                onChange={setMode}
                options={[{ value: 'week', label: 'Per week' }, { value: 'total', label: 'Totaal' }]}
              />
            }
          >
            <Legend profiles={profiles} colors={colors} />
            <div className="chart-lg">
              <ResponsiveContainer>
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid {...chart.grid} />
                  <XAxis dataKey="label" {...chart.axis} minTickGap={28} />
                  <YAxis {...chart.axis} allowDecimals={false} />
                  <Tooltip {...chart.tooltip} formatter={tooltipFormatter('')} />
                  {profiles.map((p, i) => (
                    <Line key={p.user.uid} dataKey={key(i)} stroke={colors[i]} strokeWidth={2.2} dot={false} type="monotone" />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid-2">
            <Card title="Op welk uur" hint="Deel van ieders biertjes per uur van de dag">
              <Legend profiles={profiles} colors={colors} />
              <div className="chart-md">
                <ResponsiveContainer>
                  <LineChart data={hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="label" {...chart.axis} interval={2} />
                    <YAxis {...chart.axis} unit="%" />
                    <Tooltip {...chart.tooltip} formatter={tooltipFormatter('%')} labelFormatter={(l) => `${l}:00`} />
                    {profiles.map((p, i) => (
                      <Line key={p.user.uid} dataKey={key(i)} stroke={colors[i]} strokeWidth={2} dot={false} type="monotone" />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Op welke dag" hint="Deel van ieders biertjes per dag van de week">
              <Legend profiles={profiles} colors={colors} />
              <div className="chart-md">
                <ResponsiveContainer>
                  <BarChart data={weekly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="label" {...chart.axis} />
                    <YAxis {...chart.axis} unit="%" />
                    <Tooltip {...chart.tooltip} formatter={tooltipFormatter('%')} />
                    {profiles.map((p, i) => (
                      <Bar key={p.user.uid} dataKey={key(i)} fill={colors[i]} radius={[6, 6, 6, 6]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card
            title="Achievements"
            hint={onlyDiff ? 'Alleen achievements die niet iedereen heeft' : 'Alle achievements die we kunnen bepalen'}
            actions={
              <Segmented
                label="Toon"
                value={onlyDiff ? 'diff' : 'all'}
                onChange={(v) => setOnlyDiff(v === 'diff')}
                options={[{ value: 'diff', label: 'Verschillen' }, { value: 'all', label: 'Alles' }]}
              />
            }
          >
            {achRows.length ? (
              <div className="table-wrap tall">
                <table className="table compact cmp-ach">
                  <thead>
                    <tr>
                      <th>Achievement</th>
                      {profiles.map((p, i) => (
                        <th key={p.user.uid} className="center">
                          <span className="cmp-head" style={{ ['--c' as string]: colors[i] }}>{displayName(p.user)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {achRows.map(({ def, states }) => (
                      <tr key={def.id} className="no-hover">
                        <td>
                          <span className="cmp-ach-name" title={def.description}>
                            <AchievementIcon def={def} size={18} /> {def.title}
                            <span className="muted small"> {def.description}</span>
                          </span>
                        </td>
                        {states.map((s, i) => (
                          <td key={i} className="center">
                            {s ? <span className="cmp-check" style={{ ['--c' as string]: colors[i] }} aria-label="Behaald">✓</span> : <span className="muted" aria-label="Niet behaald">–</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>Iedereen heeft precies dezelfde achievements.</Empty>}
          </Card>

          {together && together.mutual.length > 0 && (
            <Card title="Gemeenschappelijke vrienden">
              <ul className="people">
                {together.mutual.map((id) => data!.usersById.get(id)).filter((u) => u !== undefined).map((u) => (
                  <li key={u.uid}>
                    <Link to={`/users/${u.uid}`} className="lb-user">
                      <Avatar url={u.photoUrl} name={displayName(u)} size={30} />
                      <span className="lb-name">{displayName(u)}</span>
                    </Link>
                    <button className="btn sm" onClick={() => uids.length < MAX && setUids([...uids, u.uid])} disabled={uids.length >= MAX}>
                      Toevoegen aan vergelijking
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Legend({ profiles, colors }: { profiles: Profile[]; colors: string[] }) {
  return (
    <div className="cmp-legend">
      {profiles.map((p, i) => (
        <span key={p.user.uid} style={{ ['--c' as string]: colors[i] }}>{displayName(p.user)}</span>
      ))}
    </div>
  );
}
