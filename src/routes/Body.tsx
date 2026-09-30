import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { subDays } from 'date-fns';
import { Moon, Plus, Trash2 } from 'lucide-react';
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
import { BodyLogModal, ENERGY } from '@/components/modals/BodyLogModal';
import { formatKg, movingAverage7d, trendDelta } from '@/lib/analytics';
import { formatRelativeDay, fromISODate, toISODate } from '@/lib/date-utils';

function series(logs: BodyLog[], field: 'weight' | 'bodyFat', days: number): WeightPoint[] {
  const avg = movingAverage7d(logs, field);
  const since = toISODate(subDays(new Date(), days));
  return logs
    .filter((l) => l[field] != null && l.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ t: fromISODate(l.date).getTime(), value: l[field] as number, trend: avg.get(l.date) ?? (l[field] as number) }));
}

export default function Body() {
  const { bodyLogs, remove, loading } = useBodyLogs();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BodyLog | null>(null);
  const [toDelete, setToDelete] = useState<BodyLog | null>(null);

  const weightData = useMemo(() => series(bodyLogs, 'weight', 30), [bodyLogs]);
  const bfData = useMemo(() => series(bodyLogs, 'bodyFat', 30), [bodyLogs]);
  const wTrend = useMemo(() => trendDelta(bodyLogs, 'weight', 7), [bodyLogs]);
  const bfTrend = useMemo(() => trendDelta(bodyLogs, 'bodyFat', 30), [bodyLogs]);
  const leanTrend = useMemo(() => trendDelta(bodyLogs, 'lean', 30), [bodyLogs]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <TopBar title="Corpo" large />
      <div className="page space-y-4 pt-4">
        {bodyLogs.length === 0 ? (
          <EmptyState
            illustration="scale"
            title="Nessun log corporeo"
            description="Registra peso, body fat, sonno ed energia per seguire la tua composizione corporea."
            action={
              <Button icon={<Plus className="h-5 w-5" />} onClick={openNew}>
                Aggiungi il primo log
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Peso" value={wTrend ? `${formatKg(wTrend.current)}` : '—'} unit="kg">
                <TrendLine delta={wTrend?.delta ?? null} label="7gg" unit="" />
              </StatBox>
              <StatBox label="Body fat" value={bfTrend ? `${formatKg(bfTrend.current)}` : '—'} unit="%">
                <TrendLine delta={bfTrend?.delta ?? null} label="30gg" unit="" polarity="down-good" />
              </StatBox>
              <StatBox label="Massa magra" value={leanTrend ? `${formatKg(leanTrend.current)}` : '—'} unit="kg">
                <TrendLine delta={leanTrend?.delta ?? null} label="30gg" unit="" polarity="up-good" />
              </StatBox>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <h2 className="section-title">Peso — ultimi 30 giorni</h2>
                {weightData.length > 1 ? (
                  <WeightChart data={weightData} unit=" kg" label="Peso" />
                ) : (
                  <p className="text-base text-fg-3">Servono almeno 2 misurazioni.</p>
                )}
              </Card>
              <Card className="p-4">
                <h2 className="section-title">Body fat — ultimi 30 giorni</h2>
                {bfData.length > 1 ? (
                  <WeightChart data={bfData} unit="%" label="BF" />
                ) : (
                  <p className="text-base text-fg-3">Servono almeno 2 misurazioni.</p>
                )}
              </Card>
            </div>

            <section>
              <h2 className="section-title">Log</h2>
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
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-glow shadow-lg"
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

function StatBox({ label, value, unit, children }: { label: string; value: string; unit: string; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase tracking-wide text-fg-3">{label}</div>
      <div className="mt-1 text-2xl text-fg">
        {value}
        <span className="text-sm text-fg-3"> {unit}</span>
      </div>
      <div className="mt-0.5 [&>div]:text-xs">{children}</div>
    </Card>
  );
}

function EnergyDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Energia ${value} su 5`} title={ENERGY[value - 1]}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i <= value ? 'bg-accent-500' : 'bg-surface-3'}`} />
      ))}
    </span>
  );
}
