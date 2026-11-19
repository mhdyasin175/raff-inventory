/** GS1 helpers shared by the demo API, the product form and the label sheet (mirrors Infrastructure/Barcodes.cs). */

/** All digits and as long as a GS1 barcode (EAN-8, UPC-A, EAN-13, GTIN-14), so the last digit is a check digit. */
export const isGtin = (code: string) => /^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length);

/** Mod-10 check digit for the digits before it (weights 3,1,3,… from the right). */
export function checkDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export const hasValidCheckDigit = (gtin: string) => checkDigit(gtin.slice(0, -1)) === Number(gtin.at(-1));
export const withCheckDigit = (body: string) => body + checkDigit(body);

/** The code printed on a product's label: its manufacturer barcode if it has one, otherwise its SKU. */
export const labelCode = (p: { sku: string; barcode?: string | null }) => p.barcode || p.sku;

/** Symbology JsBarcode should draw for a code: retail barcodes keep their own format, everything else is Code 128. */
export function symbologyFor(code: string): 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' {
  if (isGtin(code) && hasValidCheckDigit(code)) {
    if (code.length === 13) return 'EAN13';
    if (code.length === 8) return 'EAN8';
    if (code.length === 12) return 'UPC';
  }
  return 'CODE128';
}
