import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Clock, Copy, Dumbbell, Flame, Layers, Trash2, Trophy } from 'lucide-react';
import type { Session } from '@/types';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { TopBar } from '@/components/layout/TopBar';
import { Segmented } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { GroupVolumeChart } from '@/components/charts/VolumeChart';
import { TonnageChart } from '@/components/charts/TonnageChart';
import { HeatmapCalendar } from '@/components/charts/HeatmapCalendar';
import { sortGroups } from '@/components/charts/chart-theme';
import {
  computeRecords,
  epley1RM,
  exerciseKey,
  formatKg,
  formatTonnage,
  groupColor,
  recentPRs,
  sessionSetCount,
  sessionTonnage,
  sessionsPerDay,
  topSet,
  weekStreak,
  weeklyTonnage,
  weeklyVolumeByGroup,
} from '@/lib/analytics';
import { formatDuration, formatRelativeDay, formatShortDate } from '@/lib/date-utils';
import { cn } from '@/lib/cn';

type Tab = 'sessions' | 'exercises' | 'analytics';

export default function History({ embedded }: { embedded?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'sessions';
  const { loading } = useSessions();

  return (
    <div>
      {!embedded && <TopBar title="Storico" large />}
      <div className={embedded ? '' : 'page pt-3'}>
        <Segmented<Tab>
          label="Sezione storico"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'sessions', label: 'Sessioni' },
            { value: 'exercises', label: 'Esercizi' },
            { value: 'analytics', label: 'Analytics' },
          ]}
        />
        <div className="mt-4">
          {loading ? (
            <PageSkeleton />
          ) : tab === 'sessions' ? (
            <SessionsTab />
          ) : tab === 'exercises' ? (
            <ExercisesTab />
          ) : (
            <AnalyticsTab />
          )}
        </div>
      </div>
    </div>
  );
}

function NoData() {
  const navigate = useNavigate();
  return (
    <EmptyState
      illustration="chart"
      title="Ancora nessuna sessione"
      description="Completa il tuo primo allenamento per vedere storico e progressi."
      action={<Button onClick={() => navigate('/')}>Vai alla home</Button>}
    />
  );
}

function SessionsTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const { sessions, remove, duplicate } = useSessions();
  const { getDay } = useSchedule();
  const [toDelete, setToDelete] = useState<Session | null>(null);

  if (sessions.length === 0) return <NoData />;

  return (
    <>
      <p className="mb-3 text-sm text-fg-3">Scorri una sessione verso sinistra per duplicarla o eliminarla.</p>
      <ul className="space-y-2">
        {sessions.map((s) => {
          const day = getDay(s.dayId);
          const prs = s.logs.reduce((a, l) => a + l.sets.filter((x) => x.isPersonalRecord).length, 0);
          return (
            <li key={s.id}>
              <SwipeRow
                actions={[
                  {
                    label: 'Duplica',
                    tone: 'neutral',
                    icon: <Copy className="h-5 w-5" aria-hidden />,
                    onClick: () => duplicate(s).then(() => toast.success('Sessione duplicata con data odierna')),
                  },
                  { label: 'Elimina', tone: 'danger', icon: <Trash2 className="h-5 w-5" aria-hidden />, onClick: () => setToDelete(s) },
                ]}
              >
                <Card interactive className="p-4" onClick={() => navigate(`/history/session/${s.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-fg-3">{formatRelativeDay(s.date)}</div>
                      <div className="truncate text-lg text-fg">
                        {day?.name ?? 'Sessione'} · <span className="text-fg-2">{day?.subtitle ?? s.dayId}</span>
                      </div>
                    </div>
                    <ChevronRight className="mt-5 h-5 w-5 shrink-0 text-fg-3" aria-hidden />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-fg-3" aria-hidden />
                      {formatDuration(s.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Dumbbell className="h-4 w-4 text-fg-3" aria-hidden />
                      {s.logs.length} esercizi
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-4 w-4 text-fg-3" aria-hidden />
                      {formatTonnage(sessionTonnage(s))}
                    </span>
                    {prs > 0 && (
                      <Chip tone="warning" icon={<Trophy className="h-3 w-3" aria-hidden />}>
                        {prs} PR
                      </Chip>
                    )}
                    {s.deload && <Chip tone="info">Deload</Chip>}
                  </div>
                </Card>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminare la sessione?"
        message={toDelete ? `La sessione del ${formatShortDate(toDelete.date)} verrà eliminata definitivamente.` : ''}
        confirmLabel="Elimina"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await remove(toDelete.id);
          setToDelete(null);
          toast.success('Sessione eliminata');
        }}
      />
    </>
  );
}

interface ExerciseRow {
  key: string;
  name: string;
  group: string;
  sessions: number;
  last: { weight: number; reps: number } | null;
  maxWeight: number;
  best1RM: number;
}

export function useExerciseRows(): ExerciseRow[] {
  const { sessions, nameOf, groupOf } = useSessions();
  return useMemo(() => {
    const m = new Map<string, ExerciseRow & { lastDate: number; allSets: { weight: number; reps: number }[] }>();
    for (const s of sessions) {
      for (const l of s.logs) {
        if (!l.sets.length) continue;
        const name = nameOf(l);
        const key = exerciseKey(name);
        const row = m.get(key) ?? {
          key,
          name,
          group: groupOf(l),
          sessions: 0,
          last: null,
          maxWeight: 0,
          best1RM: 0,
          lastDate: 0,
          allSets: [],
        };
        row.sessions++;
        row.allSets.push(...l.sets);
        if (s.date > row.lastDate) {
          row.lastDate = s.date;
          const t = topSet(l.sets);
          row.last = t ? { weight: t.weight, reps: t.reps } : null;
          row.name = name;
        }
        m.set(key, row);
      }
    }
    return [...m.values()].map(({ lastDate: _d, allSets, ...r }) => {
      const rec = computeRecords(allSets);
      return { ...r, maxWeight: rec.maxWeight, best1RM: rec.best1RM };
    });
  }, [sessions, nameOf, groupOf]);
}

function ExercisesTab() {
  const navigate = useNavigate();
  const rows = useExerciseRows();
  const groups = useMemo(() => sortGroups([...new Set(rows.map((r) => r.group))]), [rows]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (rows.length === 0) return <NoData />;

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g).sort((a, b) => b.sessions - a.sessions);
        const isOpen = open[g] ?? true;
        return (
          <section key={g} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left"
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: groupColor(g) }} aria-hidden />
              <span className="flex-1 text-base font-semibold text-fg">{g}</span>
              <span className="text-sm text-fg-3">{list.length}</span>
              <ChevronDown className={cn('h-5 w-5 text-fg-3 transition-transform', isOpen && 'rotate-180')} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="divide-y divide-line-subtle border-t border-line-subtle"
                >
                  {list.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => navigate(`/history/exercise/${encodeURIComponent(r.key)}`)}
                        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-fg">{r.name}</span>
                          <span className="block text-sm text-fg-3">
                            {r.sessions} sessioni · ultimo {r.last ? `${formatKg(r.last.weight, 2)}×${r.last.reps}` : '—'}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-base font-bold text-fg">{formatKg(r.maxWeight, 2)} kg</span>
                          <span className="block text-xs text-fg-3">1RM ~{r.best1RM}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 text-fg-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl text-fg">{value}</div>
      {sub && <div className="text-sm text-fg-3">{sub}</div>}
    </Card>
  );
}

function AnalyticsTab() {
  const navigate = useNavigate();
  const { sessions, nameOf, groupOf } = useSessions();
  const volume = useMemo(() => weeklyVolumeByGroup(sessions, 8, groupOf), [sessions, groupOf]);
  const tonnage = useMemo(() => weeklyTonnage(sessions, 12), [sessions]);
  const perDay = useMemo(() => sessionsPerDay(sessions), [sessions]);
  const prs = useMemo(() => recentPRs(sessions, 30, nameOf), [sessions, nameOf]);
  const lifetime = useMemo(() => sessions.reduce((a, s) => a + sessionTonnage(s), 0), [sessions]);
  const totalSets = useMemo(() => sessions.reduce((a, s) => a + sessionSetCount(s), 0), [sessions]);
  const streak = useMemo(() => weekStreak(sessions), [sessions]);

  if (sessions.length === 0) return <NoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard icon={<Dumbbell className="h-3.5 w-3.5" aria-hidden />} label="Sessioni" value={String(sessions.length)} sub={`${totalSets} serie`} />
        <StatCard icon={<Layers className="h-3.5 w-3.5" aria-hidden />} label="Volume" value={formatTonnage(lifetime)} sub="totale" />
        <StatCard icon={<Flame className="h-3.5 w-3.5" aria-hidden />} label="Streak" value={String(streak)} sub={streak === 1 ? 'settimana' : 'settimane'} />
      </div>

      <Card className="p-4">
        <h2 className="section-title">Volume settimanale per gruppo (kg)</h2>
        <GroupVolumeChart data={volume.data} groups={volume.groups} />
      </Card>

      <Card className="p-4">
        <h2 className="section-title">Tonnellaggio totale per settimana</h2>
        <TonnageChart data={tonnage} />
      </Card>

      <Card className="p-4">
        <h2 className="section-title">Frequenza — ultimi 90 giorni</h2>
        <HeatmapCalendar counts={perDay} days={90} />
      </Card>

      <Card className="p-4">
        <h2 className="section-title">PR recenti (30 giorni)</h2>
        {prs.length === 0 ? (
          <p className="text-base text-fg-3">Nessun PR negli ultimi 30 giorni. Si spinge! 💪</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {prs.slice(0, 12).map((p, i) => (
              <li key={`${p.sessionId}-${i}`}>
                <button
                  type="button"
                  onClick={() => navigate(`/history/exercise/${encodeURIComponent(exerciseKey(p.name))}`)}
                  className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left"
                >
                  <Trophy className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-fg">{p.name}</span>
                    <span className="block text-sm text-fg-3">{formatRelativeDay(p.date)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-base font-bold text-fg">
                      {formatKg(p.set.weight, 2)}×{p.set.reps}
                    </span>
                    <span className="block text-xs text-fg-3">1RM ~{epley1RM(p.set.weight, p.set.reps)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
