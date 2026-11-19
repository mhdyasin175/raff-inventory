import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, BarChart3, Tag, Boxes, FolderTree, Languages, LayoutDashboard, Lock, Menu, ShieldCheck, Users, Home, Warehouse as WarehouseIcon,
} from 'lucide-react';
import { t, usePrefs } from '../i18n';
import UserMenu from './UserMenu';
import { useWarehouse } from '../auth/WarehouseContext';
import { api, IS_DEMO, tzOffset } from '../api/client';
import type { DashboardSummary } from '../api/types';
import { P, useAuth } from '../auth/AuthContext';

export function RaffMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#2b3531" />
      <rect x="7" y="7" width="2" height="18" fill="#F5C400" />
      <rect x="23" y="7" width="2" height="18" fill="#F5C400" />
      <rect x="7" y="11" width="18" height="2.5" fill="#F5C400" />
      <rect x="7" y="18" width="18" height="2.5" fill="#F5C400" />
      <rect x="11" y="7.5" width="5" height="3.5" fill="#b89668" />
      <rect x="17" y="14.5" width="4" height="3.5" fill="#b89668" />
      <rect x="10" y="21.5" width="7" height="3.5" fill="#b89668" />
    </svg>
  );
}

export default function Layout() {
  const { can } = useAuth();
  const { lang, setLang } = usePrefs();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  const wh = useWarehouse();
  const summary = useQuery({
    queryKey: ['dashboard', 'summary', wh.param],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary', { tz: tzOffset(), warehouseId: wh.param }),
    enabled: can(P.dashboard),
  });
  const attention = (summary.data?.lowStockCount ?? 0) + (summary.data?.outOfStockCount ?? 0);


  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="mobile-bar">
        <button onClick={() => setNavOpen(true)} aria-label={t('nav.open')}><Menu size={22} /></button>
        <RaffMark size={26} />
        <strong style={{ fontFamily: 'var(--font-display)' }}>{t('app.name')}</strong>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <aside className="sidebar" aria-label={t('nav.main')}>
        <NavLink to="/" className="brand">
          <RaffMark />
          <div>
            <div className="brand-name">{t('app.name')}</div>
            <div className="brand-sub">{t('app.tagline')}</div>
          </div>
        </NavLink>

        <WarehouseSwitcher />

        <nav className="nav">
          {can(P.dashboard) && <NavLink to="/" end><LayoutDashboard size={19} />{t('nav.dashboard')}</NavLink>}
          {can(P.productsView) && (
            <NavLink to="/products">
              <Boxes size={19} />{t('nav.products')}
              {attention > 0 && <span className="nav-count" title={t('nav.needReorder')}>{attention}</span>}
            </NavLink>
          )}
          {can(P.productsView) && <NavLink to="/labels"><Tag size={19} />{t('nav.labels')}</NavLink>}
          {can(P.movementsView) && <NavLink to="/movements"><ArrowLeftRight size={19} />{t('nav.movements')}</NavLink>}
          {can(P.categories) && <NavLink to="/categories"><FolderTree size={19} />{t('nav.categories')}</NavLink>}
          {can(P.reports) && <NavLink to="/reports"><BarChart3 size={19} />{t('nav.reports')}</NavLink>}

          {can(P.users, P.roles, P.warehouses) && <div className="nav-group">{t('nav.admin')}</div>}
          {can(P.warehouses) && <NavLink to="/warehouses"><WarehouseIcon size={19} />{t('nav.warehouses')}</NavLink>}
          {can(P.users) && <NavLink to="/users"><Users size={19} />{t('nav.users')}</NavLink>}
          {can(P.roles) && <NavLink to="/roles"><ShieldCheck size={19} />{t('nav.roles')}</NavLink>}
        </nav>

        {IS_DEMO && (
          <div className="demo-ribbon">{t('app.demoNote')}</div>
        )}

        <UserMenu />
      </aside>

      <main className="main" id="main">
        {/* Top navbar: only shown by the AdminLTE theme */}
        <header className="topbar">
          <button className="topbar-btn" aria-label={t('nav.open')}
            onClick={() => (window.matchMedia('(max-width: 960px)').matches ? setNavOpen(true) : setCollapsed((c) => !c))}>
            <Menu size={18} />
          </button>
          <NavLink to="/" className="topbar-link"><Home size={15} /> {t('nav.home')}</NavLink>
          <span className="topbar-spacer" />
          <button className="topbar-link" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={15} /> {t('nav.language')}</button>
          <UserMenu placement="down" compact />
        </header>
        <Suspense fallback={<div className="skeleton" style={{ height: 120 }} />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function PageHead({ title, subtitle, actions, crumb }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; crumb?: string }) {
  useEffect(() => { document.title = `${title} — ${t('app.name')}`; }, [title]);
  return (
    <header className="page-head">
      <div className="titles">
        <h1>{title}</h1>
        <ol className="crumbs" aria-hidden="true"><li>{t('nav.home')}</li><li>{crumb ?? title}</li></ol>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** Chooses which warehouse every page shows; users limited to one warehouse just see its name. */
function WarehouseSwitcher() {
  const { warehouses, selectedId, select, locked, selected } = useWarehouse();
  if (warehouses.length === 0) return null;
  if (locked) {
    return (
      <div className="wh-switch">
        <label>{t('wh.switch')}</label>
        <div className="locked" title={t('wh.lockedHint')}><Lock size={14} aria-hidden="true" /> {selected?.name}</div>
      </div>
    );
  }
  return (
    <div className="wh-switch">
      <label htmlFor="wh-switch">{t('wh.switch')}</label>
      <select id="wh-switch" className="select" value={selectedId ?? 0} onChange={(e) => select(Number(e.target.value) || null)}>
        <option value={0}>{t('wh.all')}</option>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
      </select>
    </div>
  );
}
