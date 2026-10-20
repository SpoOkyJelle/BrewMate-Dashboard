import type { ReactNode } from 'react';
import { useChartColors } from '../utils';

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ url, name, size = 32 }: { url: string; name: string; size?: number }) {
  if (url) return <img className="avatar" src={url} alt="" width={size} height={size} loading="lazy" />;
  return (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** Shared Recharts props so every chart looks the same. */
export function useChartProps() {
  const c = useChartColors();
  return {
    colors: c,
    grid: { stroke: c.grid, strokeDasharray: '3 3', vertical: false },
    axis: { stroke: c.axis, tick: { fill: c.axis, fontSize: 12 }, tickLine: false, axisLine: false },
    tooltip: {
      contentStyle: {
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        color: c.text,
        fontSize: 13,
      },
      labelStyle: { color: c.text, fontWeight: 600 },
      itemStyle: { color: c.text },
      cursor: { fill: c.grid, opacity: 0.4 },
    },
  };
}

export function Empty({ children = 'No data yet' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}
