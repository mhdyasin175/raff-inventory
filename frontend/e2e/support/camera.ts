import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** What the fake camera "sees": the EAN-13 of the demo's 1.5 mm copper cable (ELC-0114). */
export const SCANNED_BARCODE = '6214503000748';
export const SCANNED_SKU = 'ELC-0114';
export const CAMERA_VIDEO = join(tmpdir(), 'raff-e2e', 'barcode.y4m');
