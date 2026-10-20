import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { useData, type UserStats } from '../data';
import { Avatar, Card, Segmented } from '../components/ui';
import { IconSearch } from '../components/icons';
import { addDays, displayName, fmtDateTime, fmtNum, startOfDay } from '../utils';

type AudienceKind = 'all' | 'active' | 'inactive' | 'never' | 'pick';

const AUDIENCES: { value: AudienceKind; label: string; hint: string }[] = [
  { value: 'all', label: 'Iedereen', hint: 'Alle gebruikers' },
  { value: 'active', label: 'Actief', hint: 'Biertje gelogd in de laatste 30 dagen' },
  { value: 'inactive', label: 'Slapend', hint: 'Laatste biertje langer dan 30 dagen geleden' },
  { value: 'never', label: 'Nooit gelogd', hint: 'Nog nooit een biertje gelogd' },
  { value: 'pick', label: 'Kies mensen', hint: 'Zelf gekozen gebruikers' },
];

const TITLE_MAX = 65;
const BODY_MAX = 240;

interface SendResult {
  requested: number;
  eligible: number;
  delivered: number;
  failed: number;
  skippedOptOut: number;
  skippedNoToken: number;
  expiredTokensRemoved: number;
}

interface LogEntry extends Partial<SendResult> {
  id: string;
  title: string;
  body: string;
  audienceLabel: string;
  sentByEmail: string;
  sentAt: Date | null;
}

function sendErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  const msg = (err as { message?: string }).message ?? '';
  if (code === 'functions/not-found' || code === 'functions/internal' && /not found|404/i.test(msg)) {
    return 'De Cloud Function sendPush is nog niet uitgerold. Zie "Pushberichten" in de README.';
  }
  if (code === 'functions/permission-denied') return 'Alleen beheerders kunnen berichten sturen.';
  if (code === 'functions/invalid-argument') return msg;
  if (code === 'functions/unavailable' || code === 'functions/internal') {
    return 'De Cloud Function is niet bereikbaar. Is hij uitgerold (zie README)? Probeer het anders zo opnieuw.';
  }
  return msg || 'Versturen mislukt. Probeer het opnieuw.';
}

function canReceive(u: UserStats) {
  return u.hasPushToken && u.notifyPushEnabled !== false;
}

