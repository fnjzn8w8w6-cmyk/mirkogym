import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Dumbbell, Play, Timer } from 'lucide-react';
import { WeekCard } from '@/components/home/MuscleCard';
import { useProgress } from '@/hooks/use-progress';
import { userNutrition } from '@/lib/coach';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { checkInDue } from '@/lib/checkin';
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
import { formatAgo, formatLongDate, fromISODate, daysBetween, todayISO } from '@/lib/date-utils';
import { dayGroups, nextDay, plannedSets } from '@/lib/schedule-utils';
import { MicButton } from '@/components/ui/MicButton';
import { useFoodLog } from '@/hooks/use-food';
import { entryMacros } from '@/components/food/FoodDiary';
import { sumMacros } from '@/lib/foods';
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

function Ring({ value, target, color, label, unit }: { value: number; target: number; color: string; label: string; unit: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <div className="flex flex-col items-center">
      <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--bg-surface-3)" strokeWidth={6} />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${p * c} ${c}`}
          transform="rotate(-90 32 32)"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <text x={32} y={36} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--text-primary)">
          {Math.round(value)}
        </text>
      </svg>
      <span className="mt-1 text-xs font-semibold text-fg-2">{label}</span>
      <span className="text-[11px] text-fg-3">
        / {Math.round(target)} {unit}
      </span>
    </div>
  );
}

