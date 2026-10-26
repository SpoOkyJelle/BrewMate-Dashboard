import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../data';
import { Avatar, Odometer } from '../components/ui';
import { BeerConfetti } from '../components/confetti';
import { IconClose } from '../components/icons';
import { exitFullscreen } from '../fullscreen';
import { useTonight, type StartHour } from '../useTonight';
import { displayName, fmtLiters, fmtNum, fmtRelative, fmtVolume } from '../utils';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Schermvullend presentatiescherm voor op een tv of beamer. */
export default function Present() {
  const { data, events, now } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const startHour = (Number(params.get('start')) === 20 ? 20 : Number(params.get('start')) === 22 ? 22 : 19) as StartHour;
  const tonight = useTonight(startHour);

  const freshKeys = useMemo(() => new Set(events.map((e) => e.key)), [events]);

  const close = () => {
    exitFullscreen();
    navigate('/tonight');
  };

  // Esc sluit af (en de browser verlaat zelf fullscreen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || !tonight) return null;

  const clock = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const board = tonight.board.slice(0, 6);
  const ticker = tonight.beers.slice(0, 10);

  return (
    <div className="present" style={{ ['--level' as string]: tonight.level }}>
      <BeerConfetti />
      <div className="present-fill" aria-hidden />

      <header className="present-bar">
        <div className="present-brand">
          <img src="/favicon.svg" alt="" width={34} height={34} />
          <span>BrewMate · <strong>Vanavond</strong></span>
        </div>
        <div className="present-bar-right">
          <span className="present-live"><span className="live-dot" /> Live sinds {tonight.startLabel}</span>
          <span className="present-clock">{clock}</span>
          <button className="icon-btn present-close" onClick={close} title="Afsluiten (Esc)" aria-label="Afsluiten">
            <IconClose />
          </button>
        </div>
      </header>

      <div className="present-main">
        <section className="present-totals">
          <p className="present-kicker">Biertjes vanavond</p>
          <Odometer value={tonight.totalBeers} className="present-big" />
          <div className="present-stats">
            <div>
              <span className="present-stat-num">{fmtLiters(tonight.totalCl)}</span>
              <span className="present-stat-lbl">samen gedronken</span>
            </div>
            <div>
              <span className="present-stat-num">{fmtNum(tonight.drinkers)}</span>
              <span className="present-stat-lbl">aan het drinken</span>
            </div>
            <div>
              <span className="present-stat-num">{tonight.perHour.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</span>
              <span className="present-stat-lbl">per uur</span>
            </div>
            <div>
              <span className="present-stat-num">🍻 {fmtNum(tonight.totalToasts)}</span>
              <span className="present-stat-lbl">proostjes</span>
            </div>
          </div>
        </section>

        <section className="present-board">
          <h2 className="present-h2">Ranglijst</h2>
          {board.length ? (
            <ol>
              {board.map((r, i) => {
                const name = r.user ? displayName(r.user) : 'Verwijderd account';
                return (
                  <li key={r.uid} className={i === 0 ? 'present-row lead' : 'present-row'}>
                    <span className="present-rank">{MEDALS[i] ?? i + 1}</span>
                    <Avatar url={r.user?.photoUrl ?? ''} name={name} size={52} />
                    <span className="present-name">{name}</span>
                    <div className="present-barline" aria-hidden><span style={{ width: `${(r.cl / tonight.max) * 100}%` }} /></div>
                    <span className="present-count">{fmtLiters(r.cl)}</span>
                    <span className="present-cl">{fmtNum(r.beers)} biertjes</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="present-empty">Nog geen biertjes vanavond.<br />Proost! 🍻</div>
          )}
        </section>
      </div>

      <footer className="present-ticker">
        <span className="present-ticker-lbl">Laatste logs</span>
        <div className="present-ticker-items">
          {ticker.length ? ticker.map((b) => {
            const u = data.usersById.get(b.userId);
            const name = u ? displayName(u) : 'Onbekend';
            return (
              <span key={b.id} className={freshKeys.has(`beer-${b.id}`) ? 'present-chip fresh' : 'present-chip'}>
                <strong>{name}</strong> {fmtVolume(b.volume)}
                <span className="present-chip-time">{fmtRelative(b.date!, now)}</span>
              </span>
            );
          }) : <span className="present-chip muted">Zodra iemand logt, zie je het hier.</span>}
        </div>
      </footer>
    </div>
  );
}
