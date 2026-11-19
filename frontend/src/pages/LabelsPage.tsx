import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { Paged, Product } from '../api/types';
import { PageHead } from '../components/Layout';
import BarcodeSvg from '../components/BarcodeSvg';
import { ScanInput } from '../components/Scanner';
import { useToast } from '../components/ui';
import { labelCode } from '../lib/barcode';
import { fmt } from '../lib/format';
import { t, type TKey } from '../i18n';

/** Physical layouts, in millimetres. The sheet matches common 3×8 A4 label stock (70 × 37 mm). */
const FORMATS = {
  sheet: { label: 'lbl.format.sheet', cols: 3, rows: 8, w: 70, h: 37.125, page: 'A4', pageW: 210, pageH: 297 },
  roll: { label: 'lbl.format.roll', cols: 1, rows: 1, w: 50, h: 30, page: '50mm 30mm', pageW: 50, pageH: 30 },
} as const satisfies Record<string, { label: TKey; cols: number; rows: number; w: number; h: number; page: string; pageW: number; pageH: number }>;
type FormatKey = keyof typeof FORMATS;

interface Line { product: Product; copies: number }

const MAX_COPIES = 500;

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

function Label({ product, showPrice, showLocation, compact }: {
  product: Product; showPrice: boolean; showLocation: boolean; compact: boolean;
}) {
  return (
    <div className={`label ${compact ? 'compact' : ''}`}>
      <div className="label-name" dir="auto">{product.name}</div>
      <BarcodeSvg code={labelCode(product)} className="label-code" />
      <div className="label-foot">
        <span className="label-sku" dir="ltr">{product.sku}{showLocation && product.location ? ` · ${product.location}` : ''}</span>
        {showPrice && <strong className="label-price" dir="ltr">{fmt.money(product.salePrice)}</strong>}
      </div>
    </div>
  );
}

