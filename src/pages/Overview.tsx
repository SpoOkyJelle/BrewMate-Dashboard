import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData, type Dataset } from '../data';
import { Avatar, Card, Empty, Segmented, StatTile, useChartProps } from '../components/ui';
import {
  addDays, dayKey, displayName, fmtDate, fmtLiters, fmtNum, fmtRelative, fmtVolume, startOfDay, startOfWeek,
} from '../utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function computeKpis(data: Dataset) {
  const today = startOfDay(new Date());
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);

  const beers7 = data.beers.filter((b) => b.date && b.date >= d7);
  const beers30 = data.beers.filter((b) => b.date && b.date >= d30);
  const active7 = new Set(beers7.map((b) => b.userId)).size;
  const active30 = new Set(beers30.map((b) => b.userId)).size;
  const opened7 = data.users.filter((u) => u.lastLogin && u.lastLogin >= d7).length;
  const new30 = data.users.filter((u) => u.createdAt && u.createdAt >= d30).length;
  const new7 = data.users.filter((u) => u.createdAt && u.createdAt >= d7).length;
  const totalCl = data.beers.reduce((s, b) => s + b.volume, 0);
  const everLogged = data.users.filter((u) => u.beerCount > 0).length;

  return { beers7: beers7.length, beers30: beers30.length, active7, active30, opened7, new7, new30, totalCl, everLogged };
}

function dailySeries(data: Dataset, days: number) {
  const today = startOfDay(new Date());
  const start = addDays(today, -(days - 1));
  const buckets = new Map<string, { beers: number; users: Set<string> }>();
  for (let i = 0; i < days; i++) buckets.set(dayKey(addDays(start, i)), { beers: 0, users: new Set() });
  for (const b of data.beers) {
    if (!b.date || b.date < start) continue;
    const bucket = buckets.get(dayKey(b.date));
    if (bucket) {
      bucket.beers++;
      bucket.users.add(b.userId);
    }
  }
  return [...buckets.entries()].map(([key, v]) => {
    const d = new Date(key + 'T00:00:00');
    return {
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      beers: v.beers,
      drinkers: v.users.size,
    };
  });
}

function signupSeries(data: Dataset, weeks: number) {
  const thisWeek = startOfWeek(new Date());
  const start = addDays(thisWeek, -7 * (weeks - 1));
  const counts = new Array(weeks).fill(0);
  let before = 0;
  for (const u of data.users) {
    if (!u.createdAt) continue;
    if (u.createdAt < start) {
      before++;
      continue;
    }
    const idx = Math.floor((startOfWeek(u.createdAt).getTime() - start.getTime()) / (7 * 86_400_000) + 0.5);
    if (idx >= 0 && idx < weeks) counts[idx]++;
  }
  let total = before;
  return counts.map((n, i) => {
    total += n;
    return {
      label: addDays(start, i * 7).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      newUsers: n,
      totalUsers: total,
    };
  });
}

