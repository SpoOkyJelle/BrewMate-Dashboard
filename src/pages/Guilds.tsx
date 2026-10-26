import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Card, ConfirmButton, Empty, Segmented } from '../components/ui';
import { IconSearch } from '../components/icons';
import { fmtNum } from '../utils';
import {
  LEAGUES, currentSeasonId, leagueForTier, seasonLabel, useGuilds, type GuildRow,
} from '../guilds';

interface PlanMove {
  guildId: string; name: string; tag: string;
  tier: number; newTier: number; outcome: 'promoted' | 'relegated' | 'stayed';
  points: number; rank: number; tierSize: number;
}
interface RolloverResult {
  dryRun: boolean; season: string; newSeason?: string;
  minTierSize: number; promoted: number; relegated: number; moves: PlanMove[];
}

export function Emblem({ color, tag, size = 40 }: { color: string; tag: string; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: size * 0.28, background: color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: size * 0.3, letterSpacing: 0.5, flexShrink: 0,
      }}
      aria-hidden
    >
      {(tag || '?').slice(0, 3).toUpperCase()}
    </span>
  );
}

export function LeagueBadge({ tier }: { tier: number }) {
  const l = leagueForTier(tier);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
        color: l.color, background: `${l.color}1f`, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: l.color }} />
      {l.name}
    </span>
  );
}

