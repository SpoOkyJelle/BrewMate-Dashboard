import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData } from '../data';
import { Avatar, Card, Empty, Odometer, Segmented, useChartProps } from '../components/ui';
import { IconGlass, IconPresent } from '../components/icons';
import { BeerConfetti } from '../components/confetti';
import { enterFullscreen } from '../fullscreen';
import { useTonight, type StartHour } from '../useTonight';
import { displayName, fmtLiters, fmtNum, fmtRelative, fmtVolume } from '../utils';

export default function Tonight() {
  const { data, events, now } = useData();
  const chart = useChartProps();
  const navigate = useNavigate();
  const [startHour, setStartHour] = useState<StartHour>(19);
  const tonight = useTonight(startHour);

  // Verse biertjes (net live binnen) lichten op in de feed.
  const freshKeys = useMemo(() => new Set(events.map((e) => e.key)), [events]);

  if (!data || !tonight) return null;

  const { startLabel } = tonight;
  const feed = tonight.beers.slice(0, 40);

  const present = () => {
    enterFullscreen();
    navigate('/present');
  };

  return (
    <div className="overview">
      <BeerConfetti />
      <div className="page-head">
        <div>
          <h1>Vanavond</h1>
          <p className="muted">
            Live sinds {startLabel} · {tonight.drinkers
              ? `${fmtNum(tonight.drinkers)} ${tonight.drinkers === 1 ? 'persoon' : 'personen'} aan het drinken`
              : 'nog niemand begonnen'}
          </p>
        </div>
        <div className="head-actions">
          <Segmented
            label="Begonnen om"
            value={startHour}
            onChange={setStartHour}
            options={[{ value: 19, label: '19:00' }, { value: 20, label: '20:00' }, { value: 22, label: '22:00' }]}
          />
          <button className="btn primary" onClick={present}>
            <IconPresent /> Presenteren
          </button>
        </div>
      </div>

      <div className="overview-top">
        <div className="overview-main">
          <section className="hero" style={{ ['--level' as string]: tonight.level }}>
            <div className="hero-beer" aria-hidden />
            <div className="hero-main">
              <h1 className="hero-label">Biertjes vanavond</h1>
              <Odometer value={tonight.totalBeers} className="odo-xl" />
              <p className="hero-sub">
                <span className="pos">{fmtLiters(tonight.totalCl)} samen</span>
                <span>🍻 {fmtNum(tonight.totalToasts)} proostjes</span>
              </p>
            </div>
            <dl className="hero-stats">
              <div>
                <dt>Aan het drinken</dt>
                <dd><Odometer value={tonight.drinkers} /></dd>
              </div>
              <div>
                <dt>Gemiddeld per persoon</dt>
                <dd>{tonight.perPerson.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</dd>
              </div>
              <div>
                <dt>Tempo</dt>
                <dd>{tonight.perHour.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}<span className="hero-unit"> /uur</span></dd>
              </div>
              <div>
                <dt>Laatste biertje</dt>
                <dd className="hero-when">{tonight.lastBeer ? fmtRelative(tonight.lastBeer, now) : '—'}</dd>
              </div>
            </dl>
            <p className="hero-foot">
              Teller loopt vanaf {startLabel} en reset niet om middernacht — perfect voor een lange avond.
            </p>
          </section>

          <Card title="Ranglijst vanavond" hint="Wie drinkt er vanavond de meeste liters? Live bijgewerkt.">
            {tonight.board.length ? (
              <ol className="leaderboard">
                {tonight.board.map((r, i) => {
                  const name = r.user ? displayName(r.user) : 'Verwijderd account';
                  return (
                    <li key={r.uid}>
                      <span className="lb-rank">{i === 0 ? '👑' : i + 1}</span>
                      {r.user ? (
                        <Link to={`/users/${r.uid}`} className="lb-user">
                          <Avatar url={r.user.photoUrl} name={name} size={30} />
                          <span className="lb-name">{name}</span>
                        </Link>
                      ) : (
                        <span className="lb-user"><span className="lb-name muted">{name}</span></span>
                      )}
                      <div className="lb-bar" aria-hidden><span style={{ width: `${(r.cl / tonight.max) * 100}%` }} /></div>
                      <span className="lb-num">{fmtLiters(r.cl)}</span>
                      <span className="lb-sub">{fmtNum(r.beers)} biertjes</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Empty>Nog geen biertjes vanavond. Proost! 🍻</Empty>
            )}
          </Card>
        </div>

        <aside className="overview-feed panel">
          <header className="panel-head">
            <div>
              <h2>Laatste logs</h2>
              <p className="panel-hint">De nieuwste biertjes van vanavond, nieuwste bovenaan</p>
            </div>
          </header>
          <div className="feed-scroll">
            <div className="feed-scroll-inner">
              {feed.length ? (
                <ol className="feed" aria-live="polite">
                  {feed.map((b) => {
                    const u = data.usersById.get(b.userId);
                    const name = u ? displayName(u) : 'Verwijderd account';
                    return (
                      <li key={b.id} className={freshKeys.has(`beer-${b.id}`) ? 'feed-item fresh' : 'feed-item'}>
                        <span className="feed-icon beer"><IconGlass width={15} height={15} /></span>
                        <div className="feed-body">
                          <div className="feed-text">
                            {u ? <Link to={`/users/${b.userId}`}>{name}</Link> : <span className="muted">{name}</span>}{' '}
                            logde <strong>{fmtVolume(b.volume)}</strong>
                            {!!b.toasts && <span className="feed-toasts" title="Proostjes van vrienden"> 🍻 {b.toasts}</span>}
                          </div>
                          <time className="feed-time" dateTime={b.date!.toISOString()} title={b.date!.toLocaleString('nl-NL')}>
                            {fmtRelative(b.date!, now)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="empty">Zodra iemand een biertje logt, zie je het hier.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <Card title="Tempo vanavond" hint="Biertjes per uur sinds de start">
        {tonight.pace.some((p) => p.biertjes) ? (
          <div className="chart-md">
            <ResponsiveContainer>
              <BarChart data={tonight.pace} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="label" {...chart.axis} minTickGap={12} />
                <YAxis {...chart.axis} allowDecimals={false} />
                <Tooltip {...chart.tooltip} />
                <Bar dataKey="biertjes" name="Biertjes" fill={chart.colors.accent} radius={[8, 8, 8, 8]} maxBarSize={36} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty>Nog geen biertjes om een tempo te laten zien.</Empty>
        )}
      </Card>
    </div>
  );
}
