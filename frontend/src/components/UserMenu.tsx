import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Languages, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { t, THEMES, usePrefs, type Lang, type Theme, type TKey } from '../i18n';

const THEME_META: Record<Theme, { label: TKey; desc: TKey; swatch: [string, string, string] }> = {
  shadcn: { label: 'nav.themeShadcn', desc: 'menu.shadcnDesc', swatch: ['#fafafa', '#18181b', '#e4e4e7'] },
  adminlte: { label: 'nav.themeAdminlte', desc: 'menu.adminlteDesc', swatch: ['#343a40', '#007bff', '#f4f6f9'] },
  raff: { label: 'nav.themeRaff', desc: 'menu.raffDesc', swatch: ['#18201d', '#f5c400', '#e7e9e4'] },
};
const LANGS: { key: Lang; label: string }[] = [
  { key: 'ar', label: 'العربية' },
  { key: 'en', label: 'English' },
];

/**
 * Account menu: language, appearance and sign-out.
 * "up" opens above the trigger (sidebar footer); "down" opens below it (top navbar).
 */
export default function UserMenu({ placement = 'up', compact }: { placement?: 'up' | 'down'; compact?: boolean }) {
  const { user, logout } = useAuth();
  const { lang, setLang, theme, setTheme } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initial = user?.fullName.trim().charAt(0) ?? '';
  // Order themes so the default (shadcn) is listed first.
  const ordered = [...THEMES].sort((a, b) => Object.keys(THEME_META).indexOf(a) - Object.keys(THEME_META).indexOf(b));

  return (
    <div className={`user-menu ${placement}`} ref={ref}>
      <button className={compact ? 'topbar-user' : 'me'} aria-haspopup="menu" aria-expanded={open}
        aria-label={t('menu.account')} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">{initial}</span>
        <span className="me-text">
          <span className="me-name">{user?.fullName}</span>
          {!compact && <span className="me-role">{user?.role}</span>}
        </span>
        {!compact && <ChevronsUpDown size={16} className="me-chevron" aria-hidden="true" />}
      </button>

      {open && (
        <div className="menu" role="menu" aria-label={t('menu.account')}>
          <div className="menu-head">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <span>
              <strong>{user?.fullName}</strong>
              <small dir="ltr">{user?.username}</small>
            </span>
          </div>

          <div className="menu-label"><Languages size={14} /> {t('menu.language')}</div>
          <div className="menu-row">
            {LANGS.map((l) => (
              <button key={l.key} role="menuitemradio" aria-checked={lang === l.key} className="menu-chip"
                onClick={() => setLang(l.key)} lang={l.key}>
                {l.label}
              </button>
            ))}
          </div>

          <div className="menu-label">{t('nav.theme')}</div>
          {ordered.map((th) => {
            const m = THEME_META[th];
            return (
              <button key={th} role="menuitemradio" aria-checked={theme === th} className="menu-item"
                onClick={() => setTheme(th)}>
                <span className="swatch" aria-hidden="true">
                  {m.swatch.map((c) => <i key={c} style={{ background: c }} />)}
                </span>
                <span className="menu-item-text">
                  {t(m.label)}
                  <small>{t(m.desc)}</small>
                </span>
                {theme === th && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}

          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={logout}>
            <LogOut size={16} className="flip-rtl" /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