export default function Messages() {
  const { data, now } = useData();
  const [params] = useSearchParams();
  const preset = useMemo(() => (params.get('u') ?? '').split(',').filter((id) => data!.usersById.has(id)), [params, data]);

  const [kind, setKind] = useState<AudienceKind>(preset.length ? 'pick' : 'active');
  const [picked, setPicked] = useState<string[]>(preset);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: true; r: SendResult } | { ok: false; text: string } | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'pushLog'), orderBy('sentAt', 'desc'), limit(20)),
        (snap) => {
          setLogError(null);
          setLog(snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: String(x.title ?? ''),
              body: String(x.body ?? ''),
              audienceLabel: String(x.audienceLabel ?? ''),
              sentByEmail: String(x.sentByEmail ?? ''),
              sentAt: typeof x.sentAt?.toDate === 'function' ? x.sentAt.toDate() : null,
              delivered: x.delivered, failed: x.failed, eligible: x.eligible, requested: x.requested,
              skippedOptOut: x.skippedOptOut, skippedNoToken: x.skippedNoToken,
            };
          }));
        },
        (err) => setLogError(err.message),
      ),
    [],
  );

  const recipients = useMemo(() => {
    const d30 = addDays(startOfDay(now), -29);
    const users = data!.users;
    switch (kind) {
      case 'all': return users;
      case 'active': return users.filter((u) => u.lastBeer && u.lastBeer >= d30);
      case 'inactive': return users.filter((u) => u.lastBeer && u.lastBeer < d30);
      case 'never': return users.filter((u) => u.beerCount === 0);
      case 'pick': return picked.map((id) => data!.usersById.get(id)!).filter(Boolean);
    }
  }, [kind, picked, data, now]);

  const counts = useMemo(() => ({
    total: recipients.length,
    reachable: recipients.filter(canReceive).length,
    optedOut: recipients.filter((u) => u.notifyPushEnabled === false).length,
    noDevice: recipients.filter((u) => !u.hasPushToken && u.notifyPushEnabled !== false).length,
  }), [recipients]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return data!.users.filter((u) => !picked.includes(u.uid) && `${u.username} ${u.email}`.toLowerCase().includes(q)).slice(0, 6);
  }, [search, data, picked]);

  const audienceLabel =
    kind === 'pick'
      ? recipients.length === 1 ? displayName(recipients[0]) : `${recipients.length} gekozen gebruikers`
      : AUDIENCES.find((a) => a.value === kind)!.label;

  const valid = title.trim() && body.trim() && title.length <= TITLE_MAX && body.length <= BODY_MAX && counts.reachable > 0;

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const call = httpsCallable<unknown, SendResult>(functions, 'sendPush');
      const res = await call({
        uids: recipients.filter(canReceive).map((u) => u.uid),
        title: title.trim(),
        body: body.trim(),
        audienceLabel,
      });
      setResult({ ok: true, r: res.data });
      setTitle('');
      setBody('');
    } catch (err) {
      setResult({ ok: false, text: sendErrorMessage(err) });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Berichten</h1>
          <p className="muted">Stuur een pushbericht naar de telefoons van BrewMate-gebruikers. Wie pushmeldingen heeft uitgezet, krijgt niets.</p>
        </div>
      </header>

      {result && (
        result.ok ? (
          <div className="banner ok" role="status">
            Verstuurd naar {fmtNum(result.r.delivered)} {result.r.delivered === 1 ? 'telefoon' : 'telefoons'}.
            {result.r.failed > 0 && ` ${fmtNum(result.r.failed)} niet afgeleverd.`}
            {result.r.expiredTokensRemoved > 0 && ` ${fmtNum(result.r.expiredTokensRemoved)} verlopen apparaten opgeruimd.`}
          </div>
        ) : (
          <div className="banner error" role="alert">{result.text}</div>
        )
      )}

      <div className="msg-layout">
        <Card title="Nieuw bericht">
          <div className="form msg-form">
            <div className="field">
              <span className="field-label">Ontvangers</span>
              <Segmented label="Ontvangers" value={kind} onChange={(v) => { setKind(v); setConfirming(false); }} options={AUDIENCES.map(({ value, label }) => ({ value, label }))} />
              <span className="muted small">{AUDIENCES.find((a) => a.value === kind)!.hint}</span>
            </div>

            {kind === 'pick' && (
              <div className="field">
                <div className="cmp-picker">
                  {picked.map((id) => {
                    const u = data!.usersById.get(id);
                    if (!u) return null;
                    return (
                      <span key={id} className="cmp-chip" style={{ ['--c' as string]: canReceive(u) ? 'var(--ok)' : 'var(--line)' }}>
                        <Avatar url={u.photoUrl} name={displayName(u)} size={24} />
                        <span>{displayName(u)}</span>
                        <button type="button" onClick={() => setPicked(picked.filter((x) => x !== id))} aria-label={`${displayName(u)} weghalen`}>×</button>
                      </span>
                    );
                  })}
                  <div className="cmp-add">
                    <label className="search">
                      <IconSearch />
                      <input type="search" placeholder="Zoek een gebruiker" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Zoek een ontvanger" />
                    </label>
                    {candidates.length > 0 && (
                      <ul className="cmp-suggest">
                        {candidates.map((u) => (
                          <li key={u.uid}>
                            <button type="button" onClick={() => { setPicked([...picked, u.uid]); setSearch(''); }}>
                              <Avatar url={u.photoUrl} name={displayName(u)} size={24} />
                              <span>{displayName(u)}</span>
                              <span className="muted small">{canReceive(u) ? 'kan push ontvangen' : 'geen push'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <dl className="msg-reach">
              <div className="strong-cell"><dt>Ontvangen het bericht</dt><dd>{fmtNum(counts.reachable)}</dd></div>
              <div><dt>Meldingen uitgezet</dt><dd>{fmtNum(counts.optedOut)}</dd></div>
              <div><dt>Geen apparaat bekend</dt><dd>{fmtNum(counts.noDevice)}</dd></div>
            </dl>

            <label>
              <span className="label-row">Titel <span className={title.length > TITLE_MAX ? 'counter over' : 'counter'}>{title.length}/{TITLE_MAX}</span></span>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setConfirming(false); }} placeholder="Bijv. Proost op het weekend 🍻" maxLength={TITLE_MAX + 20} />
            </label>
            <label>
              <span className="label-row">Bericht <span className={body.length > BODY_MAX ? 'counter over' : 'counter'}>{body.length}/{BODY_MAX}</span></span>
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setConfirming(false); }} rows={4} placeholder="Wat wil je zeggen?" maxLength={BODY_MAX + 40} />
            </label>

            {!confirming ? (
              <button type="button" className="btn primary" disabled={!valid || sending} onClick={() => setConfirming(true)}>
                Bericht versturen
              </button>
            ) : (
              <div className="confirm-box" role="alertdialog" aria-label="Bevestigen">
                <p>
                  Dit stuurt direct een pushbericht naar <strong>{fmtNum(counts.reachable)} {counts.reachable === 1 ? 'persoon' : 'mensen'}</strong>. Dit kun je niet terugdraaien.
                </p>
                <div className="confirm-actions">
                  <button type="button" className="btn primary" onClick={send} disabled={sending}>
                    {sending ? 'Bezig met versturen…' : `Ja, verstuur naar ${fmtNum(counts.reachable)}`}
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={sending}>Annuleren</button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="msg-preview-wrap" aria-label="Voorbeeld op telefoon">
          <div className="phone">
            <div className="phone-time">{now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="phone-date">{now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="notif">
              <img src="/favicon.svg" alt="" width={34} height={34} />
              <div className="notif-body">
                <div className="notif-top"><span>BrewMate</span><span>nu</span></div>
                <div className="notif-title">{title.trim() || 'Titel van je bericht'}</div>
                <div className="notif-text">{body.trim() || 'Hier komt de tekst van je bericht.'}</div>
              </div>
            </div>
          </div>
          <p className="muted small center-text">Zo ongeveer ziet het er op het vergrendelscherm uit.</p>
        </div>
      </div>

      <Card title="Eerder verstuurd">
        {logError ? (
          <p className="muted">Het logboek kan niet geladen worden: {logError}. Beheerders moeten de collectie <code>pushLog</code> mogen lezen (zie firestore.rules.example).</p>
        ) : !log ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : !log.length ? (
          <p className="muted">Nog geen berichten verstuurd vanuit het dashboard.</p>
        ) : (
          <ul className="msg-log">
            {log.map((m) => (
              <li key={m.id}>
                <div className="msg-log-main">
                  <div className="strong">{m.title}</div>
                  <div className="muted">{m.body}</div>
                </div>
                <div className="msg-log-meta small">
                  <div><strong>{fmtNum(m.delivered ?? 0)}</strong> afgeleverd{m.failed ? `, ${fmtNum(m.failed)} mislukt` : ''}</div>
                  <div className="muted">{m.audienceLabel}</div>
                  <div className="muted">{fmtDateTime(m.sentAt)}{m.sentByEmail ? ` door ${m.sentByEmail}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="muted small">
        Tip: op de pagina van een gebruiker staat een knop om direct een bericht aan die persoon te sturen. <Link to="/users" className="text-link">Naar gebruikers</Link>
      </p>
    </div>
  );
}
