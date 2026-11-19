import { expect, test } from '@playwright/test';
import { openApp, signInAs } from './helpers';

test('on a phone the menu opens from the top bar', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await signInAs(page, 'System admin');

  const products = page.getByRole('navigation').getByRole('link', { name: 'Products' });
  await expect(products).not.toBeInViewport();

  await page.getByRole('button', { name: 'Open menu' }).first().click();
  await expect(products).toBeInViewport();
  await products.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
});
