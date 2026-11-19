import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { Warehouse } from '../api/types';
import { PageHead } from '../components/Layout';
import { WarehouseChip } from '../components/inventory';
import { ConfirmDialog, EmptyState, ErrorState, Field, FormError, Modal, useToast } from '../components/ui';
import { fmt } from '../lib/format';
import { t } from '../i18n';

function WarehouseForm({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [name, setName] = useState(warehouse?.name ?? '');
  const [address, setAddress] = useState(warehouse?.address ?? '');
  const [isActive, setIsActive] = useState(warehouse?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = { code: code.trim().toUpperCase(), name: name.trim(), address: address.trim() || null, isActive };
      return warehouse ? api.put(`/api/warehouses/${warehouse.id}`, body) : api.post('/api/warehouses', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast(warehouse ? t('wh.saved') : t('wh.added', { name: name.trim() }));
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9-]{2,10}$/.test(code.trim())) e.code = t('wh.err.code');
    if (!name.trim()) e.name = t('wh.err.name');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    save.mutate();
  }

  return (
    <Modal
      size="sm"
      title={warehouse ? t('wh.edit') : t('wh.new')}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>{warehouse ? t('common.save') : t('wh.add')}</button></>}
    >
      <FormError message={error} />
      <Field label={t('wh.name')} error={errors.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-invalid={!!errors.name} />
      </Field>
      <Field label={t('wh.code')} error={errors.code} hint={t('wh.codeHint')}>
        <input className="input ltr" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10}
          aria-invalid={!!errors.code} />
      </Field>
      <Field label={t('wh.address')}>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
      </Field>
      {warehouse && (
        <label className="switch">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t('wh.active')}
        </label>
      )}
    </Modal>
  );
}

export default function WarehousesPage() {
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['warehouses', 'manage', showInactive],
    queryFn: () => api.get<Warehouse[]>('/api/warehouses', { includeInactive: showInactive }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del<{ archived: boolean }>(`/api/warehouses/${id}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast(r.archived ? t('wh.archived') : t('wh.removed'));
      setDeleting(null);
    },
    onError: (e) => { toast(e instanceof Error ? e.message : t('common.deleteFailed'), 'error'); setDeleting(null); },
  });

  return (
    <>
      <PageHead
        title={t('wh.title')}
        subtitle={t('wh.subtitle')}
        actions={
          <>
            <label className="switch" style={{ fontSize: 14, alignSelf: 'center' }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              {t('wh.showInactive')}
            </label>
            <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('wh.new')}</button>
          </>
        }
      />

      {list.isError ? <div className="panel"><ErrorState error={list.error} onRetry={list.refetch} /></div>
        : list.data?.length === 0 ? <div className="panel"><EmptyState title={t('wh.empty')} /></div>
        : (
          <div className="card-list">
            {(list.data ?? []).map((w) => (
              <article key={w.id} className={`panel wh-card ${w.isActive ? '' : 'inactive'}`}>
                <div className="row">
                  <WarehouseChip code={w.code} />
                  <h3>{w.name}</h3>
                  {!w.isActive && <span className="badge badge-off">{t('wh.inactive')}</span>}
                  <button className="btn btn-ghost btn-icon" onClick={() => setEditing(w)} aria-label={t('wh.editAria', { name: w.name })}><Pencil size={16} /></button>
                  {w.isActive && (
                    <button className="btn btn-ghost btn-icon" onClick={() => setDeleting(w)} aria-label={t('wh.deleteAria', { name: w.name })}><Trash2 size={16} /></button>
                  )}
                </div>
                {w.address && <p className="muted" style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><MapPin size={14} /> {w.address}</p>}
                <div className="figures">
                  <span>{t('wh.value', { v: fmt.moneyRound(w.stockValue) })}</span>
                  <span>{t('wh.units', { n: fmt.int(w.units) })}</span>
                  <span>{t('wh.products', { n: fmt.int(w.products) })}</span>
                  <span>{t('wh.users', { n: fmt.int(w.users) })}</span>
                </div>
              </article>
            ))}
          </div>
        )}

      {editing && <WarehouseForm warehouse={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('wh.deleteTitle')}
          text={t('wh.deleteText', { name: deleting.name })}
          confirmLabel={t('wh.deleteConfirm')}
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
