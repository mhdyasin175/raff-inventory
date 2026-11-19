import { expect, test, type Locator } from '@playwright/test';
import { openApp, signInAs } from './helpers';

/** Pick a product in the movement dialog by (part of) its name. */
async function chooseProduct(dialog: Locator, name: string) {
  const select = dialog.getByLabel('Product');
  await expect(select.locator('option', { hasText: name })).toHaveCount(1);
  const value = await select.locator('option', { hasText: name }).getAttribute('value');
  await select.selectOption(value!);
}

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
    await expect(dialog.getByLabel('Warehouse')).toBeDisabled(); // limited to the main warehouse
    await expect(dialog.getByLabel('Product')).toHaveValue(/\d+/);
    await dialog.getByLabel('Quantity').fill('25');
    await dialog.getByLabel('Supplier').fill('E2E Supplies');
    await expect(dialog.getByText(`Balance after: ${(before + 25).toLocaleString('en-US')}`)).toBeVisible();
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
    await chooseProduct(dialog, 'Hammer 500 g');
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
    await chooseProduct(dialog, 'Hammer 500 g');
    await dialog.getByLabel('Counted quantity').fill('1');
    await dialog.getByRole('button', { name: 'Save movement' }).click();

    await expect(dialog.getByRole('alert')).toContainText('Write the reason for the adjustment');
  });
});

test.describe('warehouses', () => {
  test('a transfer moves stock from the main warehouse to a branch', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Warehouse manager');

    // Reads the per-warehouse split shown in the product's detail drawer.
    const openDrawer = async () => {
      await page.getByRole('link', { name: 'Products' }).click();
      await page.getByRole('searchbox', { name: 'Search products' }).fill('Cordless drill');
      await page.getByRole('row', { name: /Cordless drill 18 V/ }).click();
      const split = page.getByRole('dialog', { name: 'Cordless drill 18 V' }).locator('.stock-split li');
      await expect(split).toHaveCount(3);
      const read = async (name: string) => Number((await split.filter({ hasText: name }).locator('strong').innerText()).replace(/,/g, ''));
      return async () => ({ main: await read('Main warehouse'), homs: await read('Homs branch') });
    };

    const before = await (await openDrawer())();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Stock movements' }).click();
    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record stock movement' });
    await dialog.getByRole('button', { name: 'Transfer' }).click();
    await dialog.getByLabel('From warehouse').selectOption({ label: 'Main warehouse (MAIN)' });
    await dialog.getByLabel('To warehouse').selectOption({ label: 'Homs branch (HMS)' });
    await chooseProduct(dialog, 'Cordless drill 18 V');
    await dialog.getByLabel('Quantity').fill('2');
    await dialog.getByRole('button', { name: 'Save movement' }).click();
    await expect(page.getByText(/Recorded transfer of 2 pcs/)).toBeVisible();

    // Cached figures show first and refresh a moment later, so wait for the new ones.
    const readAfter = await openDrawer();
    await expect.poll(readAfter).toEqual({ main: before.main - 2, homs: before.homs + 2 });
  });

  test('a storekeeper limited to one branch only sees that branch', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Aleppo storekeeper');

    await expect(page.getByText('Aleppo branch').first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Warehouse' })).toHaveCount(0); // no switcher, just the name
    await page.getByRole('link', { name: 'Stock movements' }).click();
    await expect(page.getByRole('columnheader', { name: 'Warehouse' })).toHaveCount(0);
  });

  test('an admin adds a warehouse', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');

    await page.getByRole('navigation').getByRole('link', { name: 'Warehouses' }).click();
    await page.getByRole('button', { name: 'New warehouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'New warehouse' });
    await dialog.getByLabel('Warehouse name').fill('Latakia branch');
    await dialog.getByLabel('Code').fill('LTK');
    await dialog.getByRole('button', { name: 'Add warehouse' }).click();

    await expect(page.getByRole('heading', { name: 'Latakia branch' })).toBeVisible();
    await expect(page.getByLabel('Warehouse', { exact: true }).first().locator('option', { hasText: 'Latakia branch (LTK)' })).toHaveCount(1);
  });
});
