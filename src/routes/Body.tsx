import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { subDays } from 'date-fns';
import { Camera, Moon, Plus, Trash2 } from 'lucide-react';
import { BodyFatPhotoModal } from '@/components/modals/BodyFatPhotoModal';
import { useSettings } from '@/hooks/use-settings';
import { todayISO } from '@/lib/date-utils';
import type { BodyLog } from '@/types';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button, IconButton } from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { TrendLine } from '@/components/ui/Trend';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { WeightChart, type WeightPoint } from '@/components/charts/WeightChart';
import { BodyLogModal, ENERGY_LABELS } from '@/components/modals/BodyLogModal';
import { formatKg, movingAverage7d, trendDelta } from '@/lib/analytics';
import { formatRelativeDay, fromISODate, toISODate } from '@/lib/date-utils';
import { cn } from '@/lib/cn';
import { CompositionCard, GoalStatus, Measurements } from '@/components/body/BodyOverview';
import { MuscleWeekCard } from '@/components/body/MuscleWeek';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useSessions } from '@/hooks/use-sessions';
import { userNutrition } from '@/lib/coach';
import { completeDays, waterEvents, weightTrend } from '@/lib/body-model';
import { SectionTitle } from '@/components/ui/Help';
import { ProgressPhotos } from '@/components/body/ProgressPhotos';

const PERIODS: [number, string][] = [
  [30, '1M'],
  [90, '3M'],
  [180, '6M'],
  [365, '1A'],
];

function series(logs: BodyLog[], field: 'weight' | 'bodyFat', days: number): WeightPoint[] {
  const avg = movingAverage7d(logs, field);
  const since = toISODate(subDays(new Date(), days));
  return logs
    .filter((l) => l[field] != null && l.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ t: fromISODate(l.date).getTime(), value: l[field] as number, trend: avg.get(l.date) ?? (l[field] as number) }));
}

