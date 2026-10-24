import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { DataProvider, useData } from './data';
import { fmtNum, fmtRelative } from './utils';
import { lazy, Suspense } from 'react';
import {
  IconChart, IconCheers, IconCompare, IconLogout, IconMap, IconMessage, IconNetwork, IconRetention, IconShield, IconUsers,
} from './components/icons';
import Retention from './pages/Retention';
import Messages from './pages/Messages';
import Admins from './pages/Admins';
import Compare from './pages/Compare';
import { Toasts } from './components/live';
import { Topbar } from './components/topbar';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Tonight from './pages/Tonight';
import Present from './pages/Present';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';

// De kaart (Leaflet) pas laden als iemand hem opent.
const MapPage = lazy(() => import('./pages/MapPage'));
const Network = lazy(() => import('./pages/Network'));
const pageFallback = <div className="center-block"><div className="spinner" /></div>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAdmin />}>
        <Route path="/present" element={<Present />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/tonight" element={<Tonight />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:uid" element={<UserDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/map" element={<Suspense fallback={pageFallback}><MapPage /></Suspense>} />
          <Route path="/network" element={<Suspense fallback={pageFallback}><Network /></Suspense>} />
          <Route path="/retention" element={<Retention />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/admins" element={<Admins />} />
        </Route>
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
      <Outlet />
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
          <NavLink to="/" end><IconChart /> <span>Overzicht</span></NavLink>
          <NavLink to="/tonight"><IconCheers /> <span>Vanavond</span></NavLink>
          <NavLink to="/users">
            <IconUsers /> <span>Gebruikers</span>
            {data && <span className="nav-count">{fmtNum(data.users.length)}</span>}
          </NavLink>
          <NavLink to="/retention"><IconRetention /> <span>Behoud</span></NavLink>
          <NavLink to="/map"><IconMap /> <span>Kaart</span></NavLink>
          <NavLink to="/network"><IconNetwork /> <span>Netwerk</span></NavLink>
          <NavLink to="/compare"><IconCompare /> <span>Vergelijken</span></NavLink>
          <NavLink to="/messages"><IconMessage /> <span>Berichten</span></NavLink>
          <NavLink to="/admins"><IconShield /> <span>Beheerders</span></NavLink>
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
            <Outlet />
          </div>
        )}
      </main>
      <Toasts />
    </div>
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
