import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayMonth, formatShortDate } from '@/lib/date-utils';
import { formatKg } from '@/lib/analytics';
import { chart, Legend, TooltipShell } from './chart-theme';

export interface WeightPoint {
  t: number;
  value: number;
  trend: number;
}

/** Valori giornalieri (punti) + media mobile 7 giorni (linea). */
export function WeightChart({ data, unit, label }: { data: WeightPoint[]; unit: string; label: string }) {
  return (
    <div>
      <Legend
        items={[
          { label, color: chart.accentSoft },
          { label: 'Media 7 giorni', color: chart.accent },
        ]}
      />
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
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
                      { label, value: `${formatKg(p.value)}${unit}`, color: chart.accentSoft },
                      { label: 'Media 7gg', value: `${formatKg(p.trend)}${unit}`, color: chart.accent },
                    ]}
                  />
                );
              }}
            />
            {/* Misure giornaliere: solo punti (≥8px) — la linea è la media mobile */}
            <Line
              dataKey="value"
              stroke="none"
              dot={{ r: 4, fill: chart.accentSoft, stroke: chart.surface, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: chart.accent, stroke: chart.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="trend" stroke={chart.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
