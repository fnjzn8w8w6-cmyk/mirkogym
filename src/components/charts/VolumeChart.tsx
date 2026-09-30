import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTonnage, groupColor } from '@/lib/analytics';
import { chart, Legend, sortGroups, TooltipShell } from './chart-theme';

const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}t` : String(v));

interface SimpleBarProps {
  data: { label: string; value: number; title?: string }[];
  valueLabel: string;
}

/** Barre a serie singola (es. volume per sessione). */
export function VolumeChart({ data, valueLabel }: SimpleBarProps) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={chart.tick} axisLine={false} tickLine={false} tickFormatter={compact} width={44} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as SimpleBarProps['data'][number] | undefined;
              if (!active || !p) return null;
              return <TooltipShell title={p.title ?? p.label} rows={[{ label: valueLabel, value: formatTonnage(p.value), color: chart.accent }]} />;
            }}
          />
          <Bar dataKey="value" fill={chart.accent} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface StackedProps {
  data: Record<string, number | string | Date>[];
  groups: string[];
}

/** Volume settimanale impilato per gruppo muscolare. */
export function GroupVolumeChart({ data, groups }: StackedProps) {
  const ordered = sortGroups(groups);
  return (
    <div>
      <Legend items={ordered.map((g) => ({ label: g, color: groupColor(g) }))} />
      <div className="mt-2 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} />
            <YAxis tick={chart.tick} axisLine={false} tickLine={false} tickFormatter={compact} width={44} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = ordered
                  .map((g) => ({ g, v: Number(payload[0].payload[g] ?? 0) }))
                  .filter((r) => r.v > 0)
                  .reverse()
                  .map((r) => ({ label: r.g, value: formatTonnage(r.v), color: groupColor(r.g) }));
                if (!rows.length) return <TooltipShell title={`Settimana del ${String(label)}`} rows={[{ label: 'Volume', value: '—' }]} />;
                return <TooltipShell title={`Settimana del ${String(label)}`} rows={rows} />;
              }}
            />
            {ordered.map((g, i) => (
              <Bar
                key={g}
                dataKey={g}
                stackId="v"
                fill={groupColor(g)}
                stroke={chart.surface}
                strokeWidth={2}
                radius={i === ordered.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={32}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
