import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../data';
import { Avatar, Card, Empty, StatTile, useChartProps } from '../components/ui';
import {
  addDays, dayKey, displayName, fmtDate, fmtDateTime, fmtLiters, fmtNum, fmtRelative, fmtVolume, startOfWeek,
} from '../utils';

const WEEKS = 26;

function Pref({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="pref">
      <span>{label}</span>
      <span className={value === true ? 'pill on' : value === false ? 'pill off' : 'pill'}>
        {value === true ? 'On' : value === false ? 'Off' : 'Not set'}
      </span>
    </div>
  );
}

export default function UserDetail() {
  const { uid = '' } = useParams();
  const { data } = useData();
  const chart = useChartProps();
  const user = data!.usersById.get(uid);

  const beers = useMemo(() => data!.beers.filter((b) => b.userId === uid), [data, uid]);

  const weekly = useMemo(() => {
    const start = addDays(startOfWeek(new Date()), -7 * (WEEKS - 1));
    const rows = Array.from({ length: WEEKS }, (_, i) => ({
      label: addDays(start, i * 7).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      beers: 0,
    }));
    for (const b of beers) {
      if (!b.date || b.date < start) continue;
      const idx = Math.round((startOfWeek(b.date).getTime() - start.getTime()) / (7 * 86_400_000));
      if (idx >= 0 && idx < WEEKS) rows[idx].beers++;
    }
    return rows;
  }, [beers]);

  const sizes = useMemo(() => {
    const m = new Map<number, number>();
    beers.forEach((b) => m.set(b.volume, (m.get(b.volume) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => ({ label: fmtVolume(v), beers: n }));
  }, [beers]);

  const activeDays = useMemo(() => new Set(beers.filter((b) => b.date).map((b) => dayKey(b.date!))).size, [beers]);

  if (!user) {
    return (
      <div className="page">
        <Link to="/users" className="back">← Users</Link>
        <Card><Empty>User not found. They may have deleted their account.</Empty></Card>
      </div>
    );
  }

  const friends = user.friendIds.map((id) => data!.usersById.get(id)).filter((f) => !!f);
  const { colors } = chart;

  return (
    <div className="page">
      <Link to="/users" className="back">← Users</Link>

      <div className="profile-head card">
        <Avatar url={user.photoUrl} name={displayName(user)} size={72} />
        <div className="profile-info">
          <h1>{user.username || '(no username)'}</h1>
          <div className="muted">{user.email}</div>
          <div className="muted small mono" title="User ID">
            {user.uid}{' '}
            <button className="link-btn" onClick={() => navigator.clipboard.writeText(user.uid)}>copy</button>
          </div>
        </div>
        <div className="profile-meta">
          <div><span className="muted small">Joined</span><br />{fmtDate(user.createdAt)}</div>
          <div><span className="muted small">Last seen</span><br />{fmtRelative(user.lastLogin)}</div>
          <div><span className="muted small">Last beer</span><br />{fmtRelative(user.lastBeer)}</div>
        </div>
      </div>

      <div className="tiles">
        <StatTile label="Beers logged" value={fmtNum(user.beerCount)} sub={user.firstBeer ? `since ${fmtDate(user.firstBeer)}` : undefined} />
        <StatTile label="Total volume" value={fmtLiters(user.totalCl)} />
        <StatTile label="Drinking days" value={fmtNum(activeDays)} sub={activeDays ? `${(user.beerCount / activeDays).toFixed(1)} beers per day` : undefined} />
        <StatTile label="Current streak" value={`${user.currentStreak} d`} sub={`longest ${user.longestStreak} d`} />
        <StatTile label="Login streak" value={`${user.loginStreak} d`} />
        <StatTile label="Friends" value={fmtNum(friends.length)} />
        <StatTile label="Toasts received" value={fmtNum(user.toastsReceived)} />
      </div>

      <div className="grid-2">
        <Card title={`Beers per week (last ${WEEKS} weeks)`}>
          <div className="chart-md">
            <ResponsiveContainer>
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={24} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="beers" name="Beers" fill={colors.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
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

        <Card title={`Recent beers${beers.length > 50 ? ' (latest 50)' : ''}`}>
          {beers.length ? (
            <div className="table-wrap tall">
              <table className="table compact">
                <thead>
                  <tr><th>When</th><th className="num">Size</th><th className="num">Toasts</th><th>Location</th></tr>
                </thead>
                <tbody>
                  {beers.slice(0, 50).map((b) => (
                    <tr key={b.id} className="no-hover">
                      <td>{fmtDateTime(b.date)}</td>
                      <td className="num">{fmtVolume(b.volume)}</td>
                      <td className="num">{b.toasts || ''}</td>
                      <td className="muted small">{b.hasLocation ? 'Shared' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No beers logged yet</Empty>}
        </Card>

        <div className="stack">
          <Card title={`Friends (${friends.length})`}>
            {friends.length ? (
              <ul className="rank-list">
                {friends.map((f) => (
                  <li key={f!.uid}>
                    <Link to={`/users/${f!.uid}`} className="user-cell">
                      <Avatar url={f!.photoUrl} name={displayName(f!)} size={28} />
                      <span>{displayName(f!)}</span>
                    </Link>
                    <span className="num small">{fmtNum(f!.beerCount)} 🍺</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No friends yet</Empty>}
          </Card>

          <Card title="App settings">
            <Pref label="Push notifications" value={user.notifyPushEnabled} />
            <Pref label="Friend request notifications" value={user.notifyFriendRequests} />
            <Pref label="Nearby check-in notifications" value={user.notifyNearbyCheckin} />
            <Pref label="Push token registered" value={user.hasPushToken} />
            <Pref label="Finished onboarding" value={user.hasSeenOnboarding} />
            {user.showcasedAchievements.length > 0 && (
              <div className="pref">
                <span>Showcased trophies</span>
                <span className="muted small">{user.showcasedAchievements.join(', ')}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
