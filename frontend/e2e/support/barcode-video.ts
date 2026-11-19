import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Writes a one-frame Y4M video of an EAN-13 barcode. Chrome's fake camera
 * (--use-file-for-fake-video-capture) plays it on a loop, so the e2e test exercises
 * the real scanner: camera stream → ZXing WebAssembly → product lookup.
 */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function ean13Modules(code: string) {
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

export function writeBarcodeVideo(path: string, code: string, width = 640, height = 480) {
  const bits = ean13Modules(code);
  const module = 4;
  const barW = bits.length * module;
  const x0 = Math.floor((width - barW) / 2);
  const y0 = Math.floor(height * 0.3), y1 = Math.floor(height * 0.7);

  const y = Buffer.alloc(width * height, 255); // white
  for (let row = y0; row < y1; row++) {
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== '1') continue;
      y.fill(0, row * width + x0 + i * module, row * width + x0 + (i + 1) * module);
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128); // no colour
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), y, chroma,
  ]));
}
