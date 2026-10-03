import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayMonth, formatShortDate } from '@/lib/date-utils';
import { formatKg } from '@/lib/analytics';
import { chart, Legend, TooltipShell } from './chart-theme';

export interface WeightPoint {
  t: number;
  value?: number;
  trend?: number;
  /** percorso previsto dall'obiettivo (linea tratteggiata) */
  plan?: number;
  /** pesata gonfiata da acqua/glicogeno */
  water?: boolean;
}

/** Valori giornalieri (punti) + media mobile 7 giorni (linea). */
export function WeightChart({ data, unit, label, plan }: { data: WeightPoint[]; unit: string; label: string; plan?: { t: number; plan: number }[] }) {
  const rows: WeightPoint[] = plan?.length ? [...data, ...plan].sort((a, b) => a.t - b.t) : data;
  return (
    <div>
      <Legend
        items={[
          { label, color: chart.accentSoft },
          { label: unit.trim() === 'kg' ? 'Peso reale' : 'Media 7 giorni', color: chart.accent },
          ...(data.some((d) => d.water) ? [{ label: 'Acqua', color: '#38BDF8' }] : []),
          ...(plan?.length ? [{ label: 'Percorso obiettivo', color: '#C084FC' }] : []),
        ]}
      />
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(d: number) => formatDayMonth(d)}
              tick={chart.tick}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={chart.tick}
              axisLine={false}
              tickLine={false}
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as WeightPoint | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipShell
                    title={formatShortDate(p.t)}
                    rows={[
                      ...(p.value != null ? [{ label, value: `${formatKg(p.value)}${unit}`, color: chart.accentSoft }] : []),
                      ...(p.trend != null ? [{ label: unit.trim() === 'kg' ? 'Peso reale' : 'Media 7gg', value: `${formatKg(p.trend)}${unit}`, color: chart.accent }] : []),
                      ...(p.plan != null ? [{ label: 'Obiettivo', value: `${formatKg(p.plan)}${unit}`, color: '#C084FC' }] : []),
                    ]}
                  />
                );
              }}
            />
            {/* Misure giornaliere: solo punti (≥8px) — la linea è la media mobile */}
            <Line
              dataKey="value"
              stroke="none"
              dot={(props: { cx?: number; cy?: number; payload?: WeightPoint; index?: number }) =>
                props.cx == null || props.cy == null || props.payload?.value == null ? (
                  <g key={`d${props.index}`} />
                ) : (
                  <circle
                    key={`d${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.payload.water ? 5 : 4}
                    fill={props.payload.water ? '#38BDF8' : chart.accentSoft}
                    stroke={chart.surface}
                    strokeWidth={2}
                  />
                )
              }
              activeDot={{ r: 6, fill: chart.accent, stroke: chart.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="trend" stroke={chart.accent} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            {plan?.length ? (
              <Line type="linear" dataKey="plan" stroke="#C084FC" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: '#C084FC', strokeWidth: 0 }} connectNulls isAnimationActive={false} />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
