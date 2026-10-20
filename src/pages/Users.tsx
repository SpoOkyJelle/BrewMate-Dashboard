import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, type UserStats } from '../data';
import { Avatar, Card, Segmented } from '../components/ui';
import { addDays, displayName, fmtDate, fmtLiters, fmtNum, fmtRelative, startOfDay } from '../utils';

type SortKey = 'name' | 'createdAt' | 'lastLogin' | 'beerCount' | 'totalCl' | 'lastBeer' | 'currentStreak' | 'friends';
type Filter = 'all' | 'active' | 'inactive' | 'never';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'User' },
  { key: 'createdAt', label: 'Joined' },
  { key: 'lastLogin', label: 'Last seen' },
  { key: 'beerCount', label: 'Beers', numeric: true },
  { key: 'totalCl', label: 'Volume', numeric: true },
  { key: 'lastBeer', label: 'Last beer' },
  { key: 'currentStreak', label: 'Streak', numeric: true },
  { key: 'friends', label: 'Friends', numeric: true },
];

function sortValue(u: UserStats, key: SortKey): number | string {
  switch (key) {
    case 'name': return displayName(u).toLowerCase();
    case 'createdAt': return u.createdAt?.getTime() ?? 0;
    case 'lastLogin': return u.lastLogin?.getTime() ?? 0;
    case 'lastBeer': return u.lastBeer?.getTime() ?? 0;
    case 'friends': return u.friendIds.length;
    default: return u[key];
  }
}

function toCsv(users: UserStats[]): string {
  const header = ['uid', 'username', 'email', 'joined', 'last_login', 'beers', 'liters', 'last_beer', 'current_streak', 'longest_streak', 'friends'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = users.map((u) => [
    u.uid, u.username, u.email, u.createdAt?.toISOString(), u.lastLogin?.toISOString(), u.beerCount,
    (u.totalCl / 100).toFixed(2), u.lastBeer?.toISOString(), u.currentStreak, u.longestStreak, u.friendIds.length,
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export default function Users() {
  const { data } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'createdAt', desc: true });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const d30 = addDays(startOfDay(new Date()), -29);
    const list = data!.users.filter((u) => {
      if (q && !`${u.username} ${u.email} ${u.uid}`.toLowerCase().includes(q)) return false;
      if (filter === 'active') return !!u.lastBeer && u.lastBeer >= d30;
      if (filter === 'inactive') return !!u.lastBeer && u.lastBeer < d30;
      if (filter === 'never') return u.beerCount === 0;
      return true;
    });
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [data, query, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brewmate-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Users <span className="muted">({fmtNum(rows.length)})</span></h1>
      </div>

      <Card>
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search name, email or UID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active 30d' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'never', label: 'Never logged' },
            ]}
          />
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : ''} onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key && <span className="sort">{sort.desc ? ' ↓' : ' ↑'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.uid} onClick={() => navigate(`/users/${u.uid}`)}>
                  <td>
                    <div className="user-cell">
                      <Avatar url={u.photoUrl} name={displayName(u)} />
                      <div>
                        <div>{u.username || <span className="muted">(no username)</span>}</div>
                        <div className="muted small">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td title={fmtDate(u.createdAt)}>{fmtDate(u.createdAt)}</td>
                  <td title={u.lastLogin?.toLocaleString()}>{fmtRelative(u.lastLogin)}</td>
                  <td className="num">{fmtNum(u.beerCount)}</td>
                  <td className="num">{fmtLiters(u.totalCl)}</td>
                  <td title={u.lastBeer?.toLocaleString()}>{fmtRelative(u.lastBeer)}</td>
                  <td className="num">
                    {u.currentStreak} <span className="muted small">/ {u.longestStreak}</span>
                  </td>
                  <td className="num">{u.friendIds.length}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr className="no-hover">
                  <td colSpan={COLUMNS.length} className="empty">No users match</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