export default function Guilds() {
  const { guilds, error } = useGuilds();
  const [tierFilter, setTierFilter] = useState<number>(0); // 0 = all
  const [query, setQuery] = useState('');
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);

  const runCleanup = async () => {
    setCleanupMsg(null);
    const res = await httpsCallable<unknown, { guilds: number; legacyDeleted: number }>(functions, 'cleanupGuildScores')();
    const { guilds: n, legacyDeleted } = res.data;
    setCleanupMsg(`Opgeschoond: ${legacyDeleted} oude scoredocs verwijderd, ${n} guilds herberekend.`);
  };

  const [plan, setPlan] = useState<RolloverResult | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const runReset = async () => {
    setResetMsg(null); setPlanErr(null); setPlan(null);
    try {
      const res = await httpsCallable<unknown, { guilds: number; scoresDeleted: number; historyDeleted: number; locksDeleted: number }>(
        functions, 'resetLeagues',
      )();
      const { guilds: n, scoresDeleted, historyDeleted } = res.data;
      setResetMsg(`${n} guilds teruggezet naar de laagste divisie. ${scoresDeleted} scoredocs en ${historyDeleted} geschiedenis-items verwijderd.`);
    } catch (e) {
      setPlanErr(`${(e as { code?: string })?.code ?? 'fout'}: ${(e as { message?: string })?.message ?? String(e)}`);
    }
  };

  const runRollover = async (dryRun: boolean) => {
    setPlanErr(null);
    try {
      const res = await httpsCallable<{ dryRun: boolean }, RolloverResult>(functions, 'simulateLeagueRollover')({ dryRun });
      setPlan(res.data);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const message = (e as { message?: string })?.message ?? String(e);
      setPlanErr(
        code === 'functions/internal' || code === 'internal'
          ? 'De functie "simulateLeagueRollover" reageert niet. Is hij al gedeployed? (firebase deploy --only functions)'
          : `${code ?? 'fout'}: ${message}`,
      );
    }
  };

  const perTier = useMemo(() => {
    const counts = new Map<number, number>();
    (guilds ?? []).forEach((g) => counts.set(g.leagueTier, (counts.get(g.leagueTier) ?? 0) + 1));
    return counts;
  }, [guilds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (guilds ?? [])
      .filter((g) => (tierFilter === 0 ? true : g.leagueTier === tierFilter))
      .filter((g) => !q || `${g.name} ${g.tag}`.toLowerCase().includes(q));
  }, [guilds, tierFilter, query]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Guilds</h1>
          <p className="muted">
            {guilds ? `${fmtNum(guilds.length)} guilds` : 'Laden…'} · seizoen {seasonLabel(currentSeasonId())}
          </p>
        </div>
        <ConfirmButton
          label="Scores opschonen"
          confirmLabel="Ja, opschonen"
          danger={false}
          title="Verwijdert oude dubbele scoredocs en herberekent de seizoenspunten"
          onConfirm={runCleanup}
        />
      </header>

      {error && <div className="banner error" role="alert">De guilds kunnen niet geladen worden: {error}</div>}
      {cleanupMsg && <div className="banner ok" role="status">{cleanupMsg}</div>}

      {/* Verdeling over de divisies */}
      <Card title="Divisies" hint="Aantal guilds per league">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[...LEAGUES].sort((a, b) => b.tier - a.tier).map((l) => (
            <button
              key={l.tier}
              onClick={() => setTierFilter((t) => (t === l.tier ? 0 : l.tier))}
              style={{
                textAlign: 'left', cursor: 'pointer', borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${tierFilter === l.tier ? l.color : 'var(--border)'}`,
                background: tierFilter === l.tier ? `${l.color}14` : 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: l.color }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{l.name}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{fmtNum(perTier.get(l.tier) ?? 0)}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Seizoen afrekenen / simuleren */}
      <Card
        title="Seizoen afrekenen"
        hint="Promotie/degradatie van de top/onder 25% per divisie"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => runRollover(true)}>Preview (simulatie)</button>
            <ConfirmButton
              label="Nu afrekenen"
              confirmLabel="Ja, echt afrekenen"
              title="Voert de rollover nu echt uit: verplaatst tiers en zet de punten op 0"
              onConfirm={() => runRollover(false)}
            />
            <ConfirmButton
              label="Divisies resetten"
              confirmLabel="Ja, alles resetten"
              title="Zet alle guilds terug naar de laagste divisie en wist scores, geschiedenis en locks"
              onConfirm={runReset}
            />
          </div>
        }
      >
        {planErr && <div className="banner error" role="alert">{planErr}</div>}
        {resetMsg && <div className="banner ok" role="status">{resetMsg}</div>}
        {!plan ? (
          <p className="muted">
            Preview toont wie zou promoveren of degraderen op de huidige stand, zónder iets te wijzigen.
            Een divisie heeft minstens een paar guilds nodig voordat er beweging is.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="banner ok" role="status">
              {plan.dryRun
                ? `Simulatie van seizoen ${seasonLabel(plan.season)}: ${plan.promoted} promoties, ${plan.relegated} degradaties (niets gewijzigd).`
                : `Afgerekend: seizoen ${seasonLabel(plan.season)} → ${plan.newSeason ? seasonLabel(plan.newSeason) : '?'}. ${plan.promoted} gepromoveerd, ${plan.relegated} gedegradeerd, punten gereset.`}
            </div>
            {plan.moves.length === 0 ? (
              <Empty>Geen guilds om af te rekenen</Empty>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plan.moves.map((m) => <PlanRow key={m.guildId} m={m} />)}
              </ul>
            )}
            <p className="muted small">
              Beweging vereist minstens {plan.minTierSize} guilds in een divisie.
            </p>
          </div>
        )}
      </Card>

      {/* Ranglijst */}
      <Card
        title="Ranglijst"
        hint={tierFilter === 0 ? 'Alle guilds op seizoenscore' : `Alleen ${leagueForTier(tierFilter).name}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented
              label="Filter op divisie"
              value={tierFilter}
              onChange={setTierFilter}
              options={[{ value: 0, label: 'Alle' }, ...LEAGUES.map((l) => ({ value: l.tier, label: `L${l.tier}` }))]}
            />
            <label className="search">
              <IconSearch />
              <input type="search" placeholder="Zoek guild" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Zoek guild" />
            </label>
          </div>
        }
      >
        {!guilds ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : !filtered.length ? (
          <Empty>Geen guilds gevonden</Empty>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((g, i) => <GuildRowItem key={g.id} g={g} rank={tierFilter === 0 ? i + 1 : null} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PlanRow({ m }: { m: PlanMove }) {
  const from = leagueForTier(m.tier);
  const to = leagueForTier(m.newTier);
  const color = m.outcome === 'promoted' ? '#10B981' : m.outcome === 'relegated' ? '#EF4444' : 'var(--muted)';
  const label = m.outcome === 'promoted' ? '▲ Promotie' : m.outcome === 'relegated' ? '▼ Degradatie' : 'Blijft';
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
    }}>
      <Emblem color={to.color} tag={m.tag} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--muted)' }}>[{m.tag}] </span>{m.name}
        </div>
        <div className="muted small">#{m.rank}/{m.tierSize} · {fmtNum(m.points)} punten</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color }}>{label}</div>
        <div className="muted small">{from.name}{m.newTier !== m.tier ? ` → ${to.name}` : ''}</div>
      </div>
    </li>
  );
}

function GuildRowItem({ g, rank }: { g: GuildRow; rank: number | null }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank != null ? `${rank}` : '';
  return (
    <li>
      <Link
        to={`/guilds/${g.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
          border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', textDecoration: 'none', color: 'inherit',
        }}
      >
        {rank != null && <span style={{ width: 26, textAlign: 'center', fontWeight: 800, color: 'var(--muted)' }}>{medal}</span>}
        <Emblem color={g.color} tag={g.tag} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--muted)' }}>[{g.tag}] </span>{g.name}
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <LeagueBadge tier={g.leagueTier} />
            <span className="muted small">{g.memberCount} {g.memberCount === 1 ? 'lid' : 'leden'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: g.color }}>{fmtNum(g.effectivePoints)}</div>
          <div className="muted small">punten</div>
        </div>
      </Link>
    </li>
  );
}
