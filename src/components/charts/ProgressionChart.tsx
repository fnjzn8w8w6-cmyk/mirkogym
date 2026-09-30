import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayMonth, formatShortDate } from '@/lib/date-utils';
import { formatKg } from '@/lib/analytics';
import { chart, Legend, TooltipShell } from './chart-theme';

export interface ProgressionPoint {
  date: number;
  weight: number;
  reps: number;
  e1rm: number;
}

/** Progressione del top set (peso) e 1RM stimato — stessa unità (kg), un solo asse. */
export function ProgressionChart({ data }: { data: ProgressionPoint[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: 'Top set', color: chart.accent },
          { label: '1RM stimato', color: chart.secondary, dashed: true },
        ]}
      />
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: number) => formatDayMonth(d)} tick={chart.tick} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={chart.tick} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as ProgressionPoint | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipShell
                    title={formatShortDate(p.date)}
                    rows={[
                      { label: 'Top set', value: `${formatKg(p.weight, 2)}×${p.reps}`, color: chart.accent },
                      { label: '1RM stimato', value: `${p.e1rm} kg`, color: chart.secondary },
                    ]}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="e1rm" stroke={chart.secondary} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke={chart.accent}
              strokeWidth={2}
              dot={{ r: 4, fill: chart.accent, stroke: chart.surface, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: chart.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
