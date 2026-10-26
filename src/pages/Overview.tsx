import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData } from '../data';
import { Avatar, Card, Empty, Metric, Odometer, useChartProps } from '../components/ui';
import { Funnel, WeekHourHeatmap } from '../components/charts';
import { LiveFeed } from '../components/live';
import { AchievementRarity } from '../components/achievements';
import { achievementsFor } from '../achievements';
import { inPeriod, periodDays, usePeriod } from '../period';
import { firstBeerDate, funnel as buildFunnel, series, topDrinkers, uniqueDrinkers } from '../stats';
import {
  addDays, displayName, fmtDuration, fmtLiters, fmtNum, fmtPct, fmtShortDate, fmtVolume, median,
  startOfDay, startOfWeek, weeksBetween,
} from '../utils';

/** Boven zoveel dagen tonen we per week in plaats van per dag. */
const MAX_DAILY = 120;

export default function Overview() {
  const { data, now, today: midnight } = useData();
  const chart = useChartProps();
  const period = usePeriod(midnight);

  // Gemiddelde over de 4 weken vóór vandaag: verandert maar één keer per dag.
  const avgPerDay = useMemo(
    () => data!.beers.filter((b) => b.date && b.date >= addDays(midnight, -28) && b.date < midnight).length / 28,
    [data, midnight],
  );
  const signupsWeek = useMemo(
    () => data!.users.filter((u) => u.createdAt && u.createdAt >= startOfWeek(midnight)).length,
    [data, midnight],
  );

  // Live cijfers voor vandaag. `now` tikt elke 15 s mee, dus dit moet licht blijven: de biertjes
  // staan nieuwste eerst, en we stoppen zodra we vóór middernacht zitten.
  const today = useMemo(() => {
    const d = data!;
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const stop = hourAgo < midnight ? hourAgo : midnight;
    const todays = [];
    const hourDrinkers = new Set<string>();
    for (const b of d.beers) {
      if (!b.date) continue; // biertjes zonder datum staan vooraan
      if (b.date < stop) break;
      if (b.date >= midnight) todays.push(b);
      if (b.date >= hourAgo) hourDrinkers.add(b.userId);
    }
    return {
      beers: todays.length,
      cl: todays.reduce((s, b) => s + b.volume, 0),
      drinkersHour: hourDrinkers.size,
      drinkersToday: new Set(todays.map((b) => b.userId)).size,
      signups: d.users.filter((u) => u.createdAt && u.createdAt >= midnight).length,
      signupsWeek,
      avgPerDay,
      level: avgPerDay ? Math.min(1, todays.length / (avgPerDay * 1.5)) : todays.length ? 1 : 0,
    };
  }, [data, now, midnight, avgPerDay, signupsWeek]);

  // Alles hieronder rekent per dag en hangt dus af van middernacht, niet van de klok die elke 15 s tikt.
  const last30 = useMemo(() => series(data!, addDays(midnight, -29), addDays(midnight, 1), 'day'), [data, midnight]);

  // Biertjes in de gekozen periode (gedeeld met de Kaart).
  const periodBeers = useMemo(() => data!.beers.filter((b) => inPeriod(b.date, period)), [data, period]);
  const daily = useMemo(() => {
    const first = firstBeerDate(data!.beers);
    const unit = periodDays(period, first) > MAX_DAILY ? 'week' : 'day';
    const from = period.from ?? startOfDay(first ?? midnight);
    return { unit, rows: series(data!, from, period.to, unit) };
  }, [data, period, midnight]);

  // Deze 7 dagen vs de 7 dagen daarvoor.
  const metrics = useMemo(() => {
    const d = data!;
    const end = addDays(midnight, 1);
    const mid = addDays(end, -7);
    const start = addDays(end, -14);
    const sum = (rows: typeof last30, f: (r: (typeof last30)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const cur = last30.slice(-7);
    const prev = last30.slice(-14, -7);
    return {
      signups: [sum(cur, (r) => r.signups), sum(prev, (r) => r.signups)],
      beers: [sum(cur, (r) => r.beers), sum(prev, (r) => r.beers)],
      cl: [sum(cur, (r) => r.cl), sum(prev, (r) => r.cl)],
      drinkers: [uniqueDrinkers(d.beers, mid, end), uniqueDrinkers(d.beers, start, mid)],
    };
  }, [data, last30, midnight]);

  const facts = useMemo(() => {
    const d = data!;
    const mau = uniqueDrinkers(d.beers, addDays(midnight, -29), addDays(midnight, 1));
    const drinkers = d.users.filter((u) => u.beerCount > 0);
    const firstBeerDelay = median(
      drinkers.filter((u) => u.createdAt && u.firstBeer).map((u) => u.firstBeer!.getTime() - u.createdAt!.getTime()).filter((ms) => ms >= 0),
    );
    return {
      totalBeers: d.beers.length,
      totalCl: d.beers.reduce((s, b) => s + b.volume, 0),
      stickiness: mau ? today.drinkersToday / mau : null,
      firstBeerDelay,
      perDrinker: drinkers.length ? d.beers.length / drinkers.length : null,
      withFriends: d.users.filter((u) => u.friendIds.length > 0).length,
    };
  }, [data, midnight, today.drinkersToday]);

  const funnel = useMemo(() => buildFunnel(data!, midnight), [data, midnight]);

  const growth = useMemo(() => {
    const weeks = 26;
    const start = addDays(startOfWeek(midnight), -7 * (weeks - 1));
    const counts = new Array(weeks).fill(0) as number[];
    let before = 0;
    for (const u of data!.users) {
      if (!u.createdAt) continue;
      if (u.createdAt < start) { before++; continue; }
      const i = weeksBetween(start, startOfWeek(u.createdAt));
      if (i >= 0 && i < weeks) counts[i]++;
    }
    let total = before;
    return counts.map((n, i) => ({ label: fmtShortDate(addDays(start, i * 7)), nieuw: n, totaal: (total += n) }));
  }, [data, midnight]);

  const sizes = useMemo(() => {
    const m = new Map<number, number>();
    periodBeers.forEach((b) => m.set(b.volume, (m.get(b.volume) ?? 0) + 1));
    // De 6 populairste maten, de rest samen als "Overig".
    const byCount = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const main = byCount.slice(0, 6).sort((a, b) => a[0] - b[0]).map(([vol, n]) => ({ label: fmtVolume(vol), biertjes: n }));
    const rest = byCount.slice(6).reduce((s, [, n]) => s + n, 0);
    return rest ? [...main, { label: 'Overig', biertjes: rest }] : main;
  }, [periodBeers]);

  const top = useMemo(() => {
    const rows = topDrinkers(data!, periodBeers);
    return { rows, max: rows[0]?.beers ?? 1 };
  }, [data, periodBeers]);

  if (!data) return null;
  const { colors } = chart;
  const spark = (f: (r: (typeof last30)[number]) => number) => last30.map(f);

  return (
    <div className="overview">
      <div className="overview-top">
      <div className="overview-main">
        <section className="hero" style={{ ['--level' as string]: today.level }}>
          <div className="hero-beer" aria-hidden />
          <div className="hero-main">
            <h1 className="hero-label">Gebruikers</h1>
            <Odometer value={data.users.length} className="odo-xl" />
            <p className="hero-sub">
              <span className="pos">+{fmtNum(today.signups)} vandaag</span>
              <span>+{fmtNum(today.signupsWeek)} deze week</span>
            </p>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>Biertjes vandaag</dt>
              <dd><Odometer value={today.beers} /></dd>
            </div>
            <div>
              <dt>Gedronken vandaag</dt>
              <dd>{fmtLiters(today.cl)}</dd>
            </div>
            <div>
              <dt>Drinkers afgelopen uur</dt>
              <dd><Odometer value={today.drinkersHour} /></dd>
            </div>
          </dl>
          <p className="hero-foot">
            {today.avgPerDay
              ? `Vandaag ${fmtPct(today.beers / today.avgPerDay)} van een gemiddelde dag (${today.avgPerDay.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} biertjes)`
              : 'Nog geen gemiddelde: er zijn de afgelopen 4 weken geen biertjes gelogd'}
          </p>
        </section>

        <div className="metrics" aria-label="Afgelopen 7 dagen vergeleken met de week ervoor">
          <Metric label="Nieuwe gebruikers" value={fmtNum(metrics.signups[0])} current={metrics.signups[0]} previous={metrics.signups[1]} spark={spark((r) => r.signups)} note="7 dagen" />
          <Metric label="Actieve drinkers" value={fmtNum(metrics.drinkers[0])} current={metrics.drinkers[0]} previous={metrics.drinkers[1]} spark={spark((r) => r.drinkerCount)} note="7 dagen, uniek" />
          <Metric label="Biertjes" value={fmtNum(metrics.beers[0])} current={metrics.beers[0]} previous={metrics.beers[1]} spark={spark((r) => r.beers)} note="7 dagen" />
          <Metric label="Volume" value={fmtLiters(metrics.cl[0])} current={metrics.cl[0]} previous={metrics.cl[1]} spark={spark((r) => r.cl)} note="7 dagen" />
        </div>

        <Card
          title={daily.unit === 'week' ? 'Biertjes per week' : 'Biertjes per dag'}
          hint={`${capitalize(period.label)}. Staven zijn biertjes, de lijn is het aantal unieke drinkers`}
        >
          <div className="chart-lg">
            <ResponsiveContainer>
              <ComposedChart data={daily.rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={28} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="beers" name="Biertjes" fill={colors.accent} radius={[8, 8, 8, 8]} maxBarSize={28} animationDuration={700} />
                <Line dataKey="drinkerCount" name="Drinkers" stroke={colors.accent2} strokeWidth={2} dot={false} type="monotone" animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <aside className="overview-feed panel">
        <header className="panel-head">
          <div>
            <h2>Live activiteit</h2>
            <p className="panel-hint">Nieuwe biertjes en aanmeldingen verschijnen hier vanzelf</p>
          </div>
        </header>
        <div className="feed-scroll">
          <div className="feed-scroll-inner">
            <LiveFeed limit={40} />
          </div>
        </div>
      </aside>
      </div>

      <dl className="facts">
        <div><dt>Biertjes totaal</dt><dd>{fmtNum(facts.totalBeers)}</dd></div>
        <div><dt>Liters totaal</dt><dd>{fmtLiters(facts.totalCl)}</dd></div>
        <div><dt>Biertjes per drinker</dt><dd>{facts.perDrinker ? facts.perDrinker.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '—'}</dd></div>
        <div title="Drinkers vandaag gedeeld door drinkers in de laatste 30 dagen"><dt>Dagelijks terug</dt><dd>{facts.stickiness !== null ? fmtPct(facts.stickiness) : '—'}</dd></div>
        <div title="Mediaan tijd tussen aanmelden en het eerste biertje"><dt>Tot eerste biertje</dt><dd>{facts.firstBeerDelay !== null ? fmtDuration(facts.firstBeerDelay) : '—'}</dd></div>
        <div><dt>Vriendschappen</dt><dd>{fmtNum(data.friendshipCount)}</dd></div>
        <div><dt>Met vrienden</dt><dd>{data.users.length ? fmtPct(facts.withFriends / data.users.length) : '—'}</dd></div>
        <div><dt>Openstaande verzoeken</dt><dd>{fmtNum(data.pendingRequests)}</dd></div>
      </dl>

      <div className="grid-2 span-all">
        <Card title="Wanneer wordt er gedronken?" hint={`${capitalize(period.label)}, per dag van de week en uur`}>
          {periodBeers.length ? <WeekHourHeatmap beers={periodBeers} /> : <Empty>Geen biertjes in deze periode</Empty>}
        </Card>

        <Card title="Van aanmelding tot vaste drinker" hint="Hoeveel gebruikers elke stap halen">
          <Funnel steps={funnel} />
        </Card>

        <Card title="Groei" hint="Nieuwe gebruikers per week, de lijn is het totaal">
          <div className="chart-md">
            <ResponsiveContainer>
              <ComposedChart data={growth} margin={{ top: 8, right: -8, left: -20, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={28} />
                <YAxis yAxisId="n" {...chart.axis} allowDecimals={false} />
                <YAxis yAxisId="t" orientation="right" {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar yAxisId="n" dataKey="nieuw" name="Nieuw" fill={colors.accent} radius={[8, 8, 8, 8]} maxBarSize={24} />
                <Line yAxisId="t" dataKey="totaal" name="Totaal" stroke={colors.accent2} strokeWidth={2} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Glasmaten" hint={`Welke maat het meest gelogd wordt, ${period.label}`}>
          {sizes.length ? (
            <div className="chart-md">
              <ResponsiveContainer>
                <BarChart data={sizes} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid {...chart.grid} horizontal={false} vertical />
                  <XAxis type="number" {...chart.axis} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" {...chart.axis} width={56} interval={0} />
                  <Tooltip {...chart.tooltip} />
                  <Bar dataKey="biertjes" name="Biertjes" fill={colors.accent} radius={[8, 8, 8, 8]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Geen biertjes in deze periode</Empty>}
        </Card>

        <Card title="Topdrinkers" hint={capitalize(period.label)}>
          {top.rows.length ? (
            <ol className="leaderboard">
              {top.rows.map((r, i) => (
                <li key={r.uid}>
                  <span className="lb-rank">{i + 1}</span>
                  <Link to={`/users/${r.uid}`} className="lb-user">
                    <Avatar url={r.user.photoUrl} name={displayName(r.user)} size={30} />
                    <span className="lb-name">{displayName(r.user)}</span>
                  </Link>
                  <div className="lb-bar" aria-hidden><span style={{ width: `${(r.beers / top.max) * 100}%` }} /></div>
                  <span className="lb-num">{fmtNum(r.beers)}</span>
                  <span className="lb-sub">{fmtLiters(r.cl)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty>Geen biertjes in deze periode</Empty>}
        </Card>

        <Card title="Nieuwste gebruikers" actions={<Link to="/users" className="text-link">Alle gebruikers</Link>}>
          <ul className="people">
            {[...data.users]
              .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
              .slice(0, 6)
              .map((u) => (
                <li key={u.uid}>
                  <Link to={`/users/${u.uid}`} className="lb-user">
                    <Avatar url={u.photoUrl} name={displayName(u)} size={30} />
                    <span className="lb-name">{displayName(u)}</span>
                  </Link>
                  <span className="muted small">{u.createdAt ? fmtShortDate(u.createdAt) : '—'}</span>
                  <span className="lb-sub">{fmtNum(u.beerCount)} biertjes</span>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card title="Achievements" hint="Hoe zeldzaam is elke achievement?">
        <AchievementRarity all={achievementsFor(data)} userCount={data.users.length} />
      </Card>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
