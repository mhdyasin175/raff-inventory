import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Info, Scale } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Movement, MovementInput, MovementType, Paged, Product } from '../api/types';
import { P, useAuth } from '../auth/AuthContext';
import { fmt } from '../lib/format';
import { t, type TKey } from '../i18n';
import { Field, FormError, Modal, useToast } from './ui';
import { ShelfLabel, StockGauge } from './inventory';

const TYPES: { type: MovementType; perm: string; label: TKey; icon: typeof Scale }[] = [
  { type: 'In', perm: P.movementsIn, label: 'mf.in', icon: ArrowDownLeft },
  { type: 'Out', perm: P.movementsOut, label: 'mf.out', icon: ArrowUpRight },
  { type: 'Adjustment', perm: P.movementsAdjust, label: 'mf.adjust', icon: Scale },
];

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function canRecordMovements(can: (...p: string[]) => boolean) {
  return can(P.movementsIn, P.movementsOut, P.movementsAdjust);
}

export default function MovementForm({ onClose, productId, initialType }: {
  onClose: () => void; productId?: number; initialType?: MovementType;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const allowed = TYPES.filter((t) => can(t.perm));

  const [type, setType] = useState<MovementType>(
    initialType && allowed.some((t) => t.type === initialType) ? initialType : allowed[0]?.type ?? 'In',
  );
  const [pid, setPid] = useState<number>(productId ?? 0);
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const products = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => api.get<Paged<Product>>('/api/products', { pageSize: 200, sort: 'name' }),
  });

  const grouped = useMemo(() => {
    const g = new Map<string, Product[]>();
    products.data?.items.forEach((p) => g.set(p.categoryName, [...(g.get(p.categoryName) ?? []), p]));
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [products.data]);

  const product = products.data?.items.find((p) => p.id === pid);
  const qty = Number(quantity);
  const validQty = quantity !== '' && Number.isInteger(qty) && qty >= 0;
  const after = !product || !validQty ? null
    : type === 'In' ? product.quantity + qty
    : type === 'Out' ? product.quantity - qty
    : qty;

  const save = useMutation({
    mutationFn: (body: MovementInput) => api.post<Movement>('/api/movements', body),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast(t(`mf.done.${m.type}`, { q: fmt.int(Math.abs(m.quantityChange)), unit: m.unit, name: m.productName }));
      onClose();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
      if (e instanceof ApiError) {
        setFieldErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
      }
    },
  });

  function submit() {
    const errs: Record<string, string> = {};
    if (!pid) errs.productId = t('mf.err.product');
    if (!validQty || (type !== 'Adjustment' && qty === 0)) errs.quantity = t('mf.err.qty');
    if (type === 'Out' && product && validQty && qty > product.quantity)
      errs.quantity = t('mf.err.available', { q: fmt.int(product.quantity), unit: product.unit });
    if (type === 'Adjustment' && product && validQty && qty === product.quantity)
      errs.quantity = t('mf.err.same');
    if (type === 'Adjustment' && !note.trim()) errs.note = t('mf.err.reason');
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setError(null); return; }

    setError(null);
    save.mutate({
      productId: pid, type, quantity: qty,
      unitPrice: unitPrice === '' ? null : Number(unitPrice),
      party: party || null, reference: reference || null, note: note || null,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
    });
  }

  const defaultPrice = product ? (type === 'Out' ? product.salePrice : product.costPrice) : null;

  return (
    <Modal
      title={t('mf.title')}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      footer={
        <>
          {after !== null && (
            <span className="muted" style={{ alignSelf: 'center', fontSize: 14 }}>
              <span style={{ color: after < 0 ? 'var(--out)' : undefined }}>{t('mf.after', { n: fmt.int(after), unit: product?.unit ?? '' })}</span>
            </span>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('mf.submit')}
          </button>
        </>
      }
    >
      <FormError message={error} />

      <div className="segmented" role="group" aria-label={t('mf.type')} style={{ alignSelf: 'flex-start' }}>
        {allowed.map(({ type: mt, label, icon: Icon }) => (
          <button key={mt} type="button" aria-pressed={type === mt} onClick={() => { setType(mt); setFieldErrors({}); }}>
            <Icon size={15} /> {t(label)}
          </button>
        ))}
      </div>

      <Field label={t('mf.product')} error={fieldErrors.productId}>
        <select className="select" value={pid} onChange={(e) => setPid(Number(e.target.value))}
          aria-invalid={!!fieldErrors.productId} disabled={products.isLoading}>
          <option value={0}>{products.isLoading ? t('mf.loadingProducts') : t('mf.pickProduct')}</option>
          {grouped.map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </optgroup>
          ))}
        </select>
      </Field>

      {product && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
          <ShelfLabel sku={product.sku} />
          <div style={{ flex: 1 }}>
            <StockGauge quantity={product.quantity} reorderLevel={product.reorderLevel} unit={product.unit} />
          </div>
        </div>
      )}

      <div className="grid-2">
        <Field
          label={type === 'Adjustment' ? t('mf.counted') : t('mf.qty')}
          error={fieldErrors.quantity}
          hint={type === 'Adjustment' && product && validQty
            ? t('mf.diff', { d: fmt.signed(qty - product.quantity), unit: product.unit })
            : product?.unit}
        >
          <input className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
            aria-invalid={!!fieldErrors.quantity} />
        </Field>
        {type !== 'Adjustment' && (
          <Field label={t('mf.price')} hint={defaultPrice !== null ? t('mf.priceHint', { p: fmt.money(defaultPrice) }) : undefined}>
            <input className="input" inputMode="decimal" value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder={defaultPrice?.toFixed(2)} />
          </Field>
        )}
      </div>

      {type !== 'Adjustment' && (
        <div className="grid-2">
          <Field label={type === 'In' ? t('mf.supplier') : t('mf.customer')}>
            <input className="input" value={party} onChange={(e) => setParty(e.target.value)} maxLength={150} />
          </Field>
          <Field label={type === 'In' ? t('mf.receipt') : t('mf.invoice')}>
            <input className="input ltr" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
          </Field>
        </div>
      )}

      <div className="grid-2">
        <Field label={t('mf.when')}>
          <input className="input" type="datetime-local" value={occurredAt} max={nowLocalInput()}
            onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
      </div>

      <Field label={type === 'Adjustment' ? t('mf.reason') : t('mf.notes')} error={fieldErrors.note}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
          aria-invalid={!!fieldErrors.note}
          placeholder={type === 'Adjustment' ? t('mf.reasonPlaceholder') : undefined} />
      </Field>

      {type === 'Adjustment' && (
        <div className="form-note"><Info size={16} style={{ flex: 'none', marginTop: 3 }} />
          {t('mf.adjustNote')}
        </div>
      )}
    </Modal>
  );
}
