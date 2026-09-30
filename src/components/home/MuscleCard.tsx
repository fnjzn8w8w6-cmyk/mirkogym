import { useMemo } from 'react';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { formatTonnage, groupColor, muscleStatus, weekSummary } from '@/lib/analytics';
import { sortGroups } from '@/components/charts/chart-theme';
import { Card } from '../ui/Card';
import { cn } from '@/lib/cn';

/** Riepilogo settimana + serie per muscolo vs obiettivo (volume landmarks) + recupero. */
export function WeekCard() {
  const { sessions, groupOf } = useSessions();
  const { days } = useSchedule();
  const { settings } = useSettings();
  const groups = useMemo(() => sortGroups([...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))]), [days]);
  const status = useMemo(() => muscleStatus(sessions, groupOf, groups), [sessions, groupOf, groups]);
  const week = useMemo(() => weekSummary(sessions), [sessions]);
  const { weeklySetsMin: min, weeklySetsMax: max } = settings;
  const scaleMax = Math.max(max + 4, ...status.map((m) => m.weekSets));
  const delta = week.prevVolume > 0 ? Math.round(((week.volume - week.prevVolume) / week.prevVolume) * 100) : null;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="section-title !mb-0">Questa settimana</h2>
        {delta != null && (
          <span className={cn('text-sm font-semibold', delta >= 0 ? 'text-success' : 'text-fg-3')}>
            {delta >= 0 ? '+' : ''}
            {delta}% volume vs sett. scorsa
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Sessioni" value={String(week.sessions)} />
        <Mini label="Serie" value={String(week.sets)} />
        <Mini label="Volume" value={formatTonnage(week.volume)} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-wide text-fg-3">
        <span>Serie per muscolo</span>
        <span>
          obiettivo {min}–{max} · recupero
        </span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {status.map((m) => {
          const pct = (v: number) => `${(v / scaleMax) * 100}%`;
          const state = m.weekSets >= max ? 'over' : m.weekSets >= min ? 'ok' : 'under';
          const rec = Math.round(m.recovery * 100);
          return (
            <li key={m.group} className="grid grid-cols-[76px_1fr_32px_52px] items-center gap-2">
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-fg">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: groupColor(m.group) }} aria-hidden />
                {m.group}
              </span>
              <span
                className="relative h-2.5 overflow-hidden rounded-full bg-surface-3"
                role="img"
                aria-label={`${m.group}: ${m.weekSets} serie, obiettivo ${min}-${max}`}
              >
                {/* fascia obiettivo */}
                <span className="absolute inset-y-0 bg-success/20" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: pct(Math.min(m.weekSets, scaleMax)), backgroundColor: groupColor(m.group) }}
                />
              </span>
              <span
                className={cn(
                  'text-right text-sm font-bold',
                  state === 'ok' ? 'text-success' : state === 'over' ? 'text-warning' : 'text-fg-2',
                )}
              >
                {m.weekSets}
              </span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-center text-xs',
                  m.lastTrained == null
                    ? 'bg-surface-2 text-fg-3'
                    : rec >= 100
                      ? 'bg-success-bg text-success'
                      : rec >= 60
                        ? 'bg-warning-bg text-warning'
                        : 'bg-danger-bg text-danger',
                )}
                title={m.hoursSince != null ? `Allenato ${Math.round(m.hoursSince)} ore fa` : 'Mai allenato'}
              >
                {m.lastTrained == null ? '—' : rec >= 100 ? 'Pronto' : `${rec}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 py-2">
      <div className="text-xl text-fg">{value}</div>
      <div className="text-xs uppercase text-fg-3">{label}</div>
    </div>
  );
}