export default function Body() {
  const { bodyLogs, remove, loading, save } = useBodyLogs();
  const { settings } = useSettings();
  const [photoOpen, setPhotoOpen] = useState(false);
  const latestWeight = bodyLogs.find((b) => b.weight != null)?.weight ?? settings.profile?.weightKg;
  const subject = settings.profile && latestWeight ? { ...settings.profile, weightKg: latestWeight } : null;
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BodyLog | null>(null);
  const [toDelete, setToDelete] = useState<BodyLog | null>(null);

  const [period, setPeriod] = useState(90);
  // Peso: pesate + peso reale (media mobile esponenziale) + pesate gonfiate da acqua
  const foodLogs = useRecentFoodLogs(120);
  const { sessions, groupOf } = useSessions();
  const target = settings.profile ? userNutrition(settings.profile, settings).target : null;
  const water = useMemo(() => waterEvents(bodyLogs, foodLogs, sessions, target, groupOf), [bodyLogs, foodLogs, sessions, target, groupOf]);
  const weightData = useMemo(() => {
    const since = toISODate(subDays(new Date(), period));
    const wset = new Set(water.map((w) => w.date));
    return weightTrend(bodyLogs)
      .filter((p) => p.weight != null && p.date >= since)
      .map((p) => ({ t: fromISODate(p.date).getTime(), value: p.weight, trend: p.trend, ...(wset.has(p.date) ? { water: true } : {}) }));
  }, [bodyLogs, period, water]);
  const real = weightData.length ? weightData[weightData.length - 1] : null;
  const bfData = useMemo(() => series(bodyLogs, 'bodyFat', period), [bodyLogs, period]);
  const wTrend = useMemo(() => trendDelta(bodyLogs, 'weight', 7), [bodyLogs]);
  // Percorso previsto dall'obiettivo a fasi (dalla fase in corso in poi)
  const goalPaths = useMemo(() => {
    const plan = settings.goalPlan;
    if (!plan) return { w: undefined, bf: undefined };
    const ts = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
    const phases = plan.phases.slice(plan.current);
    const w = [{ t: ts(phases[0].start), plan: phases[0].startWeight }, ...phases.map((p) => ({ t: ts(p.end), plan: (p.weightMin + p.weightMax) / 2 }))];
    const lastBf = bodyLogs.find((b) => b.bodyFat != null);
    const bfPts = phases.filter((p) => p.targetBf != null).map((p) => ({ t: ts(p.end), plan: p.targetBf as number }));
    const bf = lastBf && bfPts.length ? [{ t: ts(lastBf.date), plan: lastBf.bodyFat as number }, ...bfPts] : undefined;
    return { w, bf };
  }, [settings.goalPlan, bodyLogs]);
  const bfTrend = useMemo(() => trendDelta(bodyLogs, 'bodyFat', 30), [bodyLogs]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <TopBar
        title="Corpo"
        large
        right={
          <Button size="sm" variant="secondary" icon={<Camera className="h-4 w-4" />} onClick={() => setPhotoOpen(true)}>
            BF da foto
          </Button>
        }
      />
      <BodyFatPhotoModal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        subject={subject}
        onUse={async (bf, r) => {
          await save({
            date: todayISO(),
            weight: latestWeight,
            bodyFat: bf,
            bodyFatSource: 'photo',
            notes: `Stima AI da foto (${r.low}–${r.high}%, affidabilità ${r.confidence})`,
          });
          setPhotoOpen(false);
          toast.success('Massa grassa salvata nel diario');
        }}
      />
      <div className="page space-y-4 pt-4">
        {bodyLogs.length === 0 ? (
          <EmptyState
            illustration="scale"
            title="Nessun log corporeo"
            description="Registra peso, sonno ed energia: la massa grassa la seguiamo noi dal peso e dal check-in con foto."
            action={
              <Button icon={<Plus className="h-5 w-5" />} onClick={openNew}>
                Aggiungi il primo log
              </Button>
            }
          />
        ) : (
          <>
            <CompositionCard />
            <GoalStatus />
            <MuscleWeekCard />
            <ProgressPhotos />

            <div className="flex justify-end gap-1.5">
              {PERIODS.map(([d, l]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={period === d}
                  onClick={() => setPeriod(d)}
                  className={cn('h-8 rounded-full px-3 text-sm font-semibold', period === d ? 'bg-accent-500 text-onaccent' : 'text-fg-3')}
                >
                  {l}
                </button>
              ))}
            </div>
            <Card className="p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="section-title !mb-0">
                  <SectionTitle help="body-weight-chart" isNew>Peso</SectionTitle>
                </h2>
                {wTrend && <TrendLine delta={wTrend.delta} label="7gg" unit=" kg" />}
              </div>
              {real?.trend != null && (
                <p className="mt-1 text-sm text-fg-2">
                  Peso reale <strong className="text-fg">{formatKg(real.trend)} kg</strong>
                  {real.value != null && Math.abs(real.value - real.trend) >= 0.2 ? <span className="text-fg-3"> · bilancia {formatKg(real.value)}</span> : null}
                </p>
              )}
              {weightData.length > 1 ? <WeightChart data={weightData} unit=" kg" label="Pesate" plan={goalPaths.w} /> : <p className="mt-2 text-base text-fg-3">Servono almeno 2 pesate nel periodo.</p>}
              {water
                .filter((w) => w.date >= toISODate(subDays(new Date(), 21)))
                .slice(-2)
                .reverse()
                .map((w) => (
                  <p key={w.date} className="mt-2 border-l-2 border-sky-400 pl-2 text-sm text-fg-2">
                    💧 <strong className="text-fg">{fromISODate(w.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: +{formatKg(w.delta)} kg</strong> sopra il peso reale → acqua e glicogeno ({w.reason}).
                    Grasso reale stimato <strong className="text-fg">+{formatKg(w.fat)} kg</strong>: rientra in 2–3 giorni, il coach non cambia le calorie.
                  </p>
                ))}
              <MetabolismLine />
            </Card>
            <Card className="p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="section-title !mb-0">
                  <SectionTitle help="body-bf-chart">Massa grassa</SectionTitle>
                </h2>
                {bfTrend && <TrendLine delta={bfTrend.delta} label="30gg" unit="%" polarity="down-good" />}
              </div>
              {bfData.length > 1 ? <WeightChart data={bfData} unit="%" label="BF" plan={goalPaths.bf} /> : <p className="mt-2 text-base text-fg-3">Servono almeno 2 misure della massa grassa nel periodo.</p>}
            </Card>
            <Measurements logs={bodyLogs} />

            <section>
              <h2 className="section-title">Tutte le registrazioni</h2>
              <ul className="card divide-y divide-line-subtle">
                {bodyLogs.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 pr-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(l);
                        setModalOpen(true);
                      }}
                      className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <span className="w-16 shrink-0 text-sm text-fg-3">{formatRelativeDay(fromISODate(l.date))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-3 text-base font-semibold text-fg">
                          {l.weight != null && <span>{formatKg(l.weight)} kg</span>}
                          {l.bodyFat != null && <span className="text-fg-2">{formatKg(l.bodyFat)}%</span>}
                          {l.sleepHours != null && (
                            <span className="flex items-center gap-1 text-sm font-medium text-fg-3">
                              <Moon className="h-3.5 w-3.5" aria-hidden />
                              {formatKg(l.sleepHours)}h
                            </span>
                          )}
                        </span>
                        {l.notes && <span className="block truncate text-sm text-fg-3">{l.notes}</span>}
                      </span>
                      {l.energy != null && <EnergyDots value={l.energy} />}
                    </button>
                    <IconButton label="Elimina log" onClick={() => setToDelete(l)}>
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      {/* FAB */}
      <motion.button
        type="button"
        onClick={openNew}
        whileTap={{ scale: 0.92 }}
        aria-label="Aggiungi log"
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-onaccent shadow-glow shadow-lg"
        style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 16px)' }}
      >
        <Plus className="h-7 w-7" aria-hidden />
      </motion.button>

      <BodyLogModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminare il log?"
        message="Il log verrà eliminato definitivamente."
        confirmLabel="Elimina"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await remove(toDelete.id);
          setToDelete(null);
          toast.success('Log eliminato');
        }}
      />
    </div>
  );
}


function EnergyDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Energia: ${ENERGY_LABELS[value - 1] ?? value}`} title={ENERGY_LABELS[value - 1]}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i <= value ? 'bg-accent-500' : 'bg-surface-3'}`} />
      ))}
    </span>
  );
}

/** Metabolismo reale (dal diario) o quanto manca per calcolarlo. */
function MetabolismLine() {
  const { settings } = useSettings();
  const foodLogs = useRecentFoodLogs(21);
  const m = settings.metabolism;
  const complete = completeDays(foodLogs).length;
  return (
    <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-fg-2">
      <SectionTitle help="body-metabolism" isNew className="text-xs font-bold uppercase tracking-wider text-fg-3">
        Il tuo metabolismo
      </SectionTitle>
      {m ? (
        <p className="mt-1">
          🔥 <strong className="font-display text-fg">{m.tdee.toLocaleString('it-IT')} kcal</strong> al giorno (±{m.sd}), dal diario di {m.days} giornate complete. Si
          aggiorna ogni giorno.
        </p>
      ) : (
        <p className="mt-1">
          Per calcolarlo dai tuoi dati servono 7 giornate complete nel diario negli ultimi 21 giorni (ora {Math.min(complete, 7)}/7) e qualche pesata. Fino ad allora uso la formula.
        </p>
      )}
    </div>
  );
}
