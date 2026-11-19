import { useLayoutEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { symbologyFor } from '../lib/barcode';

/** A printable barcode: EAN-13 / EAN-8 / UPC-A for retail codes, Code 128 for everything else (e.g. SKUs). */
export default function BarcodeSvg({ code, className }: { code: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const common = {
      width: 2, height: 64, margin: 0, marginBottom: 3, fontSize: 17, textMargin: 2,
      font: '"IBM Plex Mono", ui-monospace, monospace', background: '#ffffff', lineColor: '#000000',
    };
    try {
      JsBarcode(ref.current, code, { ...common, format: symbologyFor(code) });
    } catch {
      JsBarcode(ref.current, code, { ...common, format: 'CODE128' });
    }
  }, [code]);

  return <svg ref={ref} className={className} role="img" aria-label={code} data-code={code} />;
}