export default function Overview() {
  const { data } = useData();
  const chart = useChartProps();
  const [range, setRange] = useState<30 | 90 | 365>(30);
  const [topRange, setTopRange] = useState<'30' | 'all'>('30');

  const kpis = useMemo(() => computeKpis(data!), [data]);
  const daily = useMemo(() => dailySeries(data!, range), [data, range]);
  const signups = useMemo(() => signupSeries(data!, 26), [data]);

  const sizes = useMemo(() => {
    const m = new Map<number, number>();
    data!.beers.forEach((b) => m.set(b.volume, (m.get(b.volume) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([vol, n]) => ({ label: fmtVolume(vol), beers: n }));
  }, [data]);

  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0'), beers: 0 }));
    data!.beers.forEach((b) => b.date && arr[b.date.getHours()].beers++);
    return arr;
  }, [data]);

  const byWeekday = useMemo(() => {
    const arr = WEEKDAYS.map((label) => ({ label, beers: 0 }));
    data!.beers.forEach((b) => b.date && arr[(b.date.getDay() + 6) % 7].beers++);
    return arr;
  }, [data]);

  const top = useMemo(() => {
    const since = topRange === '30' ? addDays(startOfDay(new Date()), -29) : null;
    const counts = new Map<string, { beers: number; cl: number }>();
    for (const b of data!.beers) {
      if (since && (!b.date || b.date < since)) continue;
      const c = counts.get(b.userId) ?? { beers: 0, cl: 0 };
      c.beers++;
      c.cl += b.volume;
      counts.set(b.userId, c);
    }
    return [...counts.entries()]
      .map(([uid, c]) => ({ user: data!.usersById.get(uid), uid, ...c }))
      .filter((r) => r.user)
      .sort((a, b) => b.beers - a.beers)
      .slice(0, 10);
  }, [data, topRange]);

  const recentUsers = useMemo(
    () => [...data!.users].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 8),
    [data],
  );

  if (!data) return null;
  const { colors } = chart;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Overview</h1>
      </div>

      <div className="tiles">
        <StatTile label="Total users" value={fmtNum(data.users.length)} sub={`+${kpis.new7} this week · +${kpis.new30} in 30 days`} />
        <StatTile label="Active drinkers (7 days)" value={fmtNum(kpis.active7)} sub={`${fmtNum(kpis.active30)} in last 30 days`} />
        <StatTile label="Opened app (7 days)" value={fmtNum(kpis.opened7)} sub="based on last login" />
        <StatTile label="Beers logged" value={fmtNum(data.beers.length)} sub={`${fmtNum(kpis.beers7)} this week · ${fmtNum(kpis.beers30)} in 30 days`} />
        <StatTile label="Total volume" value={fmtLiters(kpis.totalCl)} sub={`avg ${data.beers.length ? fmtVolume(Math.round(kpis.totalCl / data.beers.length)) : '—'} per beer`} />
        <StatTile
          label="Users who logged a beer"
          value={fmtNum(kpis.everLogged)}
          sub={data.users.length ? `${Math.round((kpis.everLogged / data.users.length) * 100)}% of all users` : undefined}
        />
        <StatTile label="Friendships" value={fmtNum(data.friendshipCount)} sub={`${fmtNum(data.pendingRequests)} pending requests`} />
        <StatTile
          label="Avg beers per drinker"
          value={kpis.everLogged ? (data.beers.length / kpis.everLogged).toFixed(1) : '—'}
          sub="all time"
        />
      </div>

      <Card
        title="Beers logged per day"
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1y' }]}
          />
        }
      >
        <div className="chart-lg">
          <ResponsiveContainer>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid {...chart.grid} />
              <XAxis dataKey="label" {...chart.axis} minTickGap={24} />
              <YAxis {...chart.axis} allowDecimals={false} />
              <Tooltip {...chart.tooltip} />
              <Bar dataKey="beers" name="Beers" fill={colors.accent} radius={[3, 3, 0, 0]} />
              <Bar dataKey="drinkers" name="Unique drinkers" fill={colors.accent2} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="User growth (last 26 weeks)">
          <div className="chart-md">
            <ResponsiveContainer>
              <ComposedChart data={signups} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={24} />
                <YAxis yAxisId="new" {...chart.axis} allowDecimals={false} />
                <YAxis yAxisId="total" orientation="right" {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar yAxisId="new" dataKey="newUsers" name="New users" fill={colors.accent} radius={[3, 3, 0, 0]} />
                <Line yAxisId="total" dataKey="totalUsers" name="Total users" stroke={colors.accent2} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Glass sizes">
          {sizes.length ? (
            <div className="chart-md">
              <ResponsiveContainer>
                <BarChart data={sizes} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid {...chart.grid} horizontal={false} vertical />
                  <XAxis type="number" {...chart.axis} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" {...chart.axis} width={56} />
                  <Tooltip {...chart.tooltip} />
                  <Bar dataKey="beers" name="Beers" fill={colors.accent} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </Card>

        <Card title="When do people drink? (hour of day)">
          <div className="chart-md">
            <ResponsiveContainer>
              <BarChart data={byHour} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} interval={2} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} labelFormatter={(l) => `${l}:00 – ${l}:59`} />
                <Bar dataKey="beers" name="Beers" fill={colors.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Day of the week">
          <div className="chart-md">
            <ResponsiveContainer>
              <BarChart data={byWeekday} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="beers" name="Beers" fill={colors.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Top drinkers"
          actions={
            <Segmented
              value={topRange}
              onChange={setTopRange}
              options={[{ value: '30', label: '30 days' }, { value: 'all', label: 'All time' }]}
            />
          }
        >
          {top.length ? (
            <ol className="rank-list">
              {top.map((r, i) => (
                <li key={r.uid}>
                  <span className="rank">{i + 1}</span>
                  <Link to={`/users/${r.uid}`} className="user-cell">
                    <Avatar url={r.user!.photoUrl} name={displayName(r.user!)} size={28} />
                    <span>{displayName(r.user!)}</span>
                  </Link>
                  <span className="num">{fmtNum(r.beers)}</span>
                  <span className="muted small num">{fmtLiters(r.cl)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty>No beers in this period</Empty>}
        </Card>

        <Card title="Newest users" actions={<Link to="/users" className="small">View all →</Link>}>
          <ul className="rank-list">
            {recentUsers.map((u) => (
              <li key={u.uid}>
                <Link to={`/users/${u.uid}`} className="user-cell">
                  <Avatar url={u.photoUrl} name={displayName(u)} size={28} />
                  <span>{displayName(u)}</span>
                </Link>
                <span className="muted small" title={fmtDate(u.createdAt)}>{fmtRelative(u.createdAt)}</span>
                <span className="num small">{fmtNum(u.beerCount)} 🍺</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
