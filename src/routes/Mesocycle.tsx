import { useMemo, useState } from 'react';
import { ChevronDown, FastForward, Flag } from 'lucide-react';
import { useMesocycle, type MesoWeek, type WeekDayStatus } from '@/hooks/use-mesocycle';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { calculateSuggestion, previousLogsFor, progressionStep } from '@/lib/progression';
import { formatKg, groupColor, topSet } from '@/lib/analytics';
import { formatDayMonth, formatShortDate, fromISODate } from '@/lib/date-utils';
import { cn } from '@/lib/cn';
import type { Day, Exercise } from '@/types';

const STATUS: Record<WeekDayStatus, { icon: string; label: string; cls: string }> = {
  done: { icon: '✅', label: 'Fatto', cls: 'bg-success-bg border-success/30' },
  next: { icon: '🔵', label: 'Prossimo', cls: 'bg-info-bg border-info/40' },
  pending: { icon: '⚪', label: 'Da fare', cls: 'bg-surface-2 border-line-subtle' },
  missed: { icon: '🔴', label: 'Saltato', cls: 'bg-danger-bg border-danger/30' },
};

function dayStatuses(week: MesoWeek, days: Day[]): WeekDayStatus[] {
  let nextAssigned = false;
  return days.map((d) => {
    if (week.sessions.some((s) => s.dayId === d.id)) return 'done';
    if (week.isPast) return 'missed';
    if (week.isCurrent && !nextAssigned) {
      nextAssigned = true;
      return 'next';
    }
    return 'pending';
  });
}

