import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { DataProvider, useData } from './data';
import { fmtRelative } from './utils';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAdmin />}>
        <Route path="/" element={<Overview />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:uid" element={<UserDetail />} />
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

function Layout() {
  const { user, logout } = useAuth();
  const { data, loading, error, refresh } = useData();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>BrewMate <em>Admin</em></span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/users">Users</NavLink>
        </nav>
        <div className="topbar-right">
          <span className="muted small hide-sm">
            {loading ? 'Loading…' : data ? `Updated ${fmtRelative(data.loadedAt)}` : ''}
          </span>
          <button className="btn ghost" onClick={refresh} disabled={loading} title="Reload data">
            ↻<span className="hide-sm"> Refresh</span>
          </button>
          <button className="btn ghost" onClick={logout} title={user?.email ?? ''}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        {error ? (
          <div className="card error-card">
            <h3>Could not load data</h3>
            <p className="muted">{error}</p>
            <p className="muted small">
              If this says “Missing or insufficient permissions”, your Firestore rules don’t allow admins to read all
              collections yet. See the README for the rules to add.
            </p>
            <button className="btn" onClick={refresh}>Try again</button>
          </div>
        ) : !data ? (
          <div className="center-block"><div className="spinner" /></div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
