import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../api/types';
import { fmt, parseDay } from '../lib/format';
import { useChartColors } from '../lib/chartColors';
import { t } from '../i18n';

/**
 * Diverging daily bars: stock coming in rises above the line, stock going out hangs below it.
 * In Arabic the time axis is mirrored so the newest day sits on the left.
 */
export default function FlowChart({ data, metric, height = 280 }: {
  data: TrendPoint[]; metric: 'units' | 'value'; height?: number;
}) {
  const c = useChartColors();
  const rows = data.map((d) => ({
    date: d.date,
    in: metric === 'units' ? d.unitsIn : d.valueIn,
    out: -(metric === 'units' ? d.unitsOut : d.valueOut),
  }));
  const f = metric === 'units' ? fmt.int : fmt.compactMoney;
  const light = c.theme === 'shadcn';

  return (
    <div dir="ltr" style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="date"
            reversed={c.rtl}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            tick={{ fontSize: 12, fill: c.axis, fontFamily: c.font }}
            tickFormatter={(d: string) => fmt.shortDate(d)}
          />
          <YAxis
            orientation={c.rtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 12, fill: c.axis }}
            tickFormatter={(v: number) => f(Math.abs(v))}
          />
          <ReferenceLine y={0} stroke={c.zero} strokeWidth={1.5} />
          <Tooltip
            cursor={{ fill: 'rgba(24,32,29,0.05)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof rows)[number];
              return (
                <div dir={c.rtl ? 'rtl' : 'ltr'} style={{
                  background: c.tipBg, color: light ? '#09090b' : '#fff', padding: '8px 12px', borderRadius: light ? 8 : 4,
                  fontSize: 13, lineHeight: 1.7, border: light ? '1px solid #e4e4e7' : 0,
                  boxShadow: light ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                }}>
                  <div style={{ color: c.tipMuted }}>{fmt.date(parseDay(String(label)).toISOString())}</div>
                  <div>{t('chart.in', { v: f(p.in) })}</div>
                  <div>{t('chart.out', { v: f(-p.out) })}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="in" stackId="flow" fill={c.in} radius={light ? [4, 4, 0, 0] : [2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="out" stackId="flow" fill={c.out} radius={light ? [0, 0, 4, 4] : [0, 0, 2, 2]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