export default function Mesocycle() {
  const meso = useMesocycle();
  const { days } = useSchedule();
  const { sessions } = useSessions();
  const { settings } = useSettings();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'end' | 'deload' | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(days[0]?.id ?? null);

  // Progressione prevista per ogni esercizio: settimane passate = reale, future = proiezione
  const projection = useMemo(() => {
    const pct = settings.deloadPercentage;
    const out = new Map<string, { value: number | null; actual: boolean; deload: boolean }[]>();
    for (const d of days) {
      for (const e of d.exercises) {
        const prev = previousLogsFor(e, sessions);
        const sugg = calculateSuggestion(e, prev, false, pct);
        const step = progressionStep(e);
        let running: number | null = null;
        const cells = meso.weeks.map((w) => {
          const log = [...prev].reverse().find((l) => l.date >= w.start.getTime() && l.date < w.end.getTime());
          if (log && (w.isPast || w.isCurrent)) {
            const t = topSet(log.sets);
            running = t?.weight ?? running;
            return { value: t?.weight ?? null, actual: true, deload: w.isDeload };
          }
          if (w.isPast) return { value: null, actual: false, deload: w.isDeload };
          if (w.isDeload) {
            const base = running ?? sugg.weight;
            return { value: base != null ? Math.round(base * (1 - pct / 100) * 4) / 4 : null, actual: false, deload: true };
          }
          running = running == null ? sugg.weight : running + step;
          return { value: running, actual: false, deload: false };
        });
        out.set(e.id, cells);
      }
    }
    return out;
  }, [days, sessions, meso.weeks, settings.deloadPercentage]);

  if (meso.loading || !meso.mesocycle) return <PageSkeleton />;

  return (
    <div>
      <TopBar title="Mesociclo" subtitle={`Iniziato il ${formatShortDate(fromISODate(meso.mesocycle.startDate))}`} large />
      <div className="page space-y-4 pt-4">
        <Card variant="elevated" className="p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-3xl text-fg">
              Settimana {meso.currentWeek}
              <span className="text-xl text-fg-3"> / {meso.totalWeeks}</span>
            </div>
            {meso.isDeloadWeek && <Chip tone="accent">DELOAD -{settings.deloadPercentage}%</Chip>}
          </div>
          <ProgressBar className="mt-4" value={meso.currentWeek / meso.totalWeeks} label="Avanzamento mesociclo" />
          <div className="mt-2 text-sm text-fg-3">
            {meso.isDeloadWeek
              ? 'Settimana di scarico: carichi ridotti, recupera e riparti più forte.'
              : `Deload tra ${meso.totalWeeks - meso.currentWeek} ${meso.totalWeeks - meso.currentWeek === 1 ? 'settimana' : 'settimane'}.`}
          </div>
        </Card>

        {/* Timeline */}
        <section>
          <h2 className="section-title">Timeline</h2>
          <ol className="space-y-2">
            {meso.weeks.map((w) => {
              const statuses = dayStatuses(w, days);
              return (
                <li
                  key={w.index}
                  className={cn(
                    'rounded-lg border p-3',
                    w.isDeload ? 'border-accent-500/40 bg-accent-glow' : 'border-line-subtle bg-surface',
                    w.isCurrent && 'ring-2 ring-accent-500/60',
                  )}
                  aria-current={w.isCurrent ? 'step' : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-fg">
                      Settimana {w.index}
                      <span className="ml-2 text-sm font-medium text-fg-3">
                        {formatDayMonth(w.start)} – {formatDayMonth(new Date(w.end.getTime() - 86400000))}
                      </span>
                    </div>
                    {w.isDeload && <span className="text-sm font-bold text-accent-400">DELOAD -{settings.deloadPercentage}%</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {days.map((d, i) => (
                      <div
                        key={d.id}
                        className={cn('flex flex-col items-center rounded-md border py-1.5', STATUS[statuses[i]].cls)}
                        title={`${d.name}: ${STATUS[statuses[i]].label}`}
                      >
                        <span className="text-base" aria-hidden>
                          {STATUS[statuses[i]].icon}
                        </span>
                        <span className="text-xs text-fg-2">
                          D{d.order}
                          <span className="sr-only">: {STATUS[statuses[i]].label}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-fg-3">
            {Object.values(STATUS).map((s) => (
              <span key={s.label}>
                {s.icon} {s.label}
              </span>
            ))}
          </div>
        </section>

        {/* Progressione prevista */}
        <section>
          <h2 className="section-title">Progressione prevista (top set, kg)</h2>
          <div className="space-y-2">
            {days.map((d) => {
              const open = openDay === d.id;
              return (
                <Card key={d.id} className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenDay(open ? null : d.id)}
                    className="flex min-h-[52px] w-full items-center justify-between px-4 text-left"
                  >
                    <span className="text-base font-semibold text-fg">
                      {d.name} <span className="font-medium text-fg-3">· {d.subtitle}</span>
                    </span>
                    <ChevronDown className={cn('h-5 w-5 text-fg-3 transition-transform', open && 'rotate-180')} aria-hidden />
                  </button>
                  {open && (
                    <ul className="divide-y divide-line-subtle border-t border-line-subtle">
                      {d.exercises.map((e) => (
                        <ProjectionRow key={e.id} exercise={e} cells={projection.get(e.id) ?? []} />
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-fg-3">
            Valori in grassetto = carichi reali registrati. Le proiezioni assumono una progressione a settimana.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" icon={<FastForward className="h-5 w-5" />} disabled={meso.isDeloadWeek} onClick={() => setConfirm('deload')}>
            Forza deload
          </Button>
          <Button variant="secondary" icon={<Flag className="h-5 w-5" />} onClick={() => setConfirm('end')}>
            Termina meso
          </Button>
        </div>

        {meso.history.length > 0 && (
          <section>
            <h2 className="section-title">Mesocicli completati</h2>
            <ul className="card divide-y divide-line-subtle">
              {meso.history.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-3 text-base">
                  <span className="text-fg">Dal {formatShortDate(fromISODate(m.startDate))}</span>
                  <span className="text-sm text-fg-3">
                    {m.currentWeek}/{m.weeks} settimane
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'end'}
        title="Terminare il mesociclo?"
        message={`Ne verrà avviato uno nuovo da oggi (${settings.deloadFrequency} settimane). Lo storico resta invariato.`}
        confirmLabel="Termina e riparti"
        destructive={false}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await meso.endMesocycle();
          setConfirm(null);
          toast.success('Nuovo mesociclo avviato');
        }}
      />
      <ConfirmDialog
        open={confirm === 'deload'}
        title="Passare subito al deload?"
        message={`Le prossime sessioni useranno carichi ridotti del ${settings.deloadPercentage}%.`}
        confirmLabel="Forza deload"
        destructive={false}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await meso.forceDeload();
          setConfirm(null);
          toast.success('Settimana di deload attivata');
        }}
      />
    </div>
  );
}

function ProjectionRow({ exercise, cells }: { exercise: Exercise; cells: { value: number | null; actual: boolean; deload: boolean }[] }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: groupColor(exercise.group) }} aria-hidden />
        <span className="truncate text-base text-fg">{exercise.name}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {cells.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-fg-disabled">→</span>}
            <span
              className={cn(
                c.deload ? 'text-accent-400' : c.actual ? 'font-bold text-fg' : 'text-fg-2',
              )}
            >
              {c.deload && 'deload '}
              {c.value != null ? formatKg(c.value, 2) : '—'}
            </span>
          </span>
        ))}
      </div>
    </li>
  );
}
