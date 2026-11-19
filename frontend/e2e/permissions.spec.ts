import { expect, test } from '@playwright/test';
import { openApp, signInAs } from './helpers';

test('an auditor sees reports but no editing actions or admin pages', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await signInAs(page, 'Auditor (read-only)');

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Roles & permissions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record movement' })).toHaveCount(0);

  await page.goto('/#/users');
  await expect(page.getByRole('heading', { name: "This page isn't part of your role" })).toBeVisible();
});

test('a storekeeper has no reports or categories', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await signInAs(page, 'Storekeeper');

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Stock movements' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Categories' })).toHaveCount(0);
});

test('an admin can open every page', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await signInAs(page, 'System admin');

  for (const [link, heading] of [
    ['Products', 'Products'],
    ['Stock movements', 'Stock movements'],
    ['Categories', 'Categories'],
    ['Reports', 'Reports'],
    ['Users', 'Users'],
    ['Roles & permissions', 'Roles & permissions'],
  ]) {
    await page.getByRole('navigation').getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});
