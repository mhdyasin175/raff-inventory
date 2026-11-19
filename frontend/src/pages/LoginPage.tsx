import { useState } from 'react';
import { Languages, LogIn } from 'lucide-react';
import { t, usePrefs, type TKey } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { Field, FormError } from '../components/ui';
import { ShelfLabel } from '../components/inventory';
import { RaffMark } from '../components/Layout';
import { IS_DEMO } from '../api/client';

const DEMO_ACCOUNTS: { username: string; password: string; role: TKey }[] = [
  { username: 'admin', password: 'Admin@123', role: 'login.role.admin' },
  { username: 'manager', password: 'Manager@123', role: 'login.role.manager' },
  { username: 'keeper', password: 'Keeper@123', role: 'login.role.keeper' },
  { username: 'viewer', password: 'Viewer@123', role: 'login.role.viewer' },
];

/** Decorative rack: three shelves with boxes and one shelf label each. */
function Rack() {
  const shelves = [
    { sku: 'ELC-0121', boxes: [[64, 52], [48, 70], [88, 44], [56, 60], [40, 36, 'grey']] },
    { sku: 'LGT-0114', boxes: [[96, 58], [52, 40, 'grey'], [60, 66], [44, 50]] },
    { sku: 'PLB-0128', boxes: [[52, 72], [70, 46], [44, 60, 'grey'], [86, 54], [38, 30]] },
  ] as const;
  return (
    <div className="rack" aria-hidden="true">
      {shelves.map((s) => (
        <div className="rack-shelf" key={s.sku} style={{ marginBottom: 44 }}>
          {s.boxes.map((b, i) => (
            <div key={i} className={`box ${b[2] ?? ''}`} style={{ width: b[0], height: b[1] }} />
          ))}
          <ShelfLabel sku={s.sku} />
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const { lang, setLang } = usePrefs();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(u = username, p = password) {
    if (!u.trim() || !p) { setError(t('login.required')); return; }
    setBusy(true); setError(null);
    try { await login(u, p); }
    catch (e) { setError(e instanceof Error ? e.message : t('login.failed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">
          <RaffMark size={36} />
          <div>
            <div className="brand-name">{t('app.name')}</div>
            <div className="brand-sub">{t('app.tagline')}</div>
          </div>
        </div>
        <Rack />
        <div>
          <blockquote>{t('login.quote')}</blockquote>
          <p className="foot" style={{ marginTop: 12 }}>{t('login.builtWith')}</p>
        </div>
      </section>

      <section className="login-form">
        <div className="login-prefs">
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('nav.languageLabel')}>
            <Languages size={16} /> {t('nav.language')}
          </button>
        </div>
        <div>
          <h1>{t('login.title')}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t('login.subtitle')}</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <FormError message={error} />
          <Field label={t('login.username')}>
            <input className="input ltr" autoComplete="username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus dir="ltr" />
          </Field>
          <Field label={t('login.password')}>
            <input className="input ltr" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          </Field>
          <button className="btn btn-dark" type="submit" disabled={busy}>
            <LogIn size={18} className="flip-rtl" /> {busy ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="demo-accounts">
          <p>{IS_DEMO ? t('login.demoHint') : t('login.seedHint')}</p>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.username} type="button" disabled={busy}
              onClick={() => { setUsername(a.username); setPassword(a.password); submit(a.username, a.password); }}>
              {t(a.role)}
              <code>{a.username} / {a.password}</code>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
