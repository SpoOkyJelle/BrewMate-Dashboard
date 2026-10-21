import { useEffect, useId, useState, type ReactNode } from 'react';
import { fmtNum, fmtPct, useChartColors } from '../utils';
import { useCachedImage } from '../imageCache';

export function Card({ title, hint, actions, children, className = '' }: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <p className="panel-hint">{hint}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ url, name, size = 32 }: { url: string; name: string; size?: number }) {
  const src = useCachedImage(url);
  const [broken, setBroken] = useState<string | null>(null);
  if (src && broken !== src) {
    return (
      <img className="avatar" src={src} alt="" width={size} height={size} decoding="async" onError={() => setBroken(src)} />
    );
  }
  return (
    <span
      className={src === undefined && url ? 'avatar avatar-fallback loading' : 'avatar avatar-fallback'}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Empty({ children = 'Nog geen data' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------------- Rollende teller ---------------- */

function Digit({ d }: { d: number }) {
  // Start op 0 en rol naar de echte waarde, zodat de teller bij laden "optelt".
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(d));
    return () => cancelAnimationFrame(r);
  }, [d]);
  return (
    <span className="odo-digit" aria-hidden>
      <span className="odo-strip" style={{ transform: `translateY(${-shown * 10}%)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n}>{n}</span>)}
      </span>
    </span>
  );
}

export function Odometer({ value, className = '' }: { value: number; className?: string }) {
  const text = fmtNum(value);
  const chars = text.split('');
  return (
    <span className={`odo ${className}`} role="text" aria-label={text}>
      {chars.map((ch, i) => {
        const key = chars.length - i; // sleutel vanaf rechts, zodat cijfers hun plek houden
        return /\d/.test(ch)
          ? <Digit key={key} d={Number(ch)} />
          : <span key={`s${key}`} className="odo-sep" aria-hidden>{ch}</span>;
      })}
    </span>
  );
}

/* ---------------- Sparkline & trend ---------------- */

export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  const id = useId();
  const w = 120;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--amber)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--amber)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="trend flat">gelijk</span>;
  if (previous === 0) return <span className="trend up">nieuw</span>;
  const change = (current - previous) / previous;
  const dir = Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down';
  return (
    <span className={`trend ${dir}`} title={`Vorige periode: ${fmtNum(previous)}`}>
      {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'} {fmtPct(Math.abs(change))}
    </span>
  );
}

export function Metric({ label, value, current, previous, spark, note }: {
  label: string;
  value: ReactNode;
  current: number;
  previous: number;
  spark: number[];
  note: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <Trend current={current} previous={previous} />
      </div>
      <div className="metric-value">{value}</div>
      <Sparkline values={spark} />
      <div className="metric-note">{note}</div>
    </div>
  );
}

/* ---------------- Recharts-stijl ---------------- */

export function useChartProps() {
  const c = useChartColors();
  return {
    colors: c,
    grid: { stroke: c.grid, strokeDasharray: '2 4', vertical: false },
    axis: { stroke: c.axis, tick: { fill: c.axis, fontSize: 11 }, tickLine: false, axisLine: false },
    tooltip: {
      separator: ': ',
      contentStyle: {
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: '8px 12px',
        color: c.text,
        fontSize: 13,
        boxShadow: '0 18px 40px -14px rgba(20,24,36,.35)',
      },
      labelStyle: { color: c.text, fontWeight: 600, marginBottom: 2 },
      itemStyle: { color: c.text, padding: 0 },
      cursor: { fill: c.grid, opacity: 0.5 },
    },
  };
}
