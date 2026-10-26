import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../data';
import { Avatar, Card, Empty } from '../components/ui';
import { IconArrowLeft } from '../components/icons';
import { fmtNum, fmtVolume } from '../utils';
import { LeagueBadge } from './Guilds';
import {
  currentSeasonId, leagueForTier, seasonLabel,
  useGuildHistory, useGuildMembers, useGuildScores, useGuilds,
} from '../guilds';

export default function GuildDetail() {
  const { id = '' } = useParams();
  const { data } = useData();
  const { guilds } = useGuilds();
  const guild = useMemo(() => guilds?.find((g) => g.id === id) ?? null, [guilds, id]);
  const members = useGuildMembers(id);
  const scores = useGuildScores(id, currentSeasonId());
  const history = useGuildHistory(id);

  if (guilds && !guild) {
    return (
      <div className="page narrow">
        <Link to="/guilds" className="btn sm"><IconArrowLeft /> Terug</Link>
        <Card><Empty>Deze guild bestaat niet meer.</Empty></Card>
      </div>
    );
  }
  if (!guild) return <div className="center-block"><div className="spinner" /></div>;

  const league = leagueForTier(guild.leagueTier);

  // Merge members with their season scores, biggest contributor first.
  const scoreByUid = new Map((scores ?? []).map((s) => [s.uid, s]));
  const contributions = (members ?? [])
    .map((m) => ({ member: m, score: scoreByUid.get(m.uid) }))
    .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0));
  const total = (scores ?? []).reduce((sum, s) => sum + s.score, 0);

  return (
    <div className="page narrow">
      <Link to="/guilds" className="btn sm" style={{ alignSelf: 'flex-start' }}><IconArrowLeft /> Guilds</Link>

      {/* Banner */}
      <div style={{ borderRadius: 18, padding: 20, background: guild.color, color: '#fff' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>[{guild.tag}]</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{guild.name}</div>
        {guild.description && <div style={{ fontSize: 14, lineHeight: 1.4, opacity: 0.92, marginTop: 4 }}>{guild.description}</div>}
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginTop: 10 }}>
          {league.name} · {guild.memberCount} {guild.memberCount === 1 ? 'lid' : 'leden'}
        </div>
      </div>

      {/* Season summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Stat label={`Seizoenspunten · ${seasonLabel(currentSeasonId())}`} value={fmtNum(total)} color={guild.color} />
        <Stat label="Divisie" value={<LeagueBadge tier={guild.leagueTier} />} />
      </div>

      {/* Top contributors */}
      <Card title="Grootste bijdragers" hint="Seizoenspunten per lid">
        {!members ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : !contributions.length ? (
          <Empty>Nog geen leden</Empty>
        ) : (
          <ul className="people" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {contributions.map(({ member: m, score }, i) => {
              const u = data?.usersById.get(m.uid);
              return (
                <li key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                  <span style={{ width: 22, textAlign: 'center', fontWeight: 800, color: 'var(--muted)' }}>{i + 1}</span>
                  <Link to={`/users/${m.uid}`} className="lb-user" style={{ flex: 1, minWidth: 0 }}>
                    <Avatar url={u?.photoUrl ?? m.profilePictureUrl} name={m.username || '?'} size={36} />
                    <span style={{ minWidth: 0 }}>
                      <span className="lb-name">
                        {m.username || 'Brewer'}{' '}
                        {m.role !== 'member' && (
                          <span className="status s-active">{m.role === 'owner' ? 'Owner' : 'Admin'}</span>
                        )}
                      </span>
                      <span className="muted small block">
                        {score ? `${score.activeDays} actieve dagen · ${fmtVolume(score.totalCl)}` : 'nog niet actief dit seizoen'}
                      </span>
                    </span>
                  </Link>
                  <span style={{ fontSize: 16, fontWeight: 800, color: guild.color }}>{fmtNum(score?.score ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* League history */}
      <Card title="Seizoensgeschiedenis" hint="Promoties en degradaties">
        {!history ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : !history.length ? (
          <Empty>Nog geen afgeronde seizoenen</Empty>
        ) : (
          <ul className="people" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.map((h) => (
              <li key={h.season} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <span style={{ width: 90, fontWeight: 700 }}>{seasonLabel(h.season)}</span>
                <span style={{ flex: 1 }}>
                  <OutcomeBadge outcome={h.outcome} fromTier={h.tier} toTier={h.newTier} />
                  <span className="muted small block">#{h.rankInTier} van {h.tierSize} · {fmtNum(h.finalPoints)} punten</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', background: 'var(--surface)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div className="muted small" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function OutcomeBadge({ outcome, fromTier, toTier }: { outcome: 'promoted' | 'relegated' | 'stayed'; fromTier: number; toTier: number }) {
  if (outcome === 'promoted') {
    return <span className="status s-active">▲ Gepromoveerd naar {leagueForTier(toTier).name}</span>;
  }
  if (outcome === 'relegated') {
    return <span className="status s-blocked">▼ Gedegradeerd naar {leagueForTier(toTier).name}</span>;
  }
  return <span className="muted small">Gebleven in {leagueForTier(fromTier).name}</span>;
}
