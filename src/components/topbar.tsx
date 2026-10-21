import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useData } from '../data';
import { setThemePref, useThemePref, type ThemePref } from '../theme';
import { displayName, fmtRelative } from '../utils';
import { Avatar } from './ui';
import {
  IconArrowRight, IconAuto, IconChart, IconCompare, IconMap, IconMessage, IconMoon, IconNetwork, IconRetention,
  IconSearch, IconShield, IconSun, IconUsers,
} from './icons';

const PAGES: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Overzicht', icon: <IconChart /> },
  { to: '/users', label: 'Gebruikers', icon: <IconUsers /> },
  { to: '/retention', label: 'Behoud', icon: <IconRetention /> },
  { to: '/map', label: 'Kaart', icon: <IconMap /> },
  { to: '/network', label: 'Netwerk', icon: <IconNetwork /> },
  { to: '/compare', label: 'Vergelijken', icon: <IconCompare /> },
  { to: '/messages', label: 'Berichten', icon: <IconMessage /> },
  { to: '/admins', label: 'Beheerders', icon: <IconShield /> },
];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

/** Kleine letters en zonder accenten, zodat "adrian" ook "Adrián" vindt. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Topbar() {
  const { user } = useAuth();
  const { data, now } = useData();
  const [open, setOpen] = useState(false);

  // Ctrl+K / ⌘K opent het zoekvenster overal in het dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const me = user && data?.usersById.get(user.uid);
  const name = me ? displayName(me) : (user?.email?.split('@')[0] ?? '');

  return (
    <header className="topbar">
      <div className="topbar-hello">
        <span className="topbar-date">{now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span className="topbar-greet">{greeting(now)}{name && <>, <strong>{name}</strong></>}</span>
      </div>
      <button className="topbar-search" onClick={() => setOpen(true)} aria-label="Zoeken">
        <IconSearch />
        <span className="topbar-search-text">Zoek een gebruiker of pagina</span>
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <ThemeToggle />
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </header>
  );
}

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Licht', icon: <IconSun /> },
  { value: 'dark', label: 'Donker', icon: <IconMoon /> },
  { value: 'system', label: 'Automatisch (volgt je systeem)', icon: <IconAuto /> },
];

function ThemeToggle() {
  const pref = useThemePref();
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Thema">
      {THEMES.map((t) => (
        <button
          key={t.value}
          role="radio"
          aria-checked={pref === t.value}
          aria-label={t.label}
          title={t.label}
          className={pref === t.value ? 'active' : ''}
          onClick={() => setThemePref(t.value)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

type Item =
  | { kind: 'page'; key: string; to: string; label: string; icon: ReactNode }
  | { kind: 'user'; key: string; to: string; label: string; sub: string; photo: string };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data, now } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    const q = norm(query.trim());
    const pages = PAGES.filter((p) => !q || norm(p.label).includes(q))
      .map((p) => ({ kind: 'page' as const, key: `p${p.to}`, ...p }));
    let users = data?.users ?? [];
    if (q) {
      users = users.filter((u) => norm(`${u.username} ${u.email}`).includes(q) || u.uid.toLowerCase().startsWith(q));
      // Wie met de zoekterm begint eerst, daarna op naam.
      users.sort((a, b) =>
        Number(norm(displayName(b)).startsWith(q)) - Number(norm(displayName(a)).startsWith(q))
        || displayName(a).localeCompare(displayName(b), 'nl'));
    } else {
      // Zonder zoekterm: wie het laatst een biertje logde.
      users = [...users].sort((a, b) => (b.lastBeer?.getTime() ?? 0) - (a.lastBeer?.getTime() ?? 0));
    }
    const userItems = users.slice(0, q ? 8 : 5).map((u) => ({
      kind: 'user' as const,
      key: `u${u.uid}`,
      to: `/users/${u.uid}`,
      label: displayName(u),
      sub: u.lastBeer ? `Laatste biertje ${fmtRelative(u.lastBeer, now)}` : u.email,
      photo: u.photoUrl,
    }));
    return q ? [...userItems, ...pages] : [...pages, ...userItems];
  }, [query, data, now]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const firstUser = items.findIndex((i) => i.kind === 'user');
  const firstPage = items.findIndex((i) => i.kind === 'page');

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Zoeken" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <IconSearch />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Zoek op naam, e-mail of pagina…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={items[active] ? `cmdk-${items[active].key}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        {items.length ? (
          <ul className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
            {items.map((item, i) => (
              <li key={item.key} role="presentation">
                {i === firstUser && <div className="cmdk-group">{query ? 'Gebruikers' : 'Laatst actief'}</div>}
                {i === firstPage && <div className="cmdk-group">Pagina's</div>}
                <button
                  id={`cmdk-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                >
                  {item.kind === 'page'
                    ? <span className="cmdk-icon">{item.icon}</span>
                    : <Avatar url={item.photo} name={item.label} size={32} />}
                  <span className="cmdk-text">
                    <span className="cmdk-label">{item.label}</span>
                    {item.kind === 'user' && <span className="cmdk-sub">{item.sub}</span>}
                  </span>
                  <IconArrowRight className="cmdk-go" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cmdk-empty">Niets gevonden voor “{query}”</p>
        )}
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> kiezen</span>
          <span><kbd>Enter</kbd> openen</span>
          <span><kbd>Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
  );
}
