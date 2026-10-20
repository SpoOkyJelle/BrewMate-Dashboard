import { useMemo } from 'react';
import type { Beer } from '../data';
import { addDays, dayKey, fmtNum, fmtPct, fmtShortDate, startOfDay, startOfWeek } from '../utils';

const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function level(v: number, max: number): number {
  if (!v || !max) return 0;
  return Math.min(4, Math.ceil((v / max) * 4));
}

/** Raster dag × uur: wanneer wordt er gedronken? */
export function WeekHourHeatmap({ beers }: { beers: Beer[] }) {
  const { grid, max } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
    for (const b of beers) if (b.date) g[(b.date.getDay() + 6) % 7][b.date.getHours()]++;
    return { grid: g, max: Math.max(0, ...g.flat()) };
  }, [beers]);

  return (
    <div className="hm-wrap">
      <div className="hm" role="img" aria-label="Biertjes per dag van de week en uur">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hm-hour">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
        ))}
        {grid.map((row, d) => (
          <Row key={d} label={DAYS[d]} row={row} max={max} />
        ))}
      </div>
      <Legend />
    </div>
  );
}

function Row({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <span className="hm-day">{label}</span>
      {row.map((v, h) => (
        <span
          key={h}
          className={`hm-cell l${level(v, max)}`}
          title={`${label} ${String(h).padStart(2, '0')}:00 – ${fmtNum(v)} biertjes`}
        />
      ))}
    </>
  );
}

function Legend() {
  return (
    <div className="hm-legend" aria-hidden>
      minder
      {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`hm-cell l${l}`} />)}
      meer
    </div>
  );
}

/** Kalender van het afgelopen jaar, zoals een GitHub-contributiegrafiek. */
export function CalendarHeatmap({ beers }: { beers: Beer[] }) {
  const { weeks, max, months } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of beers) if (b.date) counts.set(dayKey(b.date), (counts.get(dayKey(b.date)) ?? 0) + 1);
    const today = startOfDay(new Date());
    const start = addDays(startOfWeek(today), -7 * 52);
    const ws: { date: Date; count: number; future: boolean }[][] = [];
    const ms: { col: number; label: string }[] = [];
    for (let w = 0; w < 53; w++) {
      const col: { date: Date; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        col.push({ date, count: counts.get(dayKey(date)) ?? 0, future: date > today });
        if (d === 0 && date.getDate() <= 7) ms.push({ col: w, label: date.toLocaleDateString('nl-NL', { month: 'short' }) });
      }
      ws.push(col);
    }
    return { weeks: ws, max: Math.max(0, ...ws.flat().map((c) => c.count)), months: ms };
  }, [beers]);

  return (
    <div className="cal-wrap">
      <div className="cal" role="img" aria-label="Biertjes per dag, afgelopen jaar">
        <div className="cal-months">
          {months.map((m) => <span key={m.col} style={{ gridColumn: m.col + 1 }}>{m.label}</span>)}
        </div>
        <div className="cal-body">
        <div className="cal-days" aria-hidden>
          <span /><span>di</span><span /><span>do</span><span /><span>za</span><span />
        </div>
        <div className="cal-grid">
          {weeks.map((col, w) => (
            <div key={w} className="cal-col">
              {col.map((c) => (
                <span
                  key={c.date.getTime()}
                  className={c.future ? 'hm-cell future' : `hm-cell l${level(c.count, max)}`}
                  title={c.future ? '' : `${fmtShortDate(c.date)}: ${c.count} ${c.count === 1 ? 'biertje' : 'biertjes'}`}
                />
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>
      <Legend />
    </div>
  );
}

/** Stappen van aanmelden tot vaste drinker, met conversie per stap. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value || 1;
  return (
    <ol className="funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].value : null;
        return (
          <li key={s.label}>
            <div className="funnel-row">
              <span className="funnel-label">{s.label}</span>
              <span className="funnel-value">{fmtNum(s.value)}</span>
            </div>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%`, animationDelay: `${i * 70}ms` }} />
            </div>
            <div className="funnel-meta">
              {fmtPct(s.value / top)} van alle gebruikers
              {prev !== null && prev > 0 && <> · {fmtPct(s.value / prev)} van vorige stap</>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
