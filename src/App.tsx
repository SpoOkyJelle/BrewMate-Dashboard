import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { DataProvider, useData } from './data';
import { fmtNum, fmtRelative } from './utils';
import { lazy, Suspense, useEffect, useState } from 'react';
import { IconLogout, IconMore } from './components/icons';
import { Toasts } from './components/live';
import { Topbar } from './components/topbar';
import { NAV } from './nav';
import Login from './pages/Login';
import Overview from './pages/Overview';

// Alleen het Overzicht zit in de eerste download; andere pagina's laden pas als iemand ze opent.
const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Retention = lazy(() => import('./pages/Retention'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Network = lazy(() => import('./pages/Network'));
const Compare = lazy(() => import('./pages/Compare'));
const Messages = lazy(() => import('./pages/Messages'));
const Quality = lazy(() => import('./pages/Quality'));
const Admins = lazy(() => import('./pages/Admins'));
const Guilds = lazy(() => import('./pages/Guilds'));
const GuildDetail = lazy(() => import('./pages/GuildDetail'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAdmin />}>
        <Route path="/" element={<Overview />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:uid" element={<UserDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/network" element={<Network />} />
        <Route path="/guilds" element={<Guilds />} />
        <Route path="/guilds/:id" element={<GuildDetail />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/quality" element={<Quality />} />
        <Route path="/admins" element={<Admins />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAdmin() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="center-screen"><div className="spinner" /></div>;
  if (status !== 'admin') return <Navigate to="/login" replace />;
  return (
    <DataProvider>
      <Layout />
    </DataProvider>
  );
}

function LiveBadge() {
  const { status, lastChange, now } = useData();
  const label =
    status === 'live' ? 'Live'
      : status === 'cached' ? 'Bijwerken…'
        : status === 'error' ? 'Geen verbinding'
          : 'Verbinden…';
  return (
    <div className={`live-badge ${status}`} title={lastChange ? `Laatste wijziging ${fmtRelative(lastChange, now)}` : ''}>
      <span className="live-dot" />
      {label}
    </div>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const { data, error } = useData();
  const location = useLocation();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <div>
            <div className="brand-name">BrewMate</div>
            <div className="brand-sub">Beheer</div>
          </div>
        </div>
        <nav className="nav" aria-label="Hoofdmenu">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.icon} <span>{item.label}</span>
              {item.to === '/users' && data && <span className="nav-count">{fmtNum(data.users.length)}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <LiveBadge />
          <div className="account">
            <span className="account-email" title={user?.email ?? ''}>{user?.email}</span>
            <button className="icon-btn" onClick={logout} title="Uitloggen" aria-label="Uitloggen">
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <Topbar />
        {error ? (
          <div className="panel error-panel">
            <h2>Kan de data niet laden</h2>
            <p className="muted">{error}</p>
            <p className="muted small">
              Staat er “Missing or insufficient permissions”? Dan staan je Firestore-regels nog niet toe dat admins alle
              collecties lezen. In de README staat welke regels je moet toevoegen.
            </p>
          </div>
        ) : !data ? (
          <Skeleton />
        ) : (
          <div key={location.pathname} className="route">
            <Suspense fallback={<div className="center-block"><div className="spinner" /></div>}>
              <Outlet />
            </Suspense>
          </div>
        )}
      </main>
      <MobileNav />
      <Toasts />
    </div>
  );
}

/** Onderbalk op de telefoon: de vier belangrijkste pagina's, de rest onder "Meer". */
function MobileNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const main = NAV.filter((n) => n.mobile);
  const rest = NAV.filter((n) => !n.mobile);
  const restActive = rest.some((n) => location.pathname.startsWith(n.to));

  // Sluit het menu na het kiezen van een pagina.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <>
      <nav className="mobile-nav" aria-label="Hoofdmenu">
        {main.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={open || restActive ? 'active' : ''} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <IconMore />
          <span>Meer</span>
        </button>
      </nav>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Meer pagina's" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden />
            <ul className="sheet-list">
              {rest.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.icon} <span>{item.label}</span></NavLink>
                </li>
              ))}
            </ul>
            <div className="sheet-foot">
              <LiveBadge />
              <span className="account-email">{user?.email}</span>
              <button className="btn sm" onClick={logout}><IconLogout /> Uitloggen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Laden">
      <div className="sk sk-hero" />
      <div className="sk-row">
        {[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-tile" />)}
      </div>
      <div className="sk sk-chart" />
    </div>
  );
}
