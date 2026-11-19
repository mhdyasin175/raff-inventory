import { expect, test } from '@playwright/test';
import { openApp, signInAs } from './helpers';

test.describe('stock movements', () => {
  test('a storekeeper records a stock-in and the balance goes up', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Storekeeper');

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('PPR elbow');
    const row = page.getByRole('row', { name: /PPR elbow 20 mm/ });
    await expect(row).toBeVisible();
    const before = Number((await row.getByRole('meter').getAttribute('aria-valuenow')) ?? 0);

    await row.click();
    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record stock movement' });
    await expect(dialog.getByRole('combobox')).toHaveValue(/\d+/);
    await dialog.getByLabel('Quantity').fill('25');
    await dialog.getByLabel('Supplier').fill('E2E Supplies');
    await expect(dialog.getByText(`Balance after: ${before + 25}`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Save movement' }).click();

    await expect(page.getByText(/Recorded stock-in of 25 pcs/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('row', { name: /PPR elbow 20 mm/ }).getByRole('meter'))
      .toHaveAttribute('aria-valuenow', String(before + 25));
  });

  test('stock-out larger than the balance is blocked before it reaches the server', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Warehouse manager');

    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record stock movement' });
    await dialog.getByRole('button', { name: 'Stock out' }).click();
    const hammer = await dialog.locator('option', { hasText: 'Hammer 500 g' }).getAttribute('value');
    await dialog.getByRole('combobox').selectOption(hammer!);
    await dialog.getByLabel('Quantity').fill('99999');
    await dialog.getByRole('button', { name: 'Save movement' }).click();

    await expect(dialog.getByRole('alert')).toContainText(/Only \d+ pcs available/);
    await expect(dialog).toBeVisible();
  });

  test('a stock count needs a reason', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Warehouse manager');

    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record stock movement' });
    await dialog.getByRole('button', { name: 'Stock count' }).click();
    await dialog.getByRole('combobox').selectOption({ index: 1 });
    await dialog.getByLabel('Counted quantity').fill('1');
    await dialog.getByRole('button', { name: 'Save movement' }).click();

    await expect(dialog.getByRole('alert')).toContainText('Write the reason for the adjustment');
  });
});
