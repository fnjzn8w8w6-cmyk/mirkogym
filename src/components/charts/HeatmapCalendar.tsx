import { useMemo, useState } from 'react';
import { addDays, subDays } from 'date-fns';
import { formatShortDate, toISODate, weekStart } from '@/lib/date-utils';

const CELL = 14;
const GAP = 3;
const DAY_LABELS = ['L', '', 'M', '', 'V', '', 'D'];

/** Heatmap frequenza allenamenti (ultimi `days` giorni), colonne = settimane. */
export function HeatmapCalendar({ counts, days = 90 }: { counts: Map<string, number>; days?: number }) {
  const [hover, setHover] = useState<{ date: Date; count: number } | null>(null);
  const { cols, total } = useMemo(() => {
    const end = new Date();
    const start = weekStart(subDays(end, days - 1));
    const cols: { date: Date; count: number; inRange: boolean }[][] = [];
    let total = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dow = (d.getDay() + 6) % 7;
      if (dow === 0) cols.push([]);
      const count = counts.get(toISODate(d)) ?? 0;
      const inRange = d >= subDays(end, days - 1);
      if (inRange) total += count ? 1 : 0;
      cols[cols.length - 1].push({ date: d, count, inRange });
    }
    return { cols, total };
  }, [counts, days]);

  const width = 16 + cols.length * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  return (
    <div>
      <div className="overflow-x-auto no-scrollbar">
        <svg width={width} height={height} role="img" aria-label={`${total} giorni di allenamento negli ultimi ${days} giorni`}>
          {DAY_LABELS.map((l, i) =>
            l ? (
              <text key={i} x={0} y={i * (CELL + GAP) + CELL - 3} fontSize={10} fontWeight={600} fill="#7D8781">
                {l}
              </text>
            ) : null,
          )}
          {cols.map((col, ci) =>
            col.map((c, ri) => (
              <rect
                key={`${ci}-${ri}`}
                x={16 + ci * (CELL + GAP)}
                y={ri * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                fill={!c.inRange ? 'transparent' : c.count ? (c.count > 1 ? '#1FD86A' : '#3DDC84') : '#2A2A2F'}
                stroke={hover?.date.getTime() === c.date.getTime() ? '#FAFAFA' : 'none'}
                strokeWidth={1.5}
                onMouseEnter={() => c.inRange && setHover(c)}
                onClick={() => c.inRange && setHover(c)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${formatShortDate(c.date)}: ${c.count ? `${c.count} sessione${c.count > 1 ? 'i' : ''}` : 'riposo'}`}</title>
              </rect>
            )),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-fg-3">
        <span>
          {hover
            ? `${formatShortDate(hover.date)} · ${hover.count ? `${hover.count} sessione${hover.count > 1 ? 'i' : ''}` : 'riposo'}`
            : `${total} giorni di allenamento`}
        </span>
        <span className="flex items-center gap-1.5">
          Riposo
          <span className="h-3 w-3 rounded-sm bg-surface-3" aria-hidden />
          <span className="h-3 w-3 rounded-sm bg-accent-500" aria-hidden />
          Allenamento
        </span>
      </div>
    </div>
  );
}
