import { expect, test } from '@playwright/test';
import { openApp, signInAs } from './helpers';

test('Arabic is the default and switching to English flips the layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch language to English' }).or(page.getByRole('button', { name: 'تبديل اللغة إلى الإنجليزية' })).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('the look can be changed from the account menu and is remembered', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'shadcn');
  await signInAs(page, 'System admin');

  await page.getByRole('button', { name: 'Account menu' }).first().click();
  await page.getByRole('menuitemradio', { name: /AdminLTE/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'adminlte');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'adminlte');
});

test('the language can be changed from the account menu after signing in', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await signInAs(page, 'System admin');

  await page.getByRole('button', { name: 'Account menu' }).first().click();
  await page.getByRole('menuitemradio', { name: 'العربية' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'المنتجات' })).toBeVisible();
});
