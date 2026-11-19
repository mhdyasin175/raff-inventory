import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackageMinus, Plus, TrendingUp, Warehouse } from 'lucide-react';
import { api, tzOffset } from '../api/client';
import type { Category, DashboardSummary, LowStockItem, Movement, TrendPoint } from '../api/types';
import { P, useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/Layout';
import FlowChart from '../components/FlowChart';
import MovementForm, { canRecordMovements } from '../components/MovementForm';
import { MovementIcon, QtyChange, StockGauge } from '../components/inventory';
import { EmptyState, ErrorState } from '../components/ui';
import { fmt, greeting, relativeTime } from '../lib/format';
import { t } from '../i18n';

function Ledger({ s }: { s: DashboardSummary }) {
  const change = fmt.percentChange(s.salesLast30, s.salesPrev30);
  const attention = s.lowStockCount + s.outOfStockCount;
  return (
    <section className="ledger" aria-label={t('dash.summary')}>
      <div className="ledger-cell">
        <Warehouse className="ledger-icon" aria-hidden="true" />
        <div className="label">{t('dash.stockCost')}</div>
        <div className="value num">{fmt.moneyRound(s.stockValueCost)}</div>
        <div className="foot">{t('dash.atSale', { v: fmt.moneyRound(s.stockValueSale) })}</div>
      </div>
      <div className="ledger-cell">
        <TrendingUp className="ledger-icon" aria-hidden="true" />
        <div className="label">{t('dash.sales30')}</div>
        <div className="value num">{fmt.moneyRound(s.salesLast30)}</div>
        <div className="foot">
          {change === null ? t('dash.noPrev') : (
            <><span className={change >= 0 ? 'up' : 'down'}><span className="num">{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%</span></span> {t('dash.vsPrev')}</>
          )}
        </div>
      </div>
      <div className="ledger-cell">
        <PackageMinus className="ledger-icon" aria-hidden="true" />
        <div className="label">{t('dash.unitsOut30')}</div>
        <div className="value num">{fmt.int(s.unitsOutLast30)}</div>
        <div className="foot">{t('dash.unitsInToday', { units: fmt.int(s.unitsInLast30), today: fmt.int(s.movementsToday) })}</div>
      </div>
      <div className={`ledger-cell ${attention > 0 ? 'alert' : ''}`}>
        <AlertTriangle className="ledger-icon" aria-hidden="true" />
        <div className="label">{t('dash.needReorder')}</div>
        <div className="value num">{fmt.int(attention)}<span className="muted" style={{ fontSize: 16, fontWeight: 500 }}> / {fmt.int(s.activeProducts)}</span></div>
        <div className="foot">
          {s.outOfStockCount > 0 ? <span className="down">{t('dash.outCount', { n: s.outOfStockCount })}</span> : null}
          <Link to="/products?status=attention">{t('dash.viewList')}</Link>
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<'units' | 'value'>('units');
  const [recording, setRecording] = useState(false);
  const tz = tzOffset();

  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary', { tz }) });
  const trend = useQuery({ queryKey: ['dashboard', 'trend', days], queryFn: () => api.get<TrendPoint[]>('/api/dashboard/trend', { days, tz }) });
  const low = useQuery({ queryKey: ['dashboard', 'low'], queryFn: () => api.get<LowStockItem[]>('/api/dashboard/low-stock', { take: 7 }) });
  const recent = useQuery({ queryKey: ['dashboard', 'recent'], queryFn: () => api.get<Movement[]>('/api/dashboard/recent', { take: 7 }) });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories'), enabled: can(P.productsView) });

  const catMax = Math.max(1, ...(cats.data ?? []).map((c) => c.stockValue));
  const firstName = user?.fullName.split(' ')[0];

  return (
    <>
      <PageHead
        title={greeting(firstName ?? '')}
        crumb={t('nav.dashboard')}
        subtitle={fmt.today()}
        actions={canRecordMovements(can) && (
          <button className="btn btn-primary" onClick={() => setRecording(true)}><Plus size={18} /> {t('dash.record')}</button>
        )}
      />

      {summary.isError ? <div className="panel" style={{ marginBottom: 18 }}><ErrorState error={summary.error} onRetry={summary.refetch} /></div>
        : summary.data ? <Ledger s={summary.data} />
        : <div className="ledger skeleton" style={{ height: 118 }} />}

      <div className="dash-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head" style={{ flexWrap: 'wrap' }}>
              <h2>{t('dash.flow')}</h2>
              <div className="segmented" role="group" aria-label={t('dash.metric')}>
                <button aria-pressed={metric === 'units'} onClick={() => setMetric('units')}>{t('dash.byUnits')}</button>
                <button aria-pressed={metric === 'value'} onClick={() => setMetric('value')}>{t('dash.byValue')}</button>
              </div>
              <div className="segmented" role="group" aria-label={t('dash.period')}>
                {[30, 60, 90].map((d) => (
                  <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{t('dash.days', { n: d })}</button>
                ))}
              </div>
            </div>
            <div className="panel-body">
              <div className="chart-legend" style={{ marginBottom: 6 }}>
                <span><i style={{ background: 'var(--in)' }} />{t('dash.legendIn')}</span>
                <span><i style={{ background: 'var(--out)' }} />{t('dash.legendOut')}</span>
              </div>
              {trend.isError ? <ErrorState error={trend.error} onRetry={trend.refetch} />
                : trend.data ? <FlowChart data={trend.data} metric={metric} />
                : <div className="skeleton" style={{ height: 280 }} />}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('dash.recent')}</h2>
              {can(P.movementsView) && <Link to="/movements" className="btn btn-sm btn-ghost">{t('dash.fullLog')}</Link>}
            </div>
            {recent.isError ? <ErrorState error={recent.error} onRetry={recent.refetch} />
              : recent.data?.length === 0 ? <EmptyState title={t('dash.noMoves')} text={t('dash.noMovesText')} />
              : (
                <ul className="feed">
                  {(recent.data ?? []).map((m) => (
                    <li key={m.id}>
                      <MovementIcon type={m.type} />
                      <div style={{ minWidth: 0 }}>
                        <div className="cell-title">{m.productName}</div>
                        <div className="meta">
                          {relativeTime(m.occurredAt)}{t('common.sep')}{m.party ?? m.note ?? m.createdBy}
                        </div>
                      </div>
                      <div className="amount">
                        <QtyChange type={m.type} value={m.quantityChange} /> <span className="muted" style={{ fontSize: 13 }}>{m.unit}</span>
                        <div className="meta"><span className="num">{fmt.money(m.total)}</span></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>{t('dash.reorder')}</h2>
              {can(P.productsView) && <Link to="/products?status=attention" className="btn btn-sm btn-ghost">{t('dash.seeAll')}</Link>}
            </div>
            {low.isError ? <ErrorState error={low.error} onRetry={low.refetch} />
              : low.data?.length === 0 ? <EmptyState title={t('dash.allFull')} text={t('dash.allFullText')} />
              : (
                <ul className="reorder-list">
                  {(low.data ?? []).map((p) => (
                    <li key={p.productId}>
                      <span className="name">{p.name}</span>
                      <span className="bin">{p.location ?? p.sku}</span>
                      <StockGauge quantity={p.quantity} reorderLevel={p.reorderLevel} unit={p.unit} />
                    </li>
                  ))}
                </ul>
              )}
          </section>

          {can(P.productsView) && (
            <section className="panel">
              <div className="panel-head"><h2>{t('dash.byCategory')}</h2></div>
              <div className="panel-body">
                <div className="cat-bars">
                  {(cats.data ?? []).slice().sort((a, b) => b.stockValue - a.stockValue).map((c) => (
                    <div className="cat-bar-row" key={c.id}>
                      <span>{c.name}</span>
                      <span className="num">{fmt.moneyRound(c.stockValue)}</span>
                      <div className="cat-bar-track"><div className="cat-bar-fill" style={{ width: `${(c.stockValue / catMax) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {recording && <MovementForm onClose={() => setRecording(false)} />}
    </>
  );
}
