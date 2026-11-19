import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ar, { type TKey } from './ar';
import en from './en';

export type Lang = 'ar' | 'en';
export type Theme = 'raff' | 'shadcn' | 'adminlte';
export const THEMES: Theme[] = ['raff', 'shadcn', 'adminlte'];

const DICTS = { ar, en };
const LANG_KEY = 'raff.lang';
const THEME_KEY = 'raff.theme';

function read<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch { /* storage unavailable */ }
  return fallback;
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// Module-level copies so non-React code (API client, formatters) can read the current choice.
let currentLang: Lang = read<Lang>(LANG_KEY, ['ar', 'en'], 'ar');
export const getLang = () => currentLang;

export function translate(key: TKey, vars?: Record<string, string | number>) {
  let s: string = DICTS[currentLang][key] ?? DICTS.ar[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      let val = String(v);
      // In Arabic, isolate Latin/number runs ("$12,717", "ELC-0107") so they keep their order in RTL text.
      if (currentLang === 'ar' && /[0-9A-Za-z$]/.test(val) && !/[\u0600-\u06FF]/.test(val)) val = `\u2066${val}\u2069`;
      s = s.replaceAll(`{${k}}`, val);
    }
  }
  return s;
}
export const t = translate;

function applyToDocument(lang: Lang, theme: Theme) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  html.dataset.theme = theme;
}

interface Prefs {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  theme: Theme;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  t: typeof translate;
}

const PrefsCtx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const [theme, setThemeState] = useState<Theme>(() => read<Theme>(THEME_KEY, THEMES, 'shadcn'));

  useEffect(() => applyToDocument(lang, theme), [lang, theme]);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    write(LANG_KEY, l);
    setLangState(l);
  }, []);
  const setTheme = useCallback((th: Theme) => { write(THEME_KEY, th); setThemeState(th); }, []);

  const value = useMemo<Prefs>(() => ({
    lang, theme, setLang, setTheme, t: translate, dir: lang === 'ar' ? 'rtl' : 'ltr',
  }), [lang, theme, setLang, setTheme]);

  // Re-mount the tree on language change so every translated string and formatter refreshes.
  return <PrefsCtx.Provider value={value}><Fragment key={lang}>{children}</Fragment></PrefsCtx.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsCtx);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}

/** Translated label for a permission group, derived from the permission key. */
export function permGroupKey(permKey: string): TKey {
  const area = permKey.split('.')[0];
  if (area === 'products' || area === 'categories') return 'pg.products';
  if (area === 'movements') return 'pg.movements';
  if (area === 'reports') return 'pg.reports';
  if (area === 'users' || area === 'roles' || area === 'warehouses') return 'pg.admin';
  return 'pg.dashboard';
}

export type { TKey };