function TodayDiet({ onOpen }: { onOpen: () => void }) {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const { entries } = useFoodLog(todayISO());
  const profile = settings.profile!;
  const w = bodyLogs.find((b) => b.weight != null)?.weight ?? profile.weightKg;
  const target = userNutrition({ ...profile, weightKg: w }, settings);
  const t = sumMacros(entries.map(entryMacros));
  return (
    <Card interactive className="p-4" onClick={onOpen} role="link" aria-label="Apri la dieta">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-fg-3">Dieta di oggi</span>
        <span className="text-sm text-fg-2">
          <strong className="font-display text-fg">{t.kcal}</strong> / {target.target} kcal
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3">
        <Ring value={t.protein} target={target.protein} color="#39FF88" label="Proteine" unit="g" />
        <Ring value={t.carbs} target={target.carbs} color="#C084FC" label="Carbo" unit="g" />
        <Ring value={t.fat} target={target.fat} color="#EAB308" label="Grassi" unit="g" />
      </div>
      {entries.length === 0 && (
        <p className="mt-3 text-center text-sm text-fg-2">{settings.weekPlan ? 'Segna i pasti nel diario →' : 'Crea il piano settimanale →'}</p>
      )}
    </Card>
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
  const { level } = useProgress();

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

  return (
    <div className="pb-4">
      {/* Banner sessione in corso */}
      {activeSession && (
        <motion.button
          type="button"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => navigate(`/session/${activeSession.dayId}`)}
          className="sticky top-0 z-30 flex w-full items-center gap-3 bg-accent-500 px-4 text-left text-onaccent shadow-lg"
          style={{ paddingTop: 'calc(var(--safe-top) + 10px)', paddingBottom: 10 }}
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <span className="flex-1">
            <span className="block text-base font-bold">Sessione in corso — Riprendi</span>
            <span className="block text-sm text-onaccent/80">
              {activeDay ? `${activeDay.name} · ${activeDay.subtitle}` : 'Allenamento'} · iniziata {formatAgo(activeSession.startedAt)}
            </span>
          </span>
          <ChevronRight className="h-6 w-6" aria-hidden />
        </motion.button>
      )}

      <div className="page space-y-4" style={{ paddingTop: activeSession ? 16 : 'calc(var(--safe-top) + 16px)' }}>
        {/* Header */}
        <header className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-11 w-11 rounded-xl shadow-glow" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-extrabold text-fg">How<span className="text-accent-500">To</span>Gym</h1>
            <p className="text-sm text-fg-3">{formatLongDate(new Date())}</p>
          </div>
          <OfflineBadge />
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label={`Livello ${level.level}, ${level.title}: apri profilo`}
            className="flex h-11 items-center gap-2 rounded-full border border-accent-500/40 bg-accent-glow pl-1 pr-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-sm font-extrabold text-onaccent">
              {level.level}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-xs font-bold text-accent-400">{level.title}</span>
              <span className="mt-0.5 block h-1 w-14 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full bg-accent-500" style={{ width: `${level.progress * 100}%` }} />
              </span>
            </span>
          </button>
        </header>

        {/* Hero allenamento di oggi */}
        {next && (
          <section
            className="relative overflow-hidden rounded-2xl border border-accent-500/30 p-5 shadow-glow"
            style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(139,92,246,0.45), transparent 60%), radial-gradient(90% 80% at 0% 100%, rgba(57,255,136,0.18), transparent 60%), linear-gradient(#150F22,#150F22)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-400">Allenamento di oggi</span>
              {meso.isDeloadWeek && <Chip tone="accent">DELOAD -{settings.deloadPercentage}%</Chip>}
            </div>
            <h2 className="mt-2 font-display text-3xl font-extrabold uppercase leading-tight text-fg">{next.subtitle || next.name}</h2>
            <p className="text-sm font-semibold text-fg-2">
              {next.name} · Settimana {meso.currentWeek}/{meso.totalWeeks}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dayGroups(next).map((g) => (
                <Chip key={g} color={groupColor(g)}>
                  {g}
                </Chip>
              ))}
            </div>
            <div className="mt-4 flex gap-6 text-sm text-fg-2">
              <span className="flex items-center gap-1.5">
                <Dumbbell className="h-4 w-4 text-accent-400" aria-hidden />
                <strong className="text-fg">{next.exercises.length}</strong> esercizi
              </span>
              <span className="flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-accent-400" aria-hidden />
                <strong className="text-fg">{plannedSets(next)}</strong> serie
              </span>
            </div>
            <Button
              size="lg"
              fullWidth
              className="mt-5 font-display uppercase tracking-wider shadow-glow"
              loading={starting}
              icon={<Play className="h-5 w-5 fill-current" />}
              onClick={() => startDay(next)}
            >
              {activeSession?.dayId === next.id ? 'Riprendi' : 'Inizia'}
            </Button>
            <button type="button" onClick={() => navigate('/training')} className="mt-3 w-full text-center text-sm font-semibold text-fg-2">
              Vedi tutta la scheda →
            </button>
          </section>
        )}

        {/* Dieta di oggi: anelli dei macro */}
        {settings.profile && <TodayDiet onOpen={() => navigate('/food')} />}

        {/* Peso + mesociclo */}
        <div className="grid grid-cols-2 gap-3">
          <Card interactive className="p-4" onClick={() => navigate('/body')} role="link" aria-label="Apri corpo">
            <span className="text-xs font-bold uppercase tracking-wider text-fg-3">Peso</span>
            {showBody && latestBody?.weight != null ? (
              <>
                <div className="mt-1 font-display text-2xl font-extrabold text-fg">
                  {formatKg(latestBody.weight)}
                  <span className="ml-1 text-sm font-semibold text-fg-3">kg</span>
                </div>
                <TrendLine delta={weightTrend?.delta ?? null} label="7 gg" unit="kg" />
                <div className="mt-1">
                  <Sparkline values={spark} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-fg-2">Pesati per vedere l'andamento →</p>
            )}
          </Card>
          <Card interactive className="p-4" onClick={() => navigate('/mesocycle')} role="link" aria-label="Apri mesociclo">
            <span className="text-xs font-bold uppercase tracking-wider text-fg-3">Mesociclo</span>
            <div className="mt-1 font-display text-2xl font-extrabold text-fg">
              {meso.currentWeek}
              <span className="text-sm font-semibold text-fg-3">/{meso.totalWeeks} sett.</span>
            </div>
            {meso.isDeloadWeek && <span className="text-sm font-semibold text-accent-400">Deload</span>}
            <ProgressBar className="mt-3" value={meso.currentWeek / meso.totalWeeks} label="Avanzamento mesociclo" />
            <div className="mt-3 flex justify-between">
              {meso.weeks.map((w) => (
                <span
                  key={w.index}
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    w.isCurrent ? 'bg-accent-500 ring-4 ring-accent-glow' : w.isPast ? 'bg-accent-600/60' : 'bg-surface-3',
                  )}
                  aria-hidden
                />
              ))}
            </div>
          </Card>
        </div>

        {sessions.length > 0 && <WeekCard />}

        {/* Promemoria check-in settimanale */}
        {settings.profile && sessions.length > 0 && checkInDue(settings.checkIns) && (
          <Card
            interactive
            className="flex items-center gap-3 border-accent-500/50 p-4"
            onClick={() => navigate('/food?tab=plan&checkin=1')}
            role="link"
            aria-label="Fai il check-in settimanale"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-accent-500 text-onaccent">
              <ClipboardCheck className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-fg">Check-in settimanale</span>
              <span className="block text-sm text-fg-2">2 minuti: il coach aggiusta calorie e carichi</span>
            </span>
            <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
          </Card>
        )}

        {/* Coach con microfono */}
        <Card className="flex items-center gap-3 border-violet-500/40 p-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(21,15,34,0.95))' }}>
          <button type="button" onClick={() => navigate('/coach?tab=chat')} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-400">
              <Sparkles className="h-4 w-4" aria-hidden /> Coach
            </span>
            <span className="mt-1 block text-base font-semibold text-fg">Chiedimi qualcosa</span>
            <span className="block text-sm text-fg-2">Tocca il microfono e parla: scheda, dieta, dolori…</span>
          </button>
          <MicButton onText={(t) => navigate(`/coach?tab=chat&q=${encodeURIComponent(t)}`)} />
        </Card>
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
