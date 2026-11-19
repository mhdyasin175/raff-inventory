import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Plus, Search } from 'lucide-react';
import { api, download, tzOffset } from '../api/client';
import type { Movement, MovementType, Paged } from '../api/types';
import { P, useAuth } from '../auth/AuthContext';
import { useWarehouse } from '../auth/WarehouseContext';
import { PageHead } from '../components/Layout';
import MovementForm, { canRecordMovements } from '../components/MovementForm';
import { MovementBadge, QtyChange, WarehouseChip } from '../components/inventory';
import { EmptyState, ErrorState, Pagination, SkeletonRows, useToast } from '../components/ui';
import { daysAgo, fmt, toDayString } from '../lib/format';
import { t, type TKey } from '../i18n';

type TypeFilter = '' | 'In' | 'Out' | 'Adjustment' | 'Transfer';
const TYPES: { key: TypeFilter; label: TKey }[] = [
  { key: '', label: 'common.all' },
  { key: 'In', label: 'type.In' },
  { key: 'Out', label: 'type.Out' },
  { key: 'Adjustment', label: 'type.Adjustment' },
  { key: 'Transfer', label: 'type.Transfer' },
];

export default function MovementsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [type, setType] = useState<TypeFilter>('');
  const wh = useWarehouse();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(toDayString(new Date()));
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState<MovementType | true | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => setPage(1), [type, from, to, q, wh.param]);

  const filter = { type: type || undefined, from, to, search: q, tz: tzOffset(), warehouseId: wh.param };
  const list = useQuery({
    queryKey: ['movements', { ...filter, page }],
    queryFn: () => api.get<Paged<Movement>>('/api/movements', { ...filter, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      await download('/api/movements/export', filter, `${t('mv.fileName')}-${from}-${to}.csv`);
      toast(t('common.exported'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.exportFailed'), 'error');
    } finally { setExporting(false); }
  }

  return (
    <>
      <PageHead
        title={t('mv.title')}
        subtitle={t('mv.subtitle')}
        actions={
          <>
            {can(P.reports) && (
              <button className="btn" onClick={exportCsv} disabled={exporting}><Download size={17} /> {exporting ? t('common.exporting') : t('mv.export')}</button>
            )}
            {canRecordMovements(can) && (
              <button className="btn btn-primary" onClick={() => setRecording(true)}><Plus size={18} /> {t('dash.record')}</button>
            )}
          </>
        }
      />

      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" type="search" placeholder={t('mv.search')} value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label={t('mv.searchAria')} />
          </div>
          <div className="segmented" role="group" aria-label={t('mf.type')}>
            {TYPES.map((x) => <button key={x.key} aria-pressed={type === x.key} onClick={() => setType(x.key)}>{t(x.label)}</button>)}
          </div>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span>{t('common.from')}</span>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span>{t('common.to')}</span>
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          </label>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('mv.col.date')}</th>
                {!wh.param && <th>{t('mv.col.warehouse')}</th>}
                <th>{t('mv.col.type')}</th>
                <th>{t('mv.col.product')}</th>
                <th className="end">{t('mv.col.qty')}</th>
                <th className="end">{t('mv.col.balance')}</th>
                <th className="end">{t('mv.col.value')}</th>
                <th>{t('mv.col.party')}</th>
                <th>{t('mv.col.by')}</th>
              </tr>
            </thead>
            {list.isLoading ? <SkeletonRows cols={wh.param ? 8 : 9} /> : (
              <tbody>
                {list.data?.items.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fmt.shortDate(new Date(m.occurredAt))}
                      <div className="cell-sub">{fmt.time(m.occurredAt)}</div>
                    </td>
                    {!wh.param && <td><WarehouseChip code={m.warehouseCode} title={m.warehouseName} /></td>}
                    <td><MovementBadge type={m.type} /></td>
                    <td>
                      <div className="cell-title">{m.productName}</div>
                      <div className="cell-sub"><span className="num">{m.sku}</span></div>
                    </td>
                    <td className="end" style={{ whiteSpace: 'nowrap' }}>
                      <QtyChange type={m.type} value={m.quantityChange} /> <span className="cell-sub">{m.unit}</span>
                    </td>
                    <td className="end"><span className="num">{fmt.int(m.balanceAfter)}</span></td>
                    <td className="end">
                      <span className="num">{fmt.money(m.total)}</span>
                      <div className="cell-sub">{t('mv.perUnit', { p: fmt.money(m.unitPrice) })}</div>
                    </td>
                    <td>
                      <div>{m.counterpartWarehouseCode
                        ? t(m.type === 'TransferOut' ? 'mv.transferTo' : 'mv.transferFrom', { code: m.counterpartWarehouseCode })
                        : m.party ?? m.note ?? '—'}</div>
                      {m.reference && <div className="cell-sub"><span className="num">{m.reference}</span></div>}
                    </td>
                    <td className="cell-sub">{m.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        {list.isError && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data?.total === 0 && (
          <EmptyState title={t('mv.empty')} text={t('mv.emptyText')} />
        )}
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        )}
      </section>

      {recording && <MovementForm initialType={recording === true ? undefined : recording} onClose={() => setRecording(null)} />}
    </>
  );
}
