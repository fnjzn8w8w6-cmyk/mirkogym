import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, ChevronRight, Flame, Lock, Settings as SettingsIcon, Trophy } from 'lucide-react';
import { useProgress } from '@/hooks/use-progress';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { useData } from '@/hooks/data-context';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MuscleFigure, GROUP_MUSCLES } from '@/components/library/MuscleFigure';
import { RANKS, TIER_COLOR } from '@/lib/gamification';
import { formatKg, formatTonnage, muscleStatus } from '@/lib/analytics';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { ACTIVITY, EXPERIENCE, GOALS, bfCategory, composition, nutrition } from '@/lib/metabolism';
import { Button } from '@/components/ui/Button';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';

export default function Profile() {
  const navigate = useNavigate();
  const { email } = useData();
  const { level, stats, achievements, unlocked, ranks, bodyweight } = useProgress();
  const { sessions, groupOf } = useSessions();
  const { days } = useSchedule();
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const profile = settings.profile;
  const analysis = useMemo(() => {
    if (!profile) return null;
    // Usa il peso più recente registrato in "Corpo"
    const lastBf = bodyLogs.find((b) => b.bodyFat != null)?.bodyFat;
    const p = { ...profile, weightKg: bodyweight || profile.weightKg, bodyFatPct: lastBf ?? profile.bodyFatPct };
    return { n: nutrition(p, settings.kcalAdjust ?? 0), c: composition(p), p };
  }, [profile, bodyweight, bodyLogs, settings.kcalAdjust]);

  // Mappa muscolare: serie della settimana rispetto al massimo dell'obiettivo
  const intensity = useMemo(() => {
    const groups = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))];
    const out: Record<string, number> = {};
    for (const m of muscleStatus(sessions, groupOf, groups))
      for (const mm of GROUP_MUSCLES[m.group] ?? []) out[mm] = m.weekSets / settings.weeklySetsMax;
    return out;
  }, [sessions, groupOf, days, settings.weeklySetsMax]);

  const lastBfNote = bodyLogs.find((b) => b.bodyFat != null)?.notes ?? 'stima dal questionario';
  const sortedAch = [...achievements].sort(
    (x, y) => Number(y.unlocked) - Number(x.unlocked) || y.progress[0] / y.progress[1] - x.progress[0] / x.progress[1],
  );

  return (
    <div>
      <TopBar
        title="Profilo"
        large
        right={
          <IconButton label="Impostazioni" onClick={() => navigate('/settings')} className="-mr-2">
            <SettingsIcon className="h-6 w-6" />
          </IconButton>
        }
      />
      <div className="page space-y-4 pt-4">
        {/* Livello */}
        <Card variant="elevated" className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent-500/20 blur-3xl" aria-hidden />
          <div className="relative flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-accent-500 bg-accent-glow shadow-glow">
              <span className="text-xs font-bold uppercase text-accent-400">Liv.</span>
              <span className="-mt-1 text-3xl text-fg">{level.level}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl text-fg">{level.title}</div>
              {email && <div className="truncate text-sm text-fg-3">{email}</div>}
              <ProgressBar className="mt-2" value={level.progress} label="Avanzamento livello" />
              <div className="mt-1 text-sm text-fg-3">
                {level.xp.toLocaleString('it-IT')} XP · {level.toNext.toLocaleString('it-IT')} al livello {level.level + 1}
              </div>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
            <Stat label="Sessioni" value={String(stats.sessions)} />
            <Stat label="Volume" value={formatTonnage(stats.volume)} />
            <Stat label="PR" value={String(stats.prs)} />
            <Stat label="Streak" value={`${stats.streak}`} icon={<Flame className="h-3.5 w-3.5 text-accent-500" aria-hidden />} />
          </div>
        </Card>

        {/* Profilo metabolico */}
        {analysis && profile && (
          <section>
            <h2 className="section-title">Il tuo profilo</h2>
            <Card className="p-4">
              <div className="flex flex-wrap gap-1.5 text-sm">
                <span className="rounded-full bg-accent-glow px-2.5 py-1 font-semibold text-accent-400">
                  {GOALS.find((g) => g.value === profile.goal)?.emoji} {GOALS.find((g) => g.value === profile.goal)?.label}
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2">{EXPERIENCE.find((x) => x.value === profile.experience)?.label}</span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2">{ACTIVITY.find((x) => x.value === profile.activity)?.label}</span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2">
                  {profile.heightCm} cm · {formatKg(analysis.p.weightKg)} kg
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Kcal/giorno" value={String(analysis.n.target)} />
                <Stat label="Metab. basale" value={String(analysis.n.bmr)} />
                <Stat label="Consumo" value={String(analysis.n.tdee)} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="Proteine" value={`${analysis.n.protein} g`} />
                <Stat label="Carbo" value={`${analysis.n.carbs} g`} />
                <Stat label="Grassi" value={`${analysis.n.fat} g`} />
              </div>
              <p className="mt-3 text-sm text-fg-2">
                Massa grassa <strong className="text-fg">{formatKg(analysis.c.bf.value)}%</strong> ({bfCategory(analysis.c.bf.value, profile.sex)}) · massa magra{' '}
                {formatKg(analysis.c.lean)} kg · FFMI {formatKg(analysis.c.ffmi)}
                <span className="block text-xs text-fg-3">Fonte: {lastBfNote}</span>
              </p>
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => void settle(update({ profileCompleted: false }))}>
                Aggiorna profilo e obiettivo
              </Button>
            </Card>
          </section>
        )}

        {/* Ranghi di forza */}
        <section>
          <h2 className="section-title">Ranghi di forza</h2>
          <Card className="divide-y divide-line-subtle">
            {!bodyweight && (
              <button type="button" onClick={() => navigate('/body')} className="flex w-full items-center gap-2 p-4 text-left text-sm text-warning">
                Registra il tuo peso corporeo in "Corpo" per calcolare i ranghi.
                <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
              </button>
            )}
            {ranks.map((r) => {
              const rank = RANKS[r.rank];
              return (
                <div key={r.lift.id} className="flex items-center gap-3 p-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-extrabold"
                    style={{ borderColor: rank.color, color: rank.color, backgroundColor: `${rank.color}1a` }}
                    aria-hidden
                  >
                    {rank.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-base font-semibold text-fg">{r.lift.name}</span>
                      <span className="text-sm font-bold" style={{ color: rank.color }}>
                        {rank.name}
                      </span>
                    </div>
                    <ProgressBar className="mt-1.5 h-1.5" value={r.progress} color={RANKS[Math.min(r.rank + 1, RANKS.length - 1)].color} label={`${r.lift.name}: avanzamento rango`} />
                    <div className="mt-1 text-xs text-fg-3">
                      {r.best1RM ? `1RM ~${r.best1RM} kg (${formatKg(r.ratio, 2)}× peso corporeo)` : 'Nessun dato'}
                      {r.next != null && r.best1RM > 0 && ` · ${RANKS[r.rank + 1].name} a ${r.next} kg`}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
          <p className="mt-2 text-xs text-fg-3">Standard indicativi basati sul rapporto 1RM stimato / peso corporeo.</p>
        </section>

        {/* Mappa muscolare */}
        <Card className="p-4">
          <h2 className="section-title">Muscoli allenati questa settimana</h2>
          <MuscleFigure intensity={intensity} labels className="mx-auto h-56 w-auto" />
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-fg-3">
            Poco
            <span className="h-2 w-24 rounded-full bg-gradient-to-r from-[rgba(249,115,22,0.25)] to-accent-500" aria-hidden />
            Obiettivo raggiunto
          </div>
        </Card>

        {/* Traguardi */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title !mb-0">Traguardi</h2>
            <span className="text-sm text-fg-3">
              {unlocked}/{achievements.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {sortedAch.map(({ a, unlocked: ok, progress: [v, t] }) => (
              <div
                key={a.id}
                className={cn('flex flex-col items-center rounded-lg border p-3 text-center', ok ? 'bg-surface' : 'border-line-subtle bg-surface/50')}
                style={ok ? { borderColor: `${TIER_COLOR[a.tier]}66` } : undefined}
                title={a.description}
              >
                <span className={cn('relative text-3xl', !ok && 'opacity-30 grayscale')} aria-hidden>
                  {a.emoji}
                  {!ok && <Lock className="absolute -bottom-1 -right-2 h-4 w-4 text-fg-3" />}
                </span>
                <span className={cn('mt-1.5 text-sm font-semibold leading-tight', ok ? 'text-fg' : 'text-fg-3')}>{a.title}</span>
                <span className="mt-0.5 text-xs leading-tight text-fg-3">{a.description}</span>
                {!ok && t > 1 && <ProgressBar className="mt-2 h-1" value={v / t} label={`${a.title}: avanzamento`} />}
              </div>
            ))}
          </div>
        </section>

        <Card interactive className="flex items-center gap-3 p-4" onClick={() => navigate('/mesocycle')} role="link">
          <CalendarRange className="h-6 w-6 text-accent-500" aria-hidden />
          <span className="flex-1 text-base font-semibold text-fg">Mesociclo e deload</span>
          <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
        </Card>
        <Card interactive className="flex items-center gap-3 p-4" onClick={() => navigate('/settings')} role="link">
          <SettingsIcon className="h-6 w-6 text-accent-500" aria-hidden />
          <span className="flex-1 text-base font-semibold text-fg">Impostazioni, account e backup</span>
          <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
        </Card>
        <p className="flex items-center justify-center gap-1.5 pb-2 text-xs text-fg-3">
          <Trophy className="h-3.5 w-3.5" aria-hidden /> XP: 100 per sessione, 5 per serie, 40 per PR, 150 per traguardo
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-2/80 py-2">
      <div className="flex items-center justify-center gap-1 text-lg text-fg">
        {icon}
        {value}
      </div>
      <div className="text-xs uppercase text-fg-3">{label}</div>
    </div>
  );
}
