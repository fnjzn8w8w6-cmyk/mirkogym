import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Dumbbell, Pencil, Play, ShieldAlert, Timer } from 'lucide-react';
import { useData } from '@/hooks/data-context';
import { TrendLine } from '@/components/ui/Trend';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useSettings } from '@/hooks/use-settings';
import { useActiveSession } from '@/hooks/use-active-session';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { OfflineBadge } from '@/components/layout/TopBar';
import { formatAgo, formatLongDate, formatRelativeDay, fromISODate, daysBetween } from '@/lib/date-utils';
import { dayGroups, nextDay, plannedSets } from '@/lib/schedule-utils';
import { formatKg, groupColor, trendDelta } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Day } from '@/types';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="var(--accent-500)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--accent-500)" />
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const { days } = useSchedule();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { settings } = useSettings();
  const meso = useMesocycle();
  const { activeSession, start } = useActiveSession();
  const [pendingDay, setPendingDay] = useState<Day | null>(null);
  const [starting, setStarting] = useState(false);
  const { isAnonymous } = useData();

  const next = useMemo(() => nextDay(days, sessions), [days, sessions]);
  const activeDay = activeSession ? days.find((d) => d.id === activeSession.dayId) : undefined;

  const startDay = async (day: Day) => {
    if (activeSession) {
      if (activeSession.dayId === day.id) return navigate(`/session/${day.id}`);
      setPendingDay(day);
      return;
    }
    setStarting(true);
    try {
      await start(day, meso.isDeloadWeek);
      navigate(`/session/${day.id}`);
    } catch {
      toast.error('Impossibile avviare la sessione');
    } finally {
      setStarting(false);
    }
  };

  const latestBody = bodyLogs.find((b) => b.weight != null);
  const showBody = latestBody && daysBetween(new Date(), fromISODate(latestBody.date)) <= 7;
  const weightTrend = useMemo(() => trendDelta(bodyLogs, 'weight', 7), [bodyLogs]);
  const spark = useMemo(
    () =>
      bodyLogs
        .filter((b) => b.weight != null)
        .slice(0, 4)
        .reverse()
        .map((b) => b.weight as number),
    [bodyLogs],
  );

  const lastForDay = (id: string) => sessions.find((s) => s.dayId === id);

  return (
    <div className="pb-4">
      {/* Banner sessione in corso */}
      {activeSession && (
        <motion.button
          type="button"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => navigate(`/session/${activeSession.dayId}`)}
          className="sticky top-0 z-30 flex w-full items-center gap-3 bg-accent-500 px-4 text-left text-white shadow-lg"
          style={{ paddingTop: 'calc(var(--safe-top) + 10px)', paddingBottom: 10 }}
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <span className="flex-1">
            <span className="block text-base font-bold">Sessione in corso — Riprendi</span>
            <span className="block text-sm text-white/85">
              {activeDay ? `${activeDay.name} · ${activeDay.subtitle}` : 'Allenamento'} · iniziata {formatAgo(activeSession.startedAt)}
            </span>
          </span>
          <ChevronRight className="h-6 w-6" aria-hidden />
        </motion.button>
      )}

      <div className="page space-y-4" style={{ paddingTop: activeSession ? 16 : 'calc(var(--safe-top) + 16px)' }}>
        {/* Header */}
        <header className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-md border border-line-subtle bg-surface text-2xl shadow-glow"
            aria-hidden
          >
            🏋️
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl text-fg">MirkoGym</h1>
            <p className="text-sm text-fg-3">{formatLongDate(new Date())}</p>
          </div>
          <OfflineBadge />
        </header>

        {/* Promemoria account: i dati anonimi vivono solo su questo dispositivo */}
        {isAnonymous && sessions.length > 0 && (
          <Card interactive className="flex items-center gap-3 border-warning/30 p-4" onClick={() => navigate('/settings')} role="link">
            <ShieldAlert className="h-6 w-6 shrink-0 text-warning" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-fg">Proteggi i tuoi dati</span>
              <span className="block text-sm text-fg-2">Crea un account per non perdere i tuoi allenamenti</span>
            </span>
            <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
          </Card>
        )}

        {/* Hero prossima sessione */}
        {next && (
          <Card variant="elevated" className="relative overflow-hidden p-5">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-500/20 blur-3xl"
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-accent-400">Prossima sessione</span>
                {meso.isDeloadWeek && <Chip tone="accent">DELOAD -{settings.deloadPercentage}%</Chip>}
              </div>
              <h2 className="mt-2 text-3xl text-fg">{next.name}</h2>
              <p className="text-xl font-semibold text-fg-2">{next.subtitle}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dayGroups(next).map((g) => (
                  <Chip key={g} color={groupColor(g)}>
                    {g}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 flex gap-6 text-sm text-fg-2">
                <span className="flex items-center gap-1.5">
                  <Dumbbell className="h-4 w-4 text-fg-3" aria-hidden />
                  <strong className="text-fg">{next.exercises.length}</strong> esercizi
                </span>
                <span className="flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-fg-3" aria-hidden />
                  <strong className="text-fg">{plannedSets(next)}</strong> serie totali
                </span>
              </div>
              <Button
                size="lg"
                fullWidth
                className="mt-5"
                loading={starting}
                icon={<Play className="h-5 w-5 fill-current" />}
                onClick={() => startDay(next)}
              >
                {activeSession?.dayId === next.id ? 'Riprendi sessione' : 'Inizia sessione'}
              </Button>
            </div>
          </Card>
        )}

        {/* Mesociclo */}
        <Card interactive className="p-4" onClick={() => navigate('/mesocycle')} role="link" aria-label="Apri mesociclo">
          <div className="flex items-center justify-between">
            <span className="section-title !mb-0">Mesociclo</span>
            <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg text-fg">
              Settimana {meso.currentWeek} di {meso.totalWeeks}
            </span>
            {meso.isDeloadWeek && <span className="text-sm font-semibold text-accent-400">Deload</span>}
          </div>
          <ProgressBar className="mt-3" value={meso.currentWeek / meso.totalWeeks} label="Avanzamento mesociclo" />
          <div className="mt-3 flex justify-between gap-2">
            {meso.weeks.map((w) => (
              <div key={w.index} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    w.isCurrent ? 'bg-accent-500 ring-4 ring-accent-glow' : w.isPast ? 'bg-success' : 'bg-surface-3',
                    w.isDeload && !w.isCurrent && !w.isPast && 'bg-accent-600/40',
                  )}
                  aria-hidden
                />
                <span className="text-xs text-fg-3">
                  {w.isDeload ? 'DL' : `S${w.index}`} · {w.sessions.length}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Peso corporeo */}
        {showBody && latestBody?.weight != null && (
          <Card interactive className="p-4" onClick={() => navigate('/body')} role="link" aria-label="Apri corpo">
            <div className="flex items-center justify-between">
              <span className="section-title !mb-0">Peso corporeo</span>
              <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="text-3xl text-fg">
                  {formatKg(latestBody.weight)} <span className="text-lg text-fg-3">kg</span>
                </div>
                <TrendLine delta={weightTrend?.delta ?? null} label="7 giorni" unit="kg" />
              </div>
              <Sparkline values={spark} />
            </div>
          </Card>
        )}

        {/* Tutti i giorni */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title !mb-0">Tutti i giorni</h2>
            <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate('/schedule')}>
              Modifica
            </Button>
          </div>
          <ul className="card divide-y divide-line-subtle">
            {days.map((d) => {
              const last = lastForDay(d.id);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => startDay(d)}
                    className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-base font-bold',
                        d.id === next?.id ? 'bg-accent-500 text-white' : 'bg-surface-2 text-fg-2',
                      )}
                    >
                      {d.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-fg">{d.subtitle}</span>
                      <span className="block text-sm text-fg-3">
                        {d.exercises.length} esercizi · {last ? `ultima: ${formatRelativeDay(last.date)}` : 'mai fatto'}
                      </span>
                    </span>
                    {activeSession?.dayId === d.id ? (
                      <Chip tone="accent">In corso</Chip>
                    ) : (
                      <Play className="h-5 w-5 text-fg-3" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDay)}
        title="Sessione già in corso"
        message={`Hai una sessione ${activeDay?.name ?? ''} in corso. Vuoi scartarla e iniziare ${pendingDay?.name ?? ''}?`}
        confirmLabel="Scarta e inizia"
        onCancel={() => setPendingDay(null)}
        onConfirm={async () => {
          const day = pendingDay;
          setPendingDay(null);
          if (!day) return;
          setStarting(true);
          await start(day, meso.isDeloadWeek);
          setStarting(false);
          navigate(`/session/${day.id}`);
        }}
      />
    </div>
  );
}
