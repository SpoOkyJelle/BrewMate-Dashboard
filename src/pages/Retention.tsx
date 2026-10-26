import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../data';
import { buildCohorts, PERIODS, type Unit } from '../retention';
import { Card, Empty, Segmented, useChartProps } from '../components/ui';
import { fmtNum, fmtPct } from '../utils';

function level(v: number) {
  if (v <= 0) return 0;
  if (v < 0.1) return 1;
  if (v < 0.25) return 2;
  if (v < 0.5) return 3;
  return 4;
}

export default function Retention() {
  const { data, today } = useData();
  const chart = useChartProps();
  const [unit, setUnit] = useState<Unit>('week');

  // Per dag genoeg: "vandaag" in plaats van de klok die elke 15 s tikt.
  const cohorts = useMemo(() => buildCohorts(data!, unit, today), [data, unit, today]);

  // Gewogen gemiddelde per periode over alle groepen.
  const curve = useMemo(() => {
    return Array.from({ length: PERIODS }, (_, p) => {
      let active = 0;
      let total = 0;
      for (const c of cohorts) {
        const n = c.counts[p];
        if (n === null) continue;
        active += n;
        total += c.eligible[p];
      }
      return { label: `${unit === 'week' ? 'W' : 'M'}${p + 1}`, behoud: total ? Math.round((active / total) * 1000) / 10 : null };
    });
  }, [cohorts, unit]);

  const kpi = (p: number) => curve[p]?.behoud;
  const unitLabel = unit === 'week' ? 'Week' : 'Maand';

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>Behoud</h1>
          <p className="muted">
            Gebruikers gegroepeerd op de maand waarin ze zich aanmeldden. Elk vak toont welk deel in die {unit === 'week' ? 'week' : 'maand'} na
            het aanmelden een biertje logde.
          </p>
        </div>
        <Segmented
          label="Periode"
          value={unit}
          onChange={setUnit}
          options={[{ value: 'week', label: 'Per week' }, { value: 'month', label: 'Per maand' }]}
        />
      </header>

      <dl className="facts">
        <div><dt>{unitLabel} 1</dt><dd>{kpi(0) != null ? `${kpi(0)!.toLocaleString('nl-NL')}%` : '—'}</dd></div>
        <div><dt>{unitLabel} 2</dt><dd>{kpi(1) != null ? `${kpi(1)!.toLocaleString('nl-NL')}%` : '—'}</dd></div>
        <div><dt>{unitLabel} 4</dt><dd>{kpi(3) != null ? `${kpi(3)!.toLocaleString('nl-NL')}%` : '—'}</dd></div>
        <div><dt>{unitLabel} 12</dt><dd>{kpi(11) != null ? `${kpi(11)!.toLocaleString('nl-NL')}%` : '—'}</dd></div>
      </dl>

      <Card title="Behoud per aanmeldmaand" hint="Lege vakken: die periode is voor deze groep nog niet voorbij">
        {cohorts.length ? (
          <div className="table-wrap">
            <table className="table compact cohort">
              <thead>
                <tr>
                  <th>Aangemeld</th>
                  <th className="num">Gebruikers</th>
                  {Array.from({ length: PERIODS }, (_, p) => (
                    <th key={p} className="center">{unit === 'week' ? 'W' : 'M'}{p + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.key} className="no-hover">
                    <td className="cohort-label">{c.label}</td>
                    <td className="num">{fmtNum(c.size)}</td>
                    {c.cells.map((v, p) => (
                      <td key={p} className="center cohort-cell-td">
                        {v === null ? (
                          <span className="cohort-cell empty" />
                        ) : (
                          <span
                            className={`cohort-cell l${level(v)}`}
                            title={`${c.label}, ${unit === 'week' ? 'week' : 'maand'} ${p + 1}: ${fmtNum(c.counts[p] ?? 0)} actief (${fmtPct(v)})`}
                          >
                            {fmtPct(v)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Nog geen gebruikers met een aanmelddatum.</Empty>}
      </Card>

      <Card title="Gemiddeld behoud" hint={`Alle groepen samen: deel van de gebruikers dat in ${unit === 'week' ? 'week' : 'maand'} 1, 2, … nog actief was`}>
        <div className="chart-md">
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid {...chart.grid} />
              <XAxis dataKey="label" {...chart.axis} />
              <YAxis {...chart.axis} unit="%" domain={[0, 100]} />
              <Tooltip {...chart.tooltip} formatter={(v: number) => [`${v.toLocaleString('nl-NL')}%`, 'Behoud']} />
              <Line dataKey="behoud" stroke={chart.colors.accent} strokeWidth={2.5} dot={{ r: 3, fill: chart.colors.accent }} connectNulls type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
