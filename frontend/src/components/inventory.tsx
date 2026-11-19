import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import type { MovementType, StockStatus } from '../api/types';
import { fmt } from '../lib/format';
import { t } from '../i18n';

/** Deterministic barcode-like stripes derived from the SKU text (decorative, not a real symbology). */
function Barcode({ value }: { value: string }) {
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  while (x < 96) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const w = 1 + ((seed >>> 16) % 3);
    const gap = 1 + ((seed >>> 20) % 2);
    bars.push({ x, w });
    x += w + gap;
  }
  return (
    <svg viewBox="0 0 96 10" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={10} fill="currentColor" />)}
    </svg>
  );
}

export function ShelfLabel({ sku, size = 'sm', muted }: { sku: string; size?: 'sm' | 'lg'; muted?: boolean }) {
  return (
    <span className={`shelf-label ${size === 'lg' ? 'lg' : ''} ${muted ? 'muted-label' : ''}`} title={t('inv.skuTitle', { sku })}>
      <code>{sku}</code>
      <Barcode value={sku} />
    </span>
  );
}

export function Bin({ location }: { location: string | null }) {
  if (!location) return <span className="muted">—</span>;
  return <span className="bin" title={t('inv.location')}>{location}</span>;
}

/**
 * On-hand quantity against the reorder level. The bar's scale is 3× the reorder
 * level so a "healthy" product sits comfortably past the red tick.
 */
export function StockGauge({ quantity, reorderLevel, unit, compact }: {
  quantity: number; reorderLevel: number; unit: string; compact?: boolean;
}) {
  const max = Math.max(reorderLevel * 3, quantity, 1);
  const state = quantity === 0 ? 'out' : quantity <= reorderLevel ? 'low' : 'ok';
  const pct = (quantity / max) * 100;
  const tick = (reorderLevel / max) * 100;
  return (
    <div className={`gauge ${state}`}>
      <div className="gauge-top">
        <span><strong className="num">{fmt.int(quantity)}</strong> <span className="muted">{unit}</span></span>
        {!compact && state === 'out' && <span className="badge badge-none">{t('inv.status.out')}</span>}
      </div>
      <div
        className="gauge-bar"
        role="meter"
        aria-valuenow={quantity}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={t('inv.gaugeAria', { q: quantity, unit, r: reorderLevel })}
      >
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
        {reorderLevel > 0 && <div className="gauge-tick" style={{ insetInlineStart: `calc(${tick}% - 1px)` }} />}
      </div>
      {!compact && <span className="gauge-legend">{t('inv.reorderAt', { n: fmt.int(reorderLevel) })}</span>}
    </div>
  );
}

const TYPE_META: Record<MovementType, { cls: string; icon: typeof Scale }> = {
  In: { cls: 'in', icon: ArrowDownLeft },
  Out: { cls: 'out', icon: ArrowUpRight },
  Adjustment: { cls: 'adj', icon: Scale },
};

export const movementLabel = (type: MovementType) => t(`type.${type}`);

export function MovementBadge({ type }: { type: MovementType }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <span className={`badge badge-${m.cls}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {movementLabel(type)}
    </span>
  );
}

export function MovementIcon({ type }: { type: MovementType }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return <span className={`feed-icon ${m.cls}`} aria-label={movementLabel(type)}><Icon size={17} strokeWidth={2.2} /></span>;
}

export function QtyChange({ type, value }: { type: MovementType; value: number }) {
  const cls = type === 'In' ? 'qty-in' : type === 'Out' ? 'qty-out' : 'qty-adj';
  return <span className={`num ${cls}`}>{fmt.signed(value)}</span>;
}

export function StatusBadge({ status, active = true }: { status: StockStatus; active?: boolean }) {
  if (!active) return <span className="badge badge-off">{t('inv.status.archived')}</span>;
  if (status === 'Out') return <span className="badge badge-none">{t('inv.status.out')}</span>;
  if (status === 'Low') return <span className="badge badge-low">{t('inv.status.low')}</span>;
  return <span className="badge badge-ok">{t('inv.status.ok')}</span>;
}
