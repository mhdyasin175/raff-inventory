import { expect, test } from '@playwright/test';
import { openApp, signInAs } from './helpers';
import { SCANNED_BARCODE, SCANNED_SKU } from './support/camera';

test.describe('barcodes', () => {
  test('the camera reads a barcode and picks the product in the movement form', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'Warehouse manager');

    await page.getByRole('button', { name: 'Record movement' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record stock movement' });
    await dialog.getByRole('button', { name: 'Scan with camera' }).click();

    // Chrome's fake camera shows the EAN-13 drawn by e2e/support/barcode-video.ts.
    const scanner = page.getByRole('dialog', { name: 'Scan a barcode' });
    await expect(scanner).toBeVisible();
    await expect(scanner).toBeHidden({ timeout: 20_000 });

    const product = dialog.getByRole('combobox', { name: /^Product/ });
    await expect(product.locator('option', { hasText: SCANNED_SKU })).toHaveJSProperty('selected', true);
    await expect(dialog.getByLabel('Quantity')).toBeFocused();
  });

  test('a USB scanner typing into the product search opens that product', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');
    await page.getByRole('link', { name: 'Products', exact: true }).click();

    // Scanners type the code and press Enter.
    const search = page.getByRole('searchbox', { name: 'Search products' });
    await search.fill(SCANNED_BARCODE);
    await search.press('Enter');

    const drawer = page.getByRole('dialog', { name: 'Copper cable 1.5 mm, 100 m roll' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(SCANNED_BARCODE)).toBeVisible();
  });

  test('an unknown code says so instead of opening anything', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');
    await page.getByRole('link', { name: 'Products', exact: true }).click();

    const search = page.getByRole('searchbox', { name: 'Search products' });
    await search.fill('0000000000000');
    await search.press('Enter');

    await expect(page.getByText('No product has the code 0000000000000')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('labels: a product goes from its details to a printable sheet, with copies', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');
    await page.getByRole('link', { name: 'Products', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('Circuit breaker 16 A');
    await page.getByRole('row', { name: /Circuit breaker 16 A/ }).click();
    await page.getByRole('link', { name: 'Label', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Barcode labels' })).toBeVisible();
    const preview = page.getByRole('region', { name: 'Print preview' });
    await expect(preview.locator('svg[data-code]')).toHaveCount(1);
    await expect(preview.locator('svg[data-code] rect').first()).toBeAttached(); // bars were drawn

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(preview.locator('svg[data-code]')).toHaveCount(3);
    await expect(page.getByText('3 labels on one page')).toBeVisible();

    // A thermal roll prints one label per page.
    await page.getByRole('button', { name: 'Thermal roll' }).click();
    await expect(preview.locator('.sheet')).toHaveCount(3);
  });

  test('labels: scanning adds products, and skipped slots leave the used part of the sheet empty', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');
    await page.getByRole('link', { name: 'Barcode labels' }).click();

    const scan = page.getByLabel('Scan a product to add it');
    await scan.fill(SCANNED_BARCODE);
    await scan.press('Enter');
    await scan.fill(SCANNED_SKU.toLowerCase()); // the SKU works too, in any case
    await scan.press('Enter');

    await expect(page.getByRole('group', { name: 'Labels for Copper cable 1.5 mm, 100 m roll' }).getByLabel('Copies')).toHaveValue('2');
    await page.getByLabel('Start at').selectOption('5');
    const sheet = page.getByRole('region', { name: 'Print preview' }).locator('.sheet');
    await expect(sheet.locator('.label.empty')).toHaveCount(5); // the slots already used on the sheet
    await expect(sheet.locator('.label:not(.empty)')).toHaveCount(2);
  });

  test('a mistyped barcode is caught by its check digit', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await signInAs(page, 'System admin');
    await page.getByRole('link', { name: 'Products', exact: true }).click();
    await page.getByRole('button', { name: 'New product' }).click();

    const form = page.getByRole('dialog', { name: 'New product' });
    await form.getByLabel('Product name').fill('Check digit test');
    await form.getByLabel('Barcode (optional)').fill('6214503000749');
    await form.getByRole('button', { name: 'Add product' }).click();

    await expect(form.getByText("The last digit doesn't match the check digit")).toBeVisible();
  });
});
