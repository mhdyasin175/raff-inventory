import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Category, Product, ProductInput } from '../api/types';
import { fmt } from '../lib/format';
import { getLang, t } from '../i18n';
import { Drawer, Field, FormError, useToast } from './ui';
import { useWarehouse } from '../auth/WarehouseContext';

const UNITS = {
  ar: ['قطعة', 'علبة', 'كرتونة', 'طقم', 'لفة', 'سطل', 'كيس', 'متر', 'كغ', 'لتر'],
  en: ['pcs', 'box', 'carton', 'set', 'roll', 'bucket', 'bag', 'm', 'kg', 'L'],
};
const PREFIX_HINTS: Record<string, string> = {
  'كهربائيات': 'ELC', 'إنارة': 'LGT', 'عدد يدوية': 'HND', 'عدد كهربائية': 'PWR',
  'سباكة': 'PLB', 'دهانات': 'PNT', 'تثبيت ولواصق': 'FIX',
  Electrical: 'ELC', Lighting: 'LGT', 'Hand tools': 'HND', 'Power tools': 'PWR',
  Plumbing: 'PLB', Paint: 'PNT', 'Fixings & adhesives': 'FIX',
};

export default function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const isEdit = !!product;
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') });
  const wh = useWarehouse();
  const [openingWarehouseId, setOpeningWarehouseId] = useState<number>(wh.defaultId ?? 0);
  useEffect(() => { if (!openingWarehouseId && wh.defaultId) setOpeningWarehouseId(wh.defaultId); }, [openingWarehouseId, wh.defaultId]);

  const [form, setForm] = useState<ProductInput>({
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? 0,
    unit: product?.unit ?? UNITS[getLang()][0],
    location: product?.location ?? '',
    costPrice: product?.costPrice ?? 0,
    salePrice: product?.salePrice ?? 0,
    reorderLevel: product?.reorderLevel ?? 10,
    isActive: product?.isActive ?? true,
    openingQuantity: 0,
  });
  // Keep raw strings for number inputs so users can type "1." without it snapping back.
  const [nums, setNums] = useState({
    costPrice: product ? String(product.costPrice) : '',
    salePrice: product ? String(product.salePrice) : '',
    reorderLevel: String(product?.reorderLevel ?? 10),
    openingQuantity: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = (k: keyof typeof nums, v: string, decimal = false) =>
    setNums((n) => ({ ...n, [k]: v.replace(decimal ? /[^\d.]/g : /[^\d]/g, '') }));

  async function suggestSku() {
    const cat = categories.data?.find((c) => c.id === form.categoryId);
    const prefix = (cat && PREFIX_HINTS[cat.name]) ?? 'PRD';
    try {
      const r = await api.get<{ sku: string }>('/api/products/next-sku', { prefix });
      set('sku', r.sku);
    } catch { /* leave as is */ }
  }

  const save = useMutation({
    mutationFn: (body: ProductInput) =>
      isEdit ? api.put<Product>(`/api/products/${product!.id}`, body) : api.post<Product>('/api/products', body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast(isEdit ? t('pf.saved', { name: p.name }) : t('pf.added', { name: p.name }));
      onClose();
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : t('common.saveFailed'));
      if (e instanceof ApiError) setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
    },
  });

  function submit() {
    const body: ProductInput = {
      ...form,
      sku: form.sku.trim(),
      name: form.name.trim(),
      location: form.location?.trim() || null,
      costPrice: Number(nums.costPrice || 0),
      salePrice: Number(nums.salePrice || 0),
      reorderLevel: Number(nums.reorderLevel || 0),
      openingQuantity: Number(nums.openingQuantity || 0),
      openingWarehouseId: openingWarehouseId || null,
    };
    const e: Record<string, string> = {};
    if (!body.name) e.name = t('pf.err.name');
    if (!body.sku) e.sku = t('pf.err.sku');
    if (!body.categoryId) e.categoryId = t('pf.err.category');
    if (body.salePrice > 0 && body.salePrice < body.costPrice) e.salePrice = t('pf.err.salePrice');
    setErrors(e);
    if (Object.keys(e).length) return;
    setFormError(null);
    save.mutate(body);
  }

  const margin = Number(nums.costPrice) > 0 ? ((Number(nums.salePrice) - Number(nums.costPrice)) / Number(nums.costPrice)) * 100 : null;

  return (
    <Drawer
      title={isEdit ? t('pf.editTitle') : t('pf.newTitle')}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : isEdit ? t('pf.saveEdit') : t('pf.saveNew')}
          </button>
        </>
      }
    >
      <FormError message={formError} />

      <Field label={t('pf.name')} error={errors.name}>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} aria-invalid={!!errors.name} />
      </Field>

      <div className="grid-2">
        <Field label={t('pf.category')} error={errors.categoryId}>
          <select className="select" value={form.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))} aria-invalid={!!errors.categoryId}>
            <option value={0}>{t('pf.pickCategory')}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t('pf.sku')} error={errors.sku}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input ltr" dir="ltr" value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())}
              maxLength={40} aria-invalid={!!errors.sku} placeholder="ELC-0150" />
            <button type="button" className="btn btn-icon" onClick={suggestSku} title={t('pf.suggestSku')} aria-label={t('pf.suggestSku')}
              disabled={!form.categoryId} style={{ height: 40, width: 40, flex: 'none' }}>
              <Wand2 size={16} />
            </button>
          </div>
        </Field>
      </div>

      <div className="grid-2">
        <Field label={t('pf.unit')}>
          <select className="select" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {[...new Set([form.unit, ...UNITS[getLang()]])].map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label={t('pf.location')} hint={t('pf.locationHint')}>
          <input className="input ltr" dir="ltr" value={form.location ?? ''} onChange={(e) => set('location', e.target.value.toUpperCase())} maxLength={30} />
        </Field>
      </div>

      <div className="grid-3">
        <Field label={t('pf.cost')}>
          <input className="input" inputMode="decimal" value={nums.costPrice} onChange={(e) => setNum('costPrice', e.target.value, true)} />
        </Field>
        <Field label={t('pf.sale')} error={errors.salePrice}
          hint={margin !== null && Number(nums.salePrice) > 0 ? t('pf.margin', { p: `${margin.toFixed(0)}%` }) : undefined}>
          <input className="input" inputMode="decimal" value={nums.salePrice} onChange={(e) => setNum('salePrice', e.target.value, true)} aria-invalid={!!errors.salePrice} />
        </Field>
        <Field label={t('pf.reorder')} hint={t('pf.reorderHint')}>
          <input className="input" inputMode="numeric" value={nums.reorderLevel} onChange={(e) => setNum('reorderLevel', e.target.value)} />
        </Field>
      </div>

      {isEdit ? (
        <>
          <div className="form-note">
            {t('pf.qtyNote', { q: fmt.int(product!.quantity), unit: product!.unit })}
          </div>
          <label className="switch">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            {t('pf.active')}
          </label>
        </>
      ) : (
        <div className="grid-2">
          <Field label={t('pf.opening')} hint={t('pf.openingHint')}>
            <input className="input" inputMode="numeric" value={nums.openingQuantity} onChange={(e) => setNum('openingQuantity', e.target.value)} />
          </Field>
          <Field label={t('pf.openingWarehouse')}>
            <select className="select" value={openingWarehouseId} disabled={wh.locked}
              onChange={(e) => setOpeningWarehouseId(Number(e.target.value))}>
              {wh.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </Field>
        </div>
      )}
    </Drawer>
  );
}