export default function LabelsPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [format, setFormat] = useState<FormatKey>('sheet');
  const [showPrice, setShowPrice] = useState(true);
  const [showLocation, setShowLocation] = useState(false);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [looking, setLooking] = useState(false);

  const add = (product: Product, copies = 1) =>
    setLines((ls) => ls.some((l) => l.product.id === product.id)
      ? ls.map((l) => (l.product.id === product.id ? { ...l, copies: Math.min(MAX_COPIES, l.copies + copies) } : l))
      : [...ls, { product, copies }]);
  const setCopies = (id: number, copies: number) =>
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, copies: Math.max(1, Math.min(MAX_COPIES, copies || 1)) } : l)));
  const remove = (id: number) => setLines((ls) => ls.filter((l) => l.product.id !== id));

  // Products passed in the address (?ids=3,7) — e.g. "Print label" from a product's details.
  useEffect(() => {
    const ids = (params.get('ids') ?? '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return;
    Promise.all(ids.map((id) => api.get<Product>(`/api/products/${id}`).catch(() => null)))
      .then((ps) => setLines(ps.filter((p): p is Product => !!p).map((product) => ({ product, copies: 1 }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useQuery({
    queryKey: ['products', 'label-search', q],
    queryFn: () => api.get<Paged<Product>>('/api/products', { search: q, pageSize: 8, sort: 'name' }),
    enabled: q.length > 0,
  });

  async function addByCode(code: string) {
    setLooking(true);
    try {
      add(await api.get<Product>('/api/products/lookup', { code }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.actionFailed'), 'error');
    } finally {
      setLooking(false);
    }
  }

  const f = FORMATS[format];

  // Shrink the real-size preview to fit narrow screens (printing always uses the real size).
  const previewRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const sheetPx = (f.pageW * 96) / 25.4 + 8;
    const fit = () => setZoom(Math.min(1, el.clientWidth / sheetPx));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.pageW]);
  const perPage = f.cols * f.rows;
  const offset = format === 'sheet' ? skip : 0;
  const total = lines.reduce((n, l) => n + l.copies, 0);

  // Every printed label in order, with empty slots first when part of the sheet was already used.
  const pages = useMemo(() => {
    const slots: (Product | null)[] = [...Array(offset).fill(null), ...lines.flatMap((l) => Array(l.copies).fill(l.product))];
    const out: (Product | null)[][] = [];
    for (let i = 0; i < slots.length; i += perPage) out.push(slots.slice(i, i + perPage));
    return out;
  }, [lines, perPage, offset]);

  return (
    <>
      {/* Page size for the printer: A4 sheet or one small label per page on a roll. */}
      <style>{`@media print { @page { size: ${f.page}; margin: 0; } }`}</style>

      <PageHead
        title={t('lbl.title')}
        subtitle={!total ? t('lbl.subtitle') : pages.length === 1 ? t('lbl.summaryOne', { n: fmt.int(total) })
          : t('lbl.summary', { n: fmt.int(total), p: fmt.int(pages.length) })}
        actions={
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!total}>
            <Printer size={17} /> {t('lbl.printNow')}
          </button>
        }
      />

      <div className="labels-layout">
        <aside className="labels-controls">
          <section className="panel">
            <div className="panel-head"><h2>{t('lbl.products')}</h2></div>
            <div className="labels-pick">
              <ScanInput label={t('lbl.scanToAdd')} placeholder={t('lbl.scanPlaceholder')} onCode={addByCode} busy={looking} />

              <div className="search">
                <Search size={16} />
                <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('lbl.searchPlaceholder')} aria-label={t('lbl.searchAria')} />
              </div>
              {q && (
                <ul className="pick-results" aria-label={t('lbl.results')}>
                  {results.data?.items.length === 0 && <li className="muted">{t('prod.noMatch')}</li>}
                  {results.data?.items.map((p) => (
                    <li key={p.id}>
                      <div style={{ minWidth: 0 }}>
                        <div className="cell-title">{p.name}</div>
                        <div className="cell-sub ltr" dir="ltr">{labelCode(p)}</div>
                      </div>
                      <button type="button" className="btn btn-sm" onClick={() => add(p)} aria-label={t('lbl.addAria', { name: p.name })}>
                        <Plus size={15} /> {t('lbl.add')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {lines.length > 0 && (
                <>
                  <div className="pick-head">
                    <h3>{t('lbl.selected', { n: fmt.int(lines.length) })}</h3>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([])}>
                      <Trash2 size={14} /> {t('lbl.clear')}
                    </button>
                  </div>
                  <ul className="pick-lines">
                    {lines.map(({ product: p, copies }) => (
                      <li key={p.id}>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-title">{p.name}</div>
                          <div className="cell-sub">{t('lbl.inStock', { n: fmt.int(p.quantity), unit: p.unit })}</div>
                        </div>
                        <div className="stepper" role="group" aria-label={t('lbl.copiesOf', { name: p.name })}>
                          <button type="button" onClick={() => setCopies(p.id, copies - 1)} disabled={copies <= 1} aria-label={t('lbl.less')}><Minus size={14} /></button>
                          <input inputMode="numeric" value={copies} aria-label={t('lbl.copies')}
                            onChange={(e) => setCopies(p.id, Number(e.target.value.replace(/\D/g, '')))} />
                          <button type="button" onClick={() => setCopies(p.id, copies + 1)} aria-label={t('lbl.more')}><Plus size={14} /></button>
                        </div>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(p.id)} aria-label={t('lbl.remove', { name: p.name })}>
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>{t('lbl.layout')}</h2></div>
            <div className="labels-pick">
              <div className="segmented" role="group" aria-label={t('lbl.layout')}>
                {(Object.keys(FORMATS) as FormatKey[]).map((k) => (
                  <button key={k} type="button" aria-pressed={format === k} onClick={() => setFormat(k)}>{t(FORMATS[k].label)}</button>
                ))}
              </div>
              {format === 'sheet' && (
                <label className="field">
                  <span>{t('lbl.skip')}</span>
                  <select className="select" value={skip} onChange={(e) => setSkip(Number(e.target.value))}>
                    {Array.from({ length: perPage }, (_, i) => (
                      <option key={i} value={i}>{i === 0 ? t('lbl.skipNone') : t('lbl.skipN', { n: i })}</option>
                    ))}
                  </select>
                  <small>{t('lbl.skipHint')}</small>
                </label>
              )}
              <label className="switch"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />{t('lbl.showPrice')}</label>
              <label className="switch"><input type="checkbox" checked={showLocation} onChange={(e) => setShowLocation(e.target.checked)} />{t('lbl.showLocation')}</label>
            </div>
          </section>
        </aside>

        <section className="labels-preview" aria-label={t('lbl.preview')} ref={previewRef}>
          {!total ? (
            <div className="panel"><div className="state">
              <h3>{t('lbl.emptyTitle')}</h3>
              <p>{t('lbl.emptyText')}</p>
            </div></div>
          ) : (
            <div className={`label-sheets ${format}`} style={{ zoom }}>
              {pages.map((slots, i) => (
                <div key={i} className="sheet" style={{
                  width: `${f.pageW}mm`, height: `${f.pageH}mm`,
                  gridTemplateColumns: `repeat(${f.cols}, ${f.w}mm)`, gridTemplateRows: `repeat(${f.rows}, ${f.h}mm)`,
                }}>
                  {slots.map((p, j) => p
                    ? <Label key={j} product={p} showPrice={showPrice} showLocation={showLocation} compact={format === 'roll'} />
                    : <div key={j} className="label empty" aria-hidden="true" />)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
