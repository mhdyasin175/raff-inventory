import type { Page } from '@playwright/test';

/** Open the app with a given language/look already chosen, as a returning user would have it. */
export async function openApp(page: Page, opts: { lang?: 'ar' | 'en'; theme?: 'shadcn' | 'adminlte' | 'raff' } = {}) {
  await page.addInitScript(({ lang, theme }) => {
    if (lang) localStorage.setItem('raff.lang', lang);
    if (theme) localStorage.setItem('raff.theme', theme);
  }, opts);
  await page.goto('/');
}

/** Sign in through one of the demo-account buttons on the login page. */
export async function signInAs(page: Page, role: 'System admin' | 'Warehouse manager' | 'Storekeeper' | 'Auditor (read-only)') {
  await page.getByRole('button', { name: new RegExp(role.replace(/[()]/g, '\\$&')) }).click();
  await page.getByRole('heading', { level: 1 }).waitFor();
}
