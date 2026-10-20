import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force';
import { useData, type Dataset, type UserStats } from '../data';
import { Avatar, Card, Empty, Segmented } from '../components/ui';
import { dayKey, displayName, fmtNum } from '../utils';

interface Node extends SimulationNodeDatum {
  id: string;
  user: UserStats;
  r: number;
  group: number;
}
interface Edge extends SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  /** Aantal dagen dat beide vrienden een biertje logden. */
  shared: number;
}

const GROUP_COLORS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const groupColor = (g: number) => (g < GROUP_COLORS.length ? `var(${GROUP_COLORS[g]})` : 'var(--muted)');
const idOf = (x: string | Node) => (typeof x === 'string' ? x : x.id);

/** Bouwt knopen, verbindingen en groepjes (gewogen label propagation). */
function buildGraph(data: Dataset, includeLonely: boolean) {
  const days = new Map<string, Set<string>>();
  for (const b of data.beers) {
    if (!b.date) continue;
    const s = days.get(b.userId) ?? new Set<string>();
    s.add(dayKey(b.date));
    days.set(b.userId, s);
  }

  const edges: Edge[] = [];
  for (const u of data.users) {
    for (const f of u.friendIds) {
      if (u.uid >= f || !data.usersById.has(f)) continue;
      const a = days.get(u.uid);
      const b = days.get(f);
      let shared = 0;
      if (a && b) {
        const [small, big] = a.size < b.size ? [a, b] : [b, a];
        small.forEach((d) => big.has(d) && shared++);
      }
      edges.push({ source: u.uid, target: f, shared });
    }
  }

  const users = data.users.filter((u) => includeLonely || u.friendIds.some((f) => data.usersById.has(f)));
  const ids = users.map((u) => u.uid).sort();

  // Groepjes zoeken met de Louvain-methode (lokale stap): iedereen schuift naar het groepje
  // dat de modularity het meest verhoogt. Gewicht: vriendschap + aantal dagen samen gedronken.
  const idSet = new Set(ids);
  const neighbours = new Map<string, { id: string; w: number }[]>();
  let m2 = 0; // 2 × totaal gewicht
  for (const e of edges) {
    const s = idOf(e.source);
    const t = idOf(e.target);
    if (!idSet.has(s) || !idSet.has(t)) continue;
    const w = 1 + e.shared;
    neighbours.set(s, [...(neighbours.get(s) ?? []), { id: t, w }]);
    neighbours.set(t, [...(neighbours.get(t) ?? []), { id: s, w }]);
    m2 += 2 * w;
  }
  const degree = new Map(ids.map((id) => [id, (neighbours.get(id) ?? []).reduce((s, n) => s + n.w, 0)]));
  const label = new Map(ids.map((id) => [id, id]));
  const tot = new Map(ids.map((id) => [id, degree.get(id)!]));
  for (let round = 0; round < 30 && m2 > 0; round++) {
    let moved = false;
    for (const id of ids) {
      const k = degree.get(id)!;
      if (!k) continue;
      const own = label.get(id)!;
      tot.set(own, tot.get(own)! - k);
      const links = new Map<string, number>();
      for (const n of neighbours.get(id) ?? []) {
        const c = label.get(n.id)!;
        links.set(c, (links.get(c) ?? 0) + n.w);
      }
      let best = own;
      let bestGain = (links.get(own) ?? 0) - (tot.get(own)! * k) / m2;
      for (const [c, w] of links) {
        const gain = w - (tot.get(c)! * k) / m2;
        if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) < 1e-9 && c < best)) {
          best = c;
          bestGain = gain;
        }
      }
      tot.set(best, tot.get(best)! + k);
      if (best !== own) {
        label.set(id, best);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Groepen nummeren van groot naar klein; losse personen krijgen geen groepskleur.
  const members = new Map<string, string[]>();
  label.forEach((l, id) => members.set(l, [...(members.get(l) ?? []), id]));
  const ordered = [...members.values()].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
  const groupOf = new Map<string, number>();
  ordered.forEach((m, i) => m.forEach((id) => groupOf.set(id, i)));

  const maxBeers = Math.max(1, ...users.map((u) => u.beerCount));
  const nodes: Node[] = users.map((u) => ({
    id: u.uid,
    user: u,
    r: 5 + Math.sqrt(u.beerCount / maxBeers) * 16,
    group: groupOf.get(u.uid) ?? 99,
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const groups = ordered.map((m, i) => {
    const set = new Set(m);
    const inner = edges.filter((e) => set.has(idOf(e.source)) && set.has(idOf(e.target)));
    return {
      index: i,
      members: m.map((id) => data.usersById.get(id)!).sort((a, b) => b.beerCount - a.beerCount),
      beers: m.reduce((s, id) => s + (data.usersById.get(id)?.beerCount ?? 0), 0),
      sharedDays: inner.reduce((s, e) => s + e.shared, 0),
    };
  });

  return {
    nodes,
    edges: edges.filter((e) => nodeIds.has(idOf(e.source)) && nodeIds.has(idOf(e.target))),
    groups,
  };
}

export default function Network() {
  const { data } = useData();
  const [includeLonely, setIncludeLonely] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusGroup, setFocusGroup] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 620 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const simRef = useRef<Simulation<Node, Edge> | null>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; id?: string; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  // Alleen opnieuw opbouwen als de vriendschappen of gebruikers veranderen, niet bij elk biertje.
  const graphKey = useMemo(
    () => `${includeLonely}|${data!.users.length}|${data!.friendshipCount}`,
    [data, includeLonely],
  );
  const graph = useMemo(() => buildGraph(data!, includeLonely), [graphKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: Math.max(460, Math.min(720, window.innerHeight - 260)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sim = forceSimulation<Node, Edge>(graph.nodes)
      .force('link', forceLink<Node, Edge>(graph.edges).id((n) => n.id).distance((e) => 70 - Math.min(30, e.shared)).strength(0.5))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.05))
      .force('y', forceY(0).strength(0.06))
      .force('collide', forceCollide<Node>().radius((n) => n.r + 4));
    simRef.current = sim;

    // Zodra de layout stilstaat: inzoomen zodat iedereen in beeld is (alleen de eerste keer).
    let fitted = false;
    const fit = () => {
      if (fitted || !graph.nodes.length) return;
      fitted = true;
      const xs = graph.nodes.map((n) => n.x ?? 0);
      const ys = graph.nodes.map((n) => n.y ?? 0);
      const pad = 60;
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
      const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
      const { w: vw, h: vh } = sizeRef.current;
      const k = Math.min(2, Math.max(0.3, Math.min(vw / w, vh / h)));
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      setView({ k, x: -cx * k, y: -cy * k });
    };

    if (reduced) {
      sim.stop();
      sim.tick(300);
      fit();
      setTick((t) => t + 1);
    } else {
      sim.on('tick', () => {
        setTick((t) => t + 1);
        if (sim.alpha() < 0.05) fit();
      });
    }
    return () => {
      sim.stop();
    };
  }, [graph]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      const s = idOf(e.source);
      const t = idOf(e.target);
      m.set(s, (m.get(s) ?? new Set()).add(t));
      m.set(t, (m.get(t) ?? new Set()).add(s));
    }
    return m;
  }, [graph]);

  const maxShared = Math.max(1, ...graph.edges.map((e) => e.shared));
  const active = hover ?? selected;
  const isLit = (id: string) => {
    if (focusGroup !== null) return graph.nodes.find((n) => n.id === id)?.group === focusGroup;
    if (!active) return true;
    return id === active || !!neighbours.get(active)?.has(id);
  };

  // --- Pannen, zoomen en slepen ---
  const toWorld = (cx: number, cy: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (cx - rect.left - size.w / 2 - view.x) / view.k, y: (cy - rect.top - size.h / 2 - view.y) / view.k };
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - size.w / 2;
    const my = e.clientY - rect.top - size.h / 2;
    const k = Math.min(4, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setView((v) => ({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }));
  };
  const onPointerDown = (e: RPointerEvent, nodeId?: string) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: nodeId ? 'node' : 'pan', id: nodeId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    if (nodeId) simRef.current?.alphaTarget(0.25).restart();
    e.stopPropagation();
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    } else {
      const n = graph.nodes.find((x) => x.id === d.id);
      if (n) {
        const p = toWorld(e.clientX, e.clientY);
        n.fx = p.x;
        n.fy = p.y;
      }
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'node') {
      simRef.current?.alphaTarget(0);
      const n = graph.nodes.find((x) => x.id === d.id);
      if (n) { n.fx = null; n.fy = null; }
      if (!d.moved) { setSelected((s) => (s === d.id ? null : d.id!)); setFocusGroup(null); }
    } else if (!d.moved) {
      setSelected(null);
      setFocusGroup(null);
    }
  };

  const sel = selected ? data!.usersById.get(selected) : null;
  const buddies = useMemo(() => {
    if (!selected) return [];
    return graph.edges
      .filter((e) => idOf(e.source) === selected || idOf(e.target) === selected)
      .map((e) => ({ user: data!.usersById.get(idOf(e.source) === selected ? idOf(e.target) : idOf(e.source))!, shared: e.shared }))
      .filter((b) => b.user)
      .sort((a, b) => b.shared - a.shared);
  }, [selected, graph, data]);

  const mostConnected = [...graph.nodes].sort((a, b) => (neighbours.get(b.id)?.size ?? 0) - (neighbours.get(a.id)?.size ?? 0))[0];
  const avgFriends = graph.nodes.length ? (graph.edges.length * 2) / graph.nodes.length : 0;
  const showLabel = (n: Node) => view.k > 1.4 || n.r > 12 || n.id === active || (active && neighbours.get(active)?.has(n.id));

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>Vriendennetwerk</h1>
          <p className="muted">Wie is met wie bevriend. Dikke lijnen: vrienden die vaak op dezelfde dag drinken. Kleuren: groepjes.</p>
        </div>
        <Segmented
          label="Toon"
          value={includeLonely ? 'all' : 'friends'}
          onChange={(v) => setIncludeLonely(v === 'all')}
          options={[{ value: 'friends', label: 'Met vrienden' }, { value: 'all', label: 'Iedereen' }]}
        />
      </header>

      <dl className="facts">
        <div><dt>In het netwerk</dt><dd>{fmtNum(graph.nodes.length)}</dd></div>
        <div><dt>Vriendschappen</dt><dd>{fmtNum(graph.edges.length)}</dd></div>
        <div><dt>Groepjes</dt><dd>{fmtNum(graph.groups.length)}</dd></div>
        <div><dt>Gemiddeld aantal vrienden</dt><dd>{avgFriends.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</dd></div>
      </dl>

      <div className="map-layout">
        <section className="panel net-panel">
          {graph.nodes.length ? (
            <div
              ref={wrapRef}
              className="net"
              style={{ height: size.h }}
              onWheel={onWheel}
              onPointerDown={(e) => onPointerDown(e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <svg width={size.w} height={size.h} role="img" aria-label="Netwerk van vriendschappen">
                <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
                  {graph.edges.map((e, i) => {
                    const s = e.source as Node;
                    const t = e.target as Node;
                    if (s.x === undefined || t.x === undefined) return null;
                    const lit = isLit(s.id) && isLit(t.id) && (!active || s.id === active || t.id === active || focusGroup !== null);
                    return (
                      <line
                        key={i}
                        x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                        className={lit ? 'net-edge' : 'net-edge dim'}
                        strokeWidth={(1 + (e.shared / maxShared) * 5) / Math.sqrt(view.k)}
                      />
                    );
                  })}
                  {graph.nodes.map((n) => (
                    <g
                      key={n.id}
                      transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                      className={`net-node${isLit(n.id) ? '' : ' dim'}${n.id === selected ? ' selected' : ''}`}
                      onPointerDown={(e) => onPointerDown(e, n.id)}
                      onPointerEnter={() => setHover(n.id)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <circle r={n.r} style={{ fill: groupColor(n.group) }} />
                      {showLabel(n) && (
                        <text y={n.r + 12 / view.k} style={{ fontSize: 11 / view.k }} textAnchor="middle">{displayName(n.user)}</text>
                      )}
                      <title>{`${displayName(n.user)}: ${n.user.beerCount} biertjes, ${neighbours.get(n.id)?.size ?? 0} vrienden`}</title>
                    </g>
                  ))}
                </g>
              </svg>
              <div className="net-hint">Scroll om te zoomen, sleep om te verschuiven, klik op iemand voor details</div>
            </div>
          ) : (
            <Empty>Nog geen vriendschappen.</Empty>
          )}
        </section>

        <aside className="map-side">
          {sel ? (
            <Card
              title={
                <span className="user-cell">
                  <Avatar url={sel.photoUrl} name={displayName(sel)} size={34} />
                  {displayName(sel)}
                </span>
              }
              actions={<button className="icon-btn" onClick={() => setSelected(null)} aria-label="Sluiten">×</button>}
            >
              <p className="muted small">
                {fmtNum(sel.beerCount)} biertjes, {buddies.length} {buddies.length === 1 ? 'vriend' : 'vrienden'}
              </p>
              <h3 className="side-sub">Drinkmaatjes</h3>
              {buddies.length ? (
                <ul className="people">
                  {buddies.slice(0, 8).map((b) => (
                    <li key={b.user.uid}>
                      <button className="lb-user link-reset" onClick={() => setSelected(b.user.uid)}>
                        <Avatar url={b.user.photoUrl} name={displayName(b.user)} size={26} />
                        <span className="lb-name">{displayName(b.user)}</span>
                      </button>
                      <span className="lb-sub">{b.shared ? `${b.shared} ${b.shared === 1 ? 'dag' : 'dagen'} samen` : 'nog nooit samen'}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">Geen vrienden.</p>}
              <div className="profile-actions side-actions">
                <Link className="btn sm" to={`/users/${sel.uid}`}>Profiel</Link>
                {buddies[0] && <Link className="btn sm" to={`/compare?u=${sel.uid},${buddies[0].user.uid}`}>Vergelijk met {displayName(buddies[0].user)}</Link>}
              </div>
            </Card>
          ) : (
            <Card title="Groepjes" hint="Klik om een groepje uit te lichten">
              {graph.groups.length ? (
                <ul className="groups">
                  {graph.groups.map((g) => (
                    <li key={g.index}>
                      <button
                        className={focusGroup === g.index ? 'active' : ''}
                        onClick={() => setFocusGroup((f) => (f === g.index ? null : g.index))}
                        style={{ ['--c' as string]: groupColor(g.index) }}
                      >
                        <span className="group-dot" />
                        <span className="group-body">
                          <span className="strong">{g.members.length} personen</span>
                          <span className="muted small">{fmtNum(g.beers)} biertjes, {fmtNum(g.sharedDays)} keer samen gedronken</span>
                          <span className="spot-people">
                            {g.members.slice(0, 6).map((u) => <Avatar key={u.uid} url={u.photoUrl} name={displayName(u)} size={20} />)}
                            {g.members.length > 6 && <span className="muted small">+{g.members.length - 6}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">Nog geen groepjes.</p>}
              {mostConnected && (
                <p className="muted small net-foot">
                  Meest verbonden: <button className="link-btn" onClick={() => setSelected(mostConnected.id)}>{displayName(mostConnected.user)}</button> met {neighbours.get(mostConnected.id)?.size ?? 0} vrienden
                </p>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
