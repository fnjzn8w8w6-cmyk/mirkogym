import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTonnage } from '@/lib/analytics';
import { chart, TooltipShell } from './chart-theme';

export function TonnageChart({ data }: { data: { label: string; tonnage: number; sessions: number }[] }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="tonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={chart.accent} stopOpacity={0.3} />
              <stop offset="1" stopColor={chart.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} />
          <YAxis
            tick={chart.tick}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}t` : String(v))}
          />
          <Tooltip
            cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { label: string; tonnage: number; sessions: number } | undefined;
              if (!active || !p) return null;
              return (
                <TooltipShell
                  title={`Settimana del ${p.label}`}
                  rows={[
                    { label: 'Tonnellaggio', value: formatTonnage(p.tonnage), color: chart.accent },
                    { label: 'Sessioni', value: String(p.sessions) },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="tonnage"
            stroke={chart.accent}
            strokeWidth={2}
            fill="url(#tonFill)"
            dot={{ r: 4, fill: chart.accent, stroke: chart.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
