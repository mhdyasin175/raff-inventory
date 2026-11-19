import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { P, useAuth } from './auth/AuthContext';
import { t } from './i18n';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';

// Each page is its own chunk; the charts library only loads with pages that draw charts.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const MovementsPage = lazy(() => import('./pages/MovementsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));

function Guard({ perm, children }: { perm: string; children: React.ReactElement }) {
  const { can } = useAuth();
  if (can(perm)) return children;
  return (
    <div className="panel forbidden">
      <div className="state">
        <ShieldOff size={30} strokeWidth={1.6} />
        <h3>{t('common.forbiddenTitle')}</h3>
        <p>{t('common.forbiddenText')}</p>
      </div>
    </div>
  );
}

/** Sends each user to the first page their role can open. */
function Home() {
  const { can } = useAuth();
  if (can(P.dashboard)) return <DashboardPage />;
  if (can(P.productsView)) return <Navigate to="/products" replace />;
  if (can(P.movementsView)) return <Navigate to="/movements" replace />;
  if (can(P.reports)) return <Navigate to="/reports" replace />;
  if (can(P.users)) return <Navigate to="/users" replace />;
  return <Guard perm={P.dashboard}><></></Guard>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="state" style={{ minHeight: '100%', justifyContent: 'center' }}>{t('app.loading')}</div>;
  if (!user) return <LoginPage />;

  return (
    <Suspense fallback={<div className="state">{t('app.loading')}</div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Guard perm={P.productsView}><ProductsPage /></Guard>} />
        <Route path="movements" element={<Guard perm={P.movementsView}><MovementsPage /></Guard>} />
        <Route path="categories" element={<Guard perm={P.categories}><CategoriesPage /></Guard>} />
        <Route path="reports" element={<Guard perm={P.reports}><ReportsPage /></Guard>} />
        <Route path="users" element={<Guard perm={P.users}><UsersPage /></Guard>} />
        <Route path="roles" element={<Guard perm={P.roles}><RolesPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
