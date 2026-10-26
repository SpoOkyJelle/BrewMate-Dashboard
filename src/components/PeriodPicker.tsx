import { useEffect, useRef, useState } from 'react';
import { useData } from '../data';
import { PRESETS, setPeriod, usePeriodValue, type PeriodValue } from '../period';
import { addDays, dayKey } from '../utils';

/** Kiest de periode voor het hele dashboard: een vaste keuze of zelf twee datums. */
export function PeriodPicker() {
  const value = usePeriodValue();
  const { today } = useData();
  const custom = typeof value === 'object';
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(custom ? value.from : dayKey(addDays(today, -29)));
  const [to, setTo] = useState(custom ? value.to : dayKey(today));
  const ref = useRef<HTMLDivElement>(null);

  // Klik buiten het venster of Escape sluit het.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (v: PeriodValue) => {
    setPeriod(v);
    setOpen(false);
  };

  const valid = from && to && from <= to;

  return (
    <div className="period" ref={ref}>
      <div className="segmented period-presets" role="radiogroup" aria-label="Periode">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            role="radio"
            aria-checked={value === p.value}
            className={value === p.value ? 'active' : ''}
            onClick={() => pick(p.value)}
            title={p.label}
          >
            {p.short}
          </button>
        ))}
        <button
          role="radio"
          aria-checked={custom}
          aria-expanded={open}
          className={custom ? 'active' : ''}
          onClick={() => setOpen((o) => !o)}
          title="Zelf datums kiezen"
        >
          {custom ? `${shortDate(value.from)} – ${shortDate(value.to)}` : 'Datums…'}
        </button>
      </div>
      {open && (
        <form
          className="period-pop"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) pick({ from, to });
          }}
        >
          <label>
            <span className="field-label">Van</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="field-label">Tot en met</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="submit" className="btn primary sm" disabled={!valid}>Toepassen</button>
        </form>
      )}
    </div>
  );
}

function shortDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
