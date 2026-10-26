import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Card, ConfirmButton, Empty, Segmented } from '../components/ui';
import { fmtNum } from '../utils';
import {
  METRIC_LABEL, SCOPE_LABEL, STATUS_LABEL, liveStatus, metricValue,
  useGuildEvents, type EventMetric, type EventScope, type GuildEventRow,
} from '../events';

const call = <T,>(name: string, data: unknown) => httpsCallable<unknown, T>(functions, name)(data).then((r) => r.data);

/** Default to a one-week event starting tomorrow at 18:00, in <input datetime-local> form. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ status }: { status: GuildEventRow['status'] }) {
  const color = status === 'active' ? '#10B981'
    : status === 'scheduled' ? '#3B82F6'
      : status === 'cancelled' ? '#EF4444' : 'var(--muted)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
      color, background: `${color === 'var(--muted)' ? '#8884' : color}1f`, padding: '2px 8px', borderRadius: 999,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function fmtRange(ev: GuildEventRow): string {
  const f = (d: Date | null) => d ? d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '?';
  return `${f(ev.startAt)} → ${f(ev.endAt)}`;
}

export default function Events() {
  const { events, error } = useGuildEvents();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Create form
  const now = new Date();
  const defStart = new Date(now); defStart.setDate(defStart.getDate() + 1); defStart.setHours(18, 0, 0, 0);
  const defEnd = new Date(defStart); defEnd.setDate(defEnd.getDate() + 7);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<EventMetric>('volume');
  const [scope, setScope] = useState<EventScope>('guild');
  const [startAt, setStartAt] = useState(localInput(defStart));
  const [endAt, setEndAt] = useState(localInput(defEnd));
  const [notifyOnStart, setNotifyOnStart] = useState(true);
  const [notifyOnEnd, setNotifyOnEnd] = useState(true);
  const [saving, setSaving] = useState(false);

  const flash = (m: string) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 6000); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : String(e)); setMsg(null); };

  const createEvent = async () => {
    setSaving(true); setErr(null);
    try {
      await call<{ id: string }>('createGuildEvent', {
        title: title.trim(),
        description: description.trim(),
        metric,
        scope,
        startAt: new Date(startAt).getTime(),
        endAt: new Date(endAt).getTime(),
        notifyOnStart,
        notifyOnEnd,
      });
      setTitle(''); setDescription('');
      flash('Event aangemaakt.');
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const [active, upcoming, past] = useMemo(() => {
    const a: GuildEventRow[] = []; const u: GuildEventRow[] = []; const p: GuildEventRow[] = [];
    for (const ev of events ?? []) {
      const s = liveStatus(ev);
      if (s === 'active') a.push(ev);
      else if (s === 'scheduled') u.push(ev);
      else p.push(ev);
    }
    return [a, u, p];
  }, [events]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Events</h1>
          <p className="muted">Guild-wedstrijden op volume of aantal biertjes, met pushmelding naar de guilds</p>
        </div>
      </header>

      {error && <div className="banner error" role="alert">De events kunnen niet geladen worden: {error}</div>}
      {msg && <div className="banner ok" role="status">{msg}</div>}
      {err && <div className="banner error" role="alert">{err}</div>}

      {/* Nieuw event */}
      <Card title="Nieuw event" hint="Stel een wedstrijd in voor een periode">
        <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
          <label className="field">
            <span>Titel</span>
            <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="bijv. Oktoberfest Challenge" />
          </label>
          <label className="field">
            <span>Omschrijving</span>
            <textarea value={description} maxLength={240} rows={2} onChange={(e) => setDescription(e.target.value)} placeholder="Korte uitleg die in de melding komt" />
          </label>

          <div className="field">
            <span>Wedstrijdtype</span>
            <Segmented
              label="Wedstrijdtype"
              value={metric}
              onChange={setMetric}
              options={[{ value: 'volume', label: METRIC_LABEL.volume }, { value: 'count', label: METRIC_LABEL.count }]}
            />
          </div>

          <div className="field">
            <span>Scope</span>
            <Segmented
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[{ value: 'guild', label: SCOPE_LABEL.guild }, { value: 'solo', label: SCOPE_LABEL.solo }]}
            />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              <span>Start</span>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              <span>Einde</span>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnStart} onChange={(e) => setNotifyOnStart(e.target.checked)} />
              <span>Melding bij start</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnEnd} onChange={(e) => setNotifyOnEnd(e.target.checked)} />
              <span>Melding bij uitslag</span>
            </label>
          </div>

          <div>
            <button className="btn" disabled={saving || !title.trim()} onClick={createEvent}>
              {saving ? 'Bezig…' : 'Event aanmaken'}
            </button>
          </div>
        </div>
      </Card>

      {!events ? (
        <div className="center-block"><div className="spinner" /></div>
      ) : (
        <>
          <EventList title="Actief" hint="Loopt nu" rows={active} />
          <EventList title="Gepland" hint="Nog niet gestart" rows={upcoming} />
          <EventList title="Afgelopen" hint="Uitslag bekend" rows={past} collapsedStandings />
        </>
      )}
    </div>
  );
}

