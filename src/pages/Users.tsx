import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, type UserStats } from '../data';
import { achievementsFor, type UserAchievements } from '../achievements';
import { Avatar, Card } from '../components/ui';
import { IconDownload, IconSearch } from '../components/icons';
import { addDays, displayName, fmtDate, fmtLiters, fmtNum, fmtRelative, startOfDay } from '../utils';

type SortKey = 'name' | 'createdAt' | 'lastLogin' | 'beerCount' | 'totalCl' | 'lastBeer' | 'currentStreak' | 'friends' | 'achievements';
type Filter = 'all' | 'active' | 'inactive' | 'never' | 'new';
type Status = 'drinking' | 'active' | 'new' | 'inactive' | 'never';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Gebruiker' },
  { key: 'lastBeer', label: 'Laatste biertje' },
  { key: 'beerCount', label: 'Biertjes', numeric: true },
  { key: 'totalCl', label: 'Volume', numeric: true },
  { key: 'currentStreak', label: 'Reeks', numeric: true },
  { key: 'friends', label: 'Vrienden', numeric: true },
  { key: 'achievements', label: 'Achievements', numeric: true },
  { key: 'createdAt', label: 'Lid sinds' },
  { key: 'lastLogin', label: 'Laatst ingelogd' },
];

const STATUS_LABEL: Record<Status, string> = {
  drinking: 'Drinkt nu',
  active: 'Actief',
  new: 'Nieuw',
  inactive: 'Slapend',
  never: 'Nooit gelogd',
};

function statusOf(u: UserStats, now: Date): Status {
  if (u.lastBeer && now.getTime() - u.lastBeer.getTime() < 3_600_000) return 'drinking';
  if (u.lastBeer && u.lastBeer >= addDays(startOfDay(now), -29)) return 'active';
  if (u.createdAt && u.createdAt >= addDays(startOfDay(now), -6)) return 'new';
  return u.beerCount ? 'inactive' : 'never';
}

function sortValue(u: UserStats, key: SortKey, ach: Map<string, UserAchievements>): number | string {
  switch (key) {
    case 'achievements': return ach.get(u.uid)?.unlocked ?? 0;
    case 'name': return displayName(u).toLowerCase();
    case 'createdAt': return u.createdAt?.getTime() ?? 0;
    case 'lastLogin': return u.lastLogin?.getTime() ?? 0;
    case 'lastBeer': return u.lastBeer?.getTime() ?? 0;
    case 'friends': return u.friendIds.length;
    default: return u[key];
  }
}

function toCsv(users: UserStats[]): string {
  const header = ['uid', 'gebruikersnaam', 'email', 'lid_sinds', 'laatst_ingelogd', 'biertjes', 'liters', 'laatste_biertje', 'reeks', 'langste_reeks', 'vrienden'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = users.map((u) => [
    u.uid, u.username, u.email, u.createdAt?.toISOString(), u.lastLogin?.toISOString(), u.beerCount,
    (u.totalCl / 100).toFixed(2).replace('.', ','), u.lastBeer?.toISOString(), u.currentStreak, u.longestStreak, u.friendIds.length,
  ]);
  // Puntkomma, zodat Nederlandse Excel het direct goed opent.
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\n');
}

export default function Users() {
  const { data, now, events } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastBeer', desc: true });

  const freshUids = useMemo(() => new Set(events.filter((e) => e.kind === 'signup').map((e) => e.uid)), [events]);

  const ach = useMemo(() => achievementsFor(data!), [data]);
  const withStatus = useMemo(() => data!.users.map((u) => ({ u, status: statusOf(u, now) })), [data, now]);

  const counts = useMemo(() => {
    const c = { all: withStatus.length, active: 0, inactive: 0, never: 0, new: 0 };
    withStatus.forEach(({ status }) => {
      if (status === 'drinking' || status === 'active') c.active++;
      else c[status]++;
    });
    return c;
  }, [withStatus]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = withStatus.filter(({ u, status }) => {
      if (q && !`${u.username} ${u.email} ${u.uid}`.toLowerCase().includes(q)) return false;
      if (filter === 'active') return status === 'active' || status === 'drinking';
      if (filter !== 'all') return status === filter;
      return true;
    });
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const va = sortValue(a.u, sort.key, ach);
      const vb = sortValue(b.u, sort.key, ach);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [withStatus, query, filter, sort, ach]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows.map((r) => r.u))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brewmate-gebruikers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Iedereen' },
    { value: 'active', label: 'Actief' },
    { value: 'new', label: 'Nieuw' },
    { value: 'inactive', label: 'Slapend' },
    { value: 'never', label: 'Nooit gelogd' },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Gebruikers</h1>
          <p className="muted">
            Actief betekent een biertje gelogd in de laatste 30 dagen. Slapend: langer geleden.
          </p>
        </div>
        <button className="btn" onClick={exportCsv}><IconDownload /> Exporteren als CSV</button>
      </header>

      <div className="chips" role="radiogroup" aria-label="Filter">
        {filters.map((f) => (
          <button
            key={f.value}
            role="radio"
            aria-checked={filter === f.value}
            className={filter === f.value ? 'chip active' : 'chip'}
            onClick={() => setFilter(f.value)}
          >
            {f.label} <span className="chip-count">{fmtNum(counts[f.value])}</span>
          </button>
        ))}
      </div>

      <Card>
        <label className="search">
          <IconSearch />
          <input
            type="search"
            placeholder="Zoek op naam, e-mail of UID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Zoek gebruikers"
          />
          {query && <span className="muted small">{fmtNum(rows.length)} gevonden</span>}
        </label>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={c.numeric ? 'num' : ''}
                    aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                  >
                    <button onClick={() => toggleSort(c.key)}>
                      {c.numeric && <span className="sort" aria-hidden>{sort.key === c.key ? (sort.desc ? '↓' : '↑') : ''}</span>}
                      {c.label}
                      {!c.numeric && <span className="sort" aria-hidden>{sort.key === c.key ? (sort.desc ? '↓' : '↑') : ''}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, status }) => (
                <tr
                  key={u.uid}
                  className={freshUids.has(u.uid) ? 'fresh' : ''}
                  onClick={() => navigate(`/users/${u.uid}`)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/users/${u.uid}`)}
                >
                  <td>
                    <div className="user-cell">
                      <span className="avatar-wrap">
                        <Avatar url={u.photoUrl} name={displayName(u)} size={34} />
                        {status === 'drinking' && <span className="avatar-dot" title="Biertje in het afgelopen uur" />}
                      </span>
                      <div className="user-text">
                        <div className="user-name">
                          {u.username || <span className="muted">Geen gebruikersnaam</span>}
                          <span className={`status s-${status}`}>{STATUS_LABEL[status]}</span>
                        </div>
                        <div className="muted small">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td title={u.lastBeer?.toLocaleString('nl-NL')}>{fmtRelative(u.lastBeer, now)}</td>
                  <td className="num strong">{fmtNum(u.beerCount)}</td>
                  <td className="num">{fmtLiters(u.totalCl)}</td>
                  <td className="num">
                    {u.currentStreak > 0 ? `${u.currentStreak} d` : '—'}
                    <span className="muted small"> / {u.longestStreak}</span>
                  </td>
                  <td className="num">{u.friendIds.length || '—'}</td>
                  <td className="num">{ach.get(u.uid)?.unlocked ?? 0}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td title={u.lastLogin?.toLocaleString('nl-NL')}>{fmtRelative(u.lastLogin, now)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr className="no-hover">
                  <td colSpan={COLUMNS.length}>
                    <div className="empty">Geen gebruikers gevonden. Probeer een andere zoekterm of filter.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
