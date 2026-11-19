import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { Category } from '../api/types';
import { PageHead } from '../components/Layout';
import { ConfirmDialog, EmptyState, ErrorState, Field, FormError, Modal, useToast } from '../components/ui';
import { fmt } from '../lib/format';
import { t } from '../i18n';

function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return category ? api.put(`/api/categories/${category.id}`, body) : api.post('/api/categories', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(category ? t('cat.saved') : t('cat.added', { name: name.trim() }));
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  return (
    <Modal
      size="sm"
      title={category ? t('cat.edit') : t('cat.new')}
      onClose={onClose}
      as="form"
      onSubmit={() => (name.trim() ? save.mutate() : setError(t('cat.err.name')))}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>{category ? t('common.save') : t('cat.add')}</button></>}
    >
      <FormError message={error} />
      <Field label={t('cat.name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
      <Field label={t('cat.desc')} hint={t('cat.descHint')}>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
}

export default function CategoriesPage() {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast(t('cat.deleted')); setDeleting(null); },
    onError: (e) => { toast(e instanceof Error ? e.message : t('common.deleteFailed'), 'error'); setDeleting(null); },
  });

  return (
    <>
      <PageHead
        title={t('cat.title')}
        subtitle={t('cat.subtitle')}
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('cat.new')}</button>}
      />

      {list.isError ? <div className="panel"><ErrorState error={list.error} onRetry={list.refetch} /></div>
        : list.data?.length === 0 ? (
          <div className="panel"><EmptyState title={t('cat.empty')} text={t('cat.emptyText')}
            action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> {t('cat.new')}</button>} /></div>
        ) : (
          <div className="card-list">
            {(list.data ?? []).map((c) => (
              <article key={c.id} className="panel cat-card">
                <div className="row">
                  <h3>{c.name}</h3>
                  <button className="btn btn-ghost btn-icon" onClick={() => setEditing(c)} aria-label={t('cat.editAria', { name: c.name })}><Pencil size={16} /></button>
                  <button className="btn btn-ghost btn-icon" onClick={() => setDeleting(c)} aria-label={t('cat.deleteAria', { name: c.name })}><Trash2 size={16} /></button>
                </div>
                <p className="muted" style={{ fontSize: 13.5 }}>{c.description ?? t('cat.noDesc')}</p>
                <div className="figures">
                  <Link to="/products" style={{ textDecoration: 'none' }}>{t('cat.products', { n: fmt.int(c.productCount) })}</Link>
                  <span>{t('cat.value', { v: fmt.moneyRound(c.stockValue) })}</span>
                </div>
              </article>
            ))}
          </div>
        )}

      {editing && <CategoryForm category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('cat.deleteTitle')}
          text={deleting.productCount > 0
            ? t('cat.deleteHasProducts', { name: deleting.name, n: deleting.productCount })
            : t('cat.deleteText', { name: deleting.name })}
          confirmLabel={t('cat.deleteConfirm')}
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