function EventList({ title, hint, rows, collapsedStandings }: {
  title: string; hint: string; rows: GuildEventRow[]; collapsedStandings?: boolean;
}) {
  return (
    <Card title={title} hint={hint}>
      {!rows.length ? <Empty>Geen events</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((ev) => <EventCard key={ev.id} ev={ev} collapsedStandings={collapsedStandings} />)}
        </div>
      )}
    </Card>
  );
}

function EventCard({ ev, collapsedStandings }: { ev: GuildEventRow; collapsedStandings?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const status = liveStatus(ev);
  const [open, setOpen] = useState(!collapsedStandings);

  const run = async (name: string, label: string) => {
    setBusy(label); setLocalErr(null);
    try { await call(name, { id: ev.id }); }
    catch (e) { setLocalErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const standings = ev.scope === 'solo'
    ? ev.soloStandings.map((s, i) => ({ rank: i + 1, name: s.username || '—', sub: s.guildName, value: s.value, color: '#3B82F6' }))
    : ev.guildStandings.map((s, i) => ({ rank: i + 1, name: `[${s.tag}] ${s.name}`, sub: `${s.contributors} ${s.contributors === 1 ? 'bijdrager' : 'bijdragers'} · top: ${s.topContributor || '—'}`, value: s.value, color: s.color }));

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={status} />
            <strong>{ev.title}</strong>
          </div>
          {ev.description && <div className="muted small" style={{ marginTop: 4 }}>{ev.description}</div>}
          <div className="muted small" style={{ marginTop: 6 }}>
            {METRIC_LABEL[ev.metric]} · {SCOPE_LABEL[ev.scope]} · {fmtRange(ev)}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            Start-melding: {ev.notifyOnStart ? (ev.startNotifiedAt ? 'verstuurd' : 'aan') : 'uit'}
            {' · '}Uitslag-melding: {ev.notifyOnEnd ? (ev.endNotifiedAt ? 'verstuurd' : 'aan') : 'uit'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(status === 'active' || status === 'scheduled') && (
            <button className="btn sm" disabled={!!busy} onClick={() => run('recomputeGuildEvent', 'recompute')}>
              {busy === 'recompute' ? 'Bezig…' : 'Herbereken'}
            </button>
          )}
          {(status === 'active' || status === 'scheduled') && (
            <ConfirmButton
              label="Nu aankondigen"
              confirmLabel="Ja, versturen"
              danger={false}
              title="Stuurt de start-melding nu naar alle guild-leden"
              onConfirm={() => run('announceGuildEvent', 'announce')}
            />
          )}
          {status !== 'ended' && status !== 'cancelled' && (
            <ConfirmButton
              label="Annuleren"
              confirmLabel="Ja, annuleren"
              title="Stopt het event en toekomstige meldingen"
              onConfirm={() => run('cancelGuildEvent', 'cancel')}
            />
          )}
          <ConfirmButton
            label="Verwijderen"
            confirmLabel="Ja, verwijderen"
            title="Verwijdert het event volledig"
            onConfirm={() => run('deleteGuildEvent', 'delete')}
          />
        </div>
      </div>

      {localErr && <div className="banner error" role="alert" style={{ marginTop: 10 }}>{localErr}</div>}

      {standings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {collapsedStandings && (
            <button className="btn sm" onClick={() => setOpen((o) => !o)} style={{ marginBottom: 8 }}>
              {open ? 'Verberg stand' : `Toon stand (${standings.length})`}
            </button>
          )}
          {open && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {standings.slice(0, 10).map((s) => (
                <li key={s.rank} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, textAlign: 'center', fontWeight: 800, color: 'var(--muted)' }}>
                    {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank}
                  </span>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    {s.sub && <span className="muted small"> · {s.sub}</span>}
                  </span>
                  <span style={{ fontWeight: 800 }}>{metricValue(ev.metric, s.value)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {ev.lastComputedAt && (status === 'active' || status === 'ended') && (
        <div className="muted small" style={{ marginTop: 8 }}>
          Stand bijgewerkt: {ev.lastComputedAt.toLocaleString('nl-NL')} · {fmtNum(standings.length)} deelnemers
        </div>
      )}
    </div>
  );
}
