import { useMemo, useState } from 'react';
import { ACHIEVEMENTS, achievementIcon, UNKNOWN_REASON, type AchievementDef, type AchievementState, type UserAchievements } from '../achievements';
import { fmtNum, fmtPct } from '../utils';
import { Segmented } from './ui';

export function AchievementIcon({ def, size = 22 }: { def: AchievementDef; size?: number }) {
  const icon = achievementIcon(def);
  return (
    <span
      className="ach-icon"
      style={{ width: size, height: size, maskImage: `url("${icon}")`, WebkitMaskImage: `url("${icon}")` }}
      aria-hidden
    />
  );
}

const STATE_LABEL: Record<AchievementState, string> = {
  unlocked: 'Behaald',
  locked: 'Nog niet behaald',
  unknown: 'Niet te bepalen',
};

const ORDER: Record<AchievementState, number> = { unlocked: 0, locked: 1, unknown: 2 };

function Badge({ def, state, pinned }: { def: AchievementDef; state: AchievementState; pinned: boolean }) {
  const tip = `${def.title}: ${def.description}. ${STATE_LABEL[state]}.${state === 'unknown' ? ` ${UNKNOWN_REASON[def.id]}` : ''}${pinned ? ' Staat op het profiel.' : ''}`;
  return (
    <li className={`ach ach-${state}`} title={tip}>
      <span className="ach-medal">
        <AchievementIcon def={def} />
        {pinned && <span className="ach-pin" aria-label="Op profiel">★</span>}
      </span>
      <span className="ach-title">{def.title}</span>
      <span className="ach-desc">{def.description}</span>
    </li>
  );
}

/** Alle achievements van één gebruiker, behaalde eerst. */
export function AchievementGrid({ result, showcased }: { result: UserAchievements; showcased: string[] }) {
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const items = useMemo(
    () =>
      ACHIEVEMENTS.map((def) => ({ def, state: result.byId.get(def.id) ?? 'locked' }))
        .filter(({ state }) => filter === 'all' || state === filter)
        .sort((a, b) => ORDER[a.state] - ORDER[b.state]),
    [result, filter],
  );

  return (
    <>
      <div className="ach-head">
        <div className="ach-progress">
          <div className="ach-progress-text">
            <strong>{result.unlocked}</strong> van {result.known} behaald
          </div>
          <div className="funnel-track">
            <div className="funnel-bar" style={{ width: `${(result.unlocked / result.known) * 100}%` }} />
          </div>
        </div>
        <Segmented
          label="Toon"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'Alles' }, { value: 'unlocked', label: 'Behaald' }, { value: 'locked', label: 'Nog niet' }]}
        />
      </div>
      <ul className="ach-grid">
        {items.map(({ def, state }) => (
          <Badge key={def.id} def={def} state={state} pinned={showcased.includes(def.id)} />
        ))}
      </ul>
    </>
  );
}

/** Per achievement: welk deel van de gebruikers hem heeft. */
export function AchievementRarity({ all, userCount }: { all: Map<string, UserAchievements>; userCount: number }) {
  const [sort, setSort] = useState<'rare' | 'common'>('rare');
  const rows = useMemo(() => {
    const list = ACHIEVEMENTS.filter((d) => !UNKNOWN_REASON[d.id]).map((def) => {
      let n = 0;
      all.forEach((r) => r.byId.get(def.id) === 'unlocked' && n++);
      return { def, n };
    });
    return list.sort((a, b) => (sort === 'rare' ? a.n - b.n : b.n - a.n));
  }, [all, sort]);

  return (
    <>
      <div className="ach-head">
        <p className="panel-hint">Percentage van alle {fmtNum(userCount)} gebruikers dat de achievement heeft.</p>
        <Segmented
          label="Sorteer"
          value={sort}
          onChange={setSort}
          options={[{ value: 'rare', label: 'Zeldzaamst' }, { value: 'common', label: 'Meest behaald' }]}
        />
      </div>
      <ul className="rarity">
        {rows.map(({ def, n }) => (
          <li key={def.id} title={def.description}>
            <span className="rarity-icon"><AchievementIcon def={def} size={18} /></span>
            <span className="rarity-name">
              {def.title}
              <span className="muted small"> {def.description}</span>
            </span>
            <span className="rarity-bar" aria-hidden><span style={{ width: `${userCount ? (n / userCount) * 100 : 0}%` }} /></span>
            <span className="rarity-pct">{userCount ? fmtPct(n / userCount) : '—'}</span>
            <span className="rarity-n muted small">{fmtNum(n)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small rarity-foot">
        {Object.keys(UNKNOWN_REASON).length} achievements zijn niet te bepalen omdat de benodigde gegevens niet in Firestore staan
        (premium, profiel delen, geboortedatum en vorige reeks).
      </p>
    </>
  );
}
