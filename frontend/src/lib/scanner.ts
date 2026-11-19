/**
 * Barcode reading from a camera frame. Uses the browser's own BarcodeDetector where it exists
 * (Chrome on Android, macOS), and otherwise a WebAssembly build of ZXing that is loaded only the
 * first time someone opens the scanner (it never weighs on the normal page load).
 */

/** Retail barcodes, Code 128/39 labels (what Raff prints for SKU-only items) and QR codes. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] as const;

export interface Detected { rawValue: string; format: string }
export interface Detector { detect(source: ImageBitmapSource): Promise<Detected[]> }

let detector: Promise<Detector> | null = null;

async function nativeDetector(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported: string[] = await Native.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    // Some platforms expose the API with only QR support: not enough for shelf labels.
    return formats.includes('ean_13') && formats.includes('code_128') ? new Native({ formats }) : null;
  } catch {
    return null;
  }
}

async function wasmDetector(): Promise<Detector> {
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  // Serve the .wasm from our own build instead of the library's default CDN.
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export function loadDetector(): Promise<Detector> {
  detector ??= nativeDetector().then((d) => d ?? wasmDetector());
  detector.catch(() => { detector = null; }); // allow a retry after a failed download
  return detector;
}

/** A short confirmation beep (and a buzz on phones) when a code is read. */
export function signalRead() {
  try { navigator.vibrate?.(60); } catch { /* not supported */ }
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1760;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* audio blocked */ }
}
