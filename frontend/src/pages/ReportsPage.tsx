import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeftRight, Coins, Download, PiggyBank, ShoppingCart } from 'lucide-react';
import { api, download, tzOffset } from '../api/client';
import type { CategoryValuePoint, RangeSummary, TopProductPoint, TrendPoint } from '../api/types';
import { PageHead } from '../components/Layout';
import FlowChart from '../components/FlowChart';
import { EmptyState, ErrorState, useToast } from '../components/ui';
import { daysAgo, fmt, toDayString } from '../lib/format';
import { useChartColors } from '../lib/chartColors';
import { useWarehouse } from '../auth/WarehouseContext';
import { t, type TKey } from '../i18n';

const PRESETS: { key: string; label: TKey; from: () => string }[] = [
  { key: '30', label: 'rep.last30', from: () => daysAgo(29) },
  { key: '90', label: 'rep.last90', from: () => daysAgo(89) },
  { key: 'month', label: 'rep.thisMonth', from: () => { const d = new Date(); d.setDate(1); return toDayString(d); } },
];

function HBar({ data, valueKey, label, format, accent }: {
  data: Record<string, any>[]; valueKey: string; label: string; format: (n: number) => string; accent: 'out' | 'highlight';
}) {
  const c = useChartColors();
  const light = c.theme === 'shadcn';
  return (
    <div dir="ltr" style={{ width: '100%', height: Math.max(180, data.length * 34) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide reversed={c.rtl} />
          <YAxis type="category" dataKey={label} orientation={c.rtl ? 'right' : 'left'} width={190} tickLine={false} axisLine={false}
            tick={{ fontSize: 13, fill: c.label, fontFamily: c.font }} />
          <Tooltip
            cursor={{ fill: 'rgba(24,32,29,0.05)' }}
            content={({ active, payload }) => active && payload?.length ? (
              <div style={{ background: c.tipBg, color: light ? '#09090b' : '#fff', padding: '6px 10px', borderRadius: light ? 8 : 4, fontSize: 13, border: light ? '1px solid #e4e4e7' : 0 }}>
                <strong className="num">{format(Number(payload[0].value))}</strong>
              </div>
            ) : null}
          />
          <Bar dataKey={valueKey} radius={light ? 4 : (c.rtl ? [2, 0, 0, 2] : [0, 2, 2, 0])} isAnimationActive={false}
            label={{ position: c.rtl ? 'insideLeft' : 'insideRight', fill: '#fff', fontSize: 12, formatter: (v: unknown) => format(Number(v)) }}>
            {data.map((_, i) => <Cell key={i} fill={i === 0 ? c[accent] : light ? '#52525b' : c.bar} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(toDayString(new Date()));
  const [by, setBy] = useState<'revenue' | 'units'>('revenue');
  const wh = useWarehouse();
  const range = { from, to, tz: tzOffset(), warehouseId: wh.param };

  const summary = useQuery({ queryKey: ['reports', 'summary', range], queryFn: () => api.get<RangeSummary>('/api/reports/summary', range) });
  const trend = useQuery({ queryKey: ['reports', 'trend', range], queryFn: () => api.get<TrendPoint[]>('/api/reports/trend', range) });
  const top = useQuery({ queryKey: ['reports', 'top', range, by], queryFn: () => api.get<TopProductPoint[]>('/api/reports/top-products', { ...range, by, take: 8 }) });
  const cats = useQuery({ queryKey: ['reports', 'categories', wh.param], queryFn: () => api.get<CategoryValuePoint[]>('/api/reports/category-value', { warehouseId: wh.param }) });

  function applyPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key)!;
    setPreset(key); setFrom(p.from()); setTo(toDayString(new Date()));
  }

  async function exportCsv() {
    try { await download('/api/movements/export', range, `${t('rep.fileName')}-${from}-${to}.csv`); toast(t('common.exported')); }
    catch (e) { toast(e instanceof Error ? e.message : t('common.exportFailed'), 'error'); }
  }

  const s = summary.data;
  const marginPct = s && s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : null;

  return (
    <>
      <PageHead
        title={t('rep.title')}
        subtitle={`${t('rep.subtitle')} ${wh.selected?.name ?? t('wh.all')}.`}
        actions={<button className="btn" onClick={exportCsv}><Download size={17} /> {t('rep.export')}</button>}
      />

      <div className="range-bar">
        <div className="segmented" role="group" aria-label={t('dash.period')}>
          {PRESETS.map((p) => <button key={p.key} aria-pressed={preset === p.key} onClick={() => applyPreset(p.key)}>{t(p.label)}</button>)}
        </div>
        <label className="field"><span>{t('common.from')}</span>
          <input className="input" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset(''); }} />
        </label>
        <label className="field"><span>{t('common.to')}</span>
          <input className="input" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPreset(''); }} />
        </label>
      </div>

      <section className="ledger" aria-label={t('rep.summary')}>
        <div className="ledger-cell">
          <Coins className="ledger-icon" aria-hidden="true" />
          <div className="label">{t('rep.sales')}</div>
          <div className="value num">{s ? fmt.moneyRound(s.revenue) : '—'}</div>
          <div className="foot">{t('rep.unitsOut', { n: s ? fmt.int(s.unitsOut) : '—' })}</div>
        </div>
        <div className="ledger-cell">
          <PiggyBank className="ledger-icon" aria-hidden="true" />
          <div className="label">{t('rep.profit')}</div>
          <div className="value num">{s ? fmt.moneyRound(s.grossProfit) : '—'}</div>
          <div className="foot">{marginPct !== null ? t('rep.margin', { p: `${marginPct.toFixed(1)}%` }) : t('rep.noSales')}</div>
        </div>
        <div className="ledger-cell">
          <ShoppingCart className="ledger-icon" aria-hidden="true" />
          <div className="label">{t('rep.purchases')}</div>
          <div className="value num">{s ? fmt.moneyRound(s.purchasesValue) : '—'}</div>
          <div className="foot">{t('rep.unitsIn', { n: s ? fmt.int(s.unitsIn) : '—' })}</div>
        </div>
        <div className="ledger-cell">
          <ArrowLeftRight className="ledger-icon" aria-hidden="true" />
          <div className="label">{t('rep.moves')}</div>
          <div className="value num">{s ? fmt.int(s.movements) : '—'}</div>
          <div className="foot">{t('rep.movesFoot')}</div>
        </div>
      </section>

      <div className="report-grid">
        <section className="panel wide">
          <div className="panel-head">
            <h2>{t('rep.daily')}</h2>
            <div className="chart-legend">
              <span><i style={{ background: 'var(--in)' }} />{t('rep.legendIn')}</span>
              <span><i style={{ background: 'var(--out)' }} />{t('rep.legendOut')}</span>
            </div>
          </div>
          <div className="panel-body">
            {trend.isError ? <ErrorState error={trend.error} onRetry={trend.refetch} />
              : trend.data ? <FlowChart data={trend.data} metric="value" height={300} />
              : <div className="skeleton" style={{ height: 300 }} />}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('rep.top')}</h2>
            <div className="segmented" role="group" aria-label={t('rep.sortBy')}>
              <button aria-pressed={by === 'revenue'} onClick={() => setBy('revenue')}>{t('rep.byValue')}</button>
              <button aria-pressed={by === 'units'} onClick={() => setBy('units')}>{t('rep.byQty')}</button>
            </div>
          </div>
          <div className="panel-body">
            {top.isError ? <ErrorState error={top.error} onRetry={top.refetch} />
              : top.data?.length === 0 ? <EmptyState title={t('rep.noSalesTitle')} />
              : top.data ? <HBar data={top.data} valueKey={by === 'revenue' ? 'revenue' : 'unitsOut'} label="name"
                  format={by === 'revenue' ? fmt.moneyRound : fmt.int} accent="out" />
              : <div className="skeleton" style={{ height: 260 }} />}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('rep.catValue')}</h2>
          </div>
          <div className="panel-body">
            {cats.isError ? <ErrorState error={cats.error} onRetry={cats.refetch} />
              : cats.data ? <HBar data={cats.data} valueKey="stockValue" label="category" format={fmt.moneyRound} accent="highlight" />
              : <div className="skeleton" style={{ height: 260 }} />}
          </div>
        </section>
      </div>
    </>
  );
}
