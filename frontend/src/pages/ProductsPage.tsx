import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Archive, Pencil, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import type { Category, Movement, Paged, Product } from '../api/types';
import { P, useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/Layout';
import ProductForm from '../components/ProductForm';
import MovementForm, { canRecordMovements } from '../components/MovementForm';
import { Bin, MovementBadge, QtyChange, ShelfLabel, StatusBadge, StockGauge } from '../components/inventory';
import { ConfirmDialog, Drawer, EmptyState, ErrorState, Pagination, SkeletonRows, useToast } from '../components/ui';
import { fmt } from '../lib/format';
import { t, type TKey } from '../i18n';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const STATUS_FILTERS: { key: string; label: TKey }[] = [
  { key: '', label: 'common.all' },
  { key: 'attention', label: 'prod.filterAttention' },
  { key: 'out', label: 'prod.filterOut' },
];

function ProductDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (p: Product) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const product = useQuery({ queryKey: ['products', 'one', id], queryFn: () => api.get<Product>(`/api/products/${id}`) });
  const history = useQuery({
    queryKey: ['movements', 'product', id],
    queryFn: () => api.get<Paged<Movement>>('/api/movements', { productId: id, pageSize: 12 }),
    enabled: can(P.movementsView),
  });

  const archive = useMutation({
    mutationFn: () => api.del<{ archived: boolean }>(`/api/products/${id}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(r.archived ? t('prod.archived') : t('prod.deleted'));
      onClose();
    },
    onError: (e) => toast(e instanceof Error ? e.message : t('common.actionFailed'), 'error'),
  });

  const p = product.data;
  return (
    <>
      <Drawer
        title={p?.name ?? t('prod.detailTitle')}
        onClose={onClose}
        footer={p && (
          <>
            {can(P.productsManage) && p.isActive && (
              <button className="btn btn-danger" onClick={() => setConfirm(true)}><Archive size={16} /> {t('prod.archive')}</button>
            )}
            <span className="spacer" />
            {can(P.productsManage) && <button className="btn" onClick={() => onEdit(p)}><Pencil size={16} /> {t('prod.edit')}</button>}
            {canRecordMovements(can) && p.isActive && (
              <button className="btn btn-primary" onClick={() => setRecording(true)}><ArrowDownUp size={16} /> {t('dash.record')}</button>
            )}
          </>
        )}
      >
        {product.isError ? <ErrorState error={product.error} onRetry={product.refetch} /> : !p ? <div className="skeleton" style={{ height: 200 }} /> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <ShelfLabel sku={p.sku} size="lg" muted={!p.isActive} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                <span>{p.categoryName}</span>
                <span className="muted" style={{ fontSize: 13.5 }}>{t('prod.locationLabel')} <Bin location={p.location} /></span>
                <StatusBadge status={p.status} active={p.isActive} />
              </div>
            </div>

            <StockGauge quantity={p.quantity} reorderLevel={p.reorderLevel} unit={p.unit} />

            <div className="kv">
              <div><span>{t('prod.cost')}</span><strong className="num">{fmt.money(p.costPrice)}</strong></div>
              <div><span>{t('prod.sale')}</span><strong className="num">{fmt.money(p.salePrice)}</strong></div>
              <div><span>{t('prod.value')}</span><strong className="num">{fmt.moneyRound(p.stockValue)}</strong></div>
            </div>

            {can(P.movementsView) && (
              <div>
                <h3 style={{ marginBottom: 10 }}>{t('prod.history')}</h3>
                {history.data?.items.length === 0 ? <p className="muted">{t('prod.noHistory')}</p> : (
                  <ul className="history">
                    {(history.data?.items ?? []).map((m) => (
                      <li key={m.id}>
                        <MovementBadge type={m.type} />
                        <div style={{ minWidth: 0 }}>
                          <div>{m.party ?? m.note ?? '—'}</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>{fmt.dateTime(m.occurredAt)}{t('common.sep')}{m.createdBy}</div>
                        </div>
                        <div style={{ textAlign: 'end' }}>
                          <QtyChange type={m.type} value={m.quantityChange} />
                          <div className="muted" style={{ fontSize: 12.5 }}>{t('prod.balance', { n: fmt.int(m.balanceAfter) })}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      {recording && p && <MovementForm productId={p.id} onClose={() => setRecording(false)} />}
      {confirm && p && (
        <ConfirmDialog
          title={t('prod.archiveTitle')}
          text={t('prod.archiveText', { name: p.name })}
          confirmLabel={t('prod.archiveConfirm')}
          danger
          busy={archive.isPending}
          onConfirm={() => archive.mutate()}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [categoryId, setCategoryId] = useState(0);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const status = params.get('status') ?? '';

  useEffect(() => setPage(1), [q, categoryId, status, sort, archived]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') });
  const list = useQuery({
    queryKey: ['products', { q, categoryId, status, sort, page, archived }],
    queryFn: () => api.get<Paged<Product>>('/api/products', {
      search: q, categoryId: categoryId || undefined, status, sort, page, pageSize: 15, includeInactive: archived,
    }),
    placeholderData: keepPreviousData,
  });

  const sortBy = (key: string) => setSort((s) => (s === key ? `-${key}` : key));
  const SortTh = ({ k, children, end }: { k: string; children: React.ReactNode; end?: boolean }) => (
    <th className={end ? 'end' : undefined} aria-sort={sort === k ? 'ascending' : sort === `-${k}` ? 'descending' : 'none'}>
      <button onClick={() => sortBy(k)}>{children}<ArrowDownUp size={12} opacity={sort.replace('-', '') === k ? 1 : 0.35} /></button>
    </th>
  );

  return (
    <>
      <PageHead
        title={t('prod.title')}
        subtitle={list.data ? t('prod.count', { n: fmt.int(list.data.total) }) : ' '}
        actions={can(P.productsManage) && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> {t('prod.new')}</button>
        )}
      />

      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" type="search" placeholder={t('prod.search')} value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label={t('prod.searchAria')} />
          </div>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} aria-label={t('prod.category')}>
            <option value={0}>{t('prod.allCategories')}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="segmented" role="group" aria-label={t('prod.stockStatus')}>
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} aria-pressed={status === f.key}
                onClick={() => setParams(f.key ? { status: f.key } : {}, { replace: true })}>{t(f.label)}</button>
            ))}
          </div>
          <label className="switch" style={{ marginInlineStart: 'auto', fontSize: 14 }}>
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {t('prod.showArchived')}
          </label>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <SortTh k="sku">{t('prod.col.sku')}</SortTh>
                <SortTh k="name">{t('prod.col.product')}</SortTh>
                <th>{t('prod.col.location')}</th>
                <SortTh k="quantity">{t('prod.col.stock')}</SortTh>
                <th className="end">{t('prod.col.prices')}</th>
                <SortTh k="value" end>{t('prod.col.value')}</SortTh>
                <th>{t('prod.col.status')}</th>
              </tr>
            </thead>
            {list.isLoading ? <SkeletonRows cols={7} /> : (
              <tbody>
                {list.data?.items.map((p) => (
                  <tr key={p.id} className={`clickable ${p.isActive ? '' : 'inactive'}`} onClick={() => setOpenId(p.id)}
                    tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(p.id)} aria-label={t('prod.details', { name: p.name })}>
                    <td><ShelfLabel sku={p.sku} muted={!p.isActive} /></td>
                    <td>
                      <div className="cell-title">{p.name}</div>
                      <div className="cell-sub">{p.categoryName}</div>
                    </td>
                    <td><Bin location={p.location} /></td>
                    <td style={{ minWidth: 160 }}><StockGauge quantity={p.quantity} reorderLevel={p.reorderLevel} unit={p.unit} compact /></td>
                    <td className="end">
                      <span className="num">{fmt.money(p.costPrice)}</span>
                      <div className="cell-sub"><span className="num">{fmt.money(p.salePrice)}</span></div>
                    </td>
                    <td className="end"><span className="num">{fmt.moneyRound(p.stockValue)}</span></td>
                    <td><StatusBadge status={p.status} active={p.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        {list.isError && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data?.total === 0 && (
          <EmptyState
            title={q || categoryId || status ? t('prod.noMatch') : t('prod.empty')}
            text={q || categoryId || status ? t('prod.noMatchText') : t('prod.emptyText')}
            action={!q && !categoryId && !status && can(P.productsManage)
              ? <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> {t('prod.new')}</button> : undefined}
          />
        )}
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        )}
      </section>

      {openId !== null && !editing && (
        <ProductDetail id={openId} onClose={() => setOpenId(null)} onEdit={(p) => setEditing(p)} />
      )}
      {editing && <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
