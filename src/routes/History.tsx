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
import { HelpTip, SectionTitle } from '@/components/ui/Help';
import { cn } from '@/lib/cn';

export type HistoryTab = 'sessions' | 'exercises' | 'analytics';

/** Storico: dentro la tab Allenamento ogni sezione viene mostrata direttamente (prop `section`). */
export default function History({ embedded, section }: { embedded?: boolean; section?: HistoryTab } = {}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: HistoryTab = section ?? (raw === 'exercises' || raw === 'analytics' ? raw : 'sessions');
  const { loading } = useSessions();

  return (
    <div>
      {!embedded && <TopBar title="Storico" large />}
      <div className={embedded ? '' : 'page pt-3'}>
        {!section && (
          <Segmented<HistoryTab>
            label="Sezione storico"
            value={tab}
            onChange={(t) => setParams({ tab: t }, { replace: true })}
            options={[
              { value: 'sessions', label: 'Sessioni' },
              { value: 'exercises', label: 'Esercizi' },
              { value: 'analytics', label: 'Analytics' },
            ]}
          />
        )}
        <div className={section ? '' : 'mt-4'}>
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
      <p className="mb-3 flex items-start gap-2 text-sm text-fg-3">
        <span className="flex-1">Tocca una sessione per i dettagli e il confronto. Scorri a sinistra per duplicarla o eliminarla.</span>
        <HelpTip id="train-sessions" />
      </p>
      <ul className="space-y-2">
        {sessions.map((s, idx) => {
          const day = getDay(s.dayId);
          const prs = s.logs.reduce((a, l) => a + l.sets.filter((x) => x.isPersonalRecord).length, 0);
          const prev = sessions.slice(idx + 1).find((x) => x.dayId === s.dayId);
          const delta = prev && sessionTonnage(prev) > 0 ? Math.round(((sessionTonnage(s) - sessionTonnage(prev)) / sessionTonnage(prev)) * 100) : null;
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
                    {delta != null && (
                      <span className={cn('font-semibold', delta > 0 ? 'text-accent-400' : delta < 0 ? 'text-danger' : 'text-fg-3')}>
                        {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}
                        {delta}% vs volta prima
                      </span>
                    )}
                  </div>
                  {s.recap ? (
                    <div className="mt-2 truncate text-sm text-fg-2">
                      ⭐ {s.recap.rating}/5 · ⚡ {s.recap.energy}/5{s.recap.pain.length ? ` · 🩹 ${s.recap.pain.join(', ')}` : ''}
                      {s.recap.note ? ` · “${s.recap.note}”` : ''}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-fg-3">📝 Resoconto non compilato: aprila per aggiungerlo</div>
                  )}
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
  /** top set della volta precedente (per il confronto) */
  prev: { weight: number; reps: number } | null;
  maxWeight: number;
  best1RM: number;
}

export function useExerciseRows(): ExerciseRow[] {
  const { sessions, nameOf, groupOf } = useSessions();
  return useMemo(() => {
    const m = new Map<string, ExerciseRow & { lastDate: number; allSets: { weight: number; reps: number }[]; tops: { date: number; weight: number; reps: number }[] }>();
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
          prev: null,
          maxWeight: 0,
          best1RM: 0,
          lastDate: 0,
          allSets: [],
          tops: [],
        };
        row.sessions++;
        row.allSets.push(...l.sets);
        const tp = topSet(l.sets);
        if (tp) row.tops.push({ date: s.date, weight: tp.weight, reps: tp.reps });
        if (s.date > row.lastDate) {
          row.lastDate = s.date;
          const t = topSet(l.sets);
          row.last = t ? { weight: t.weight, reps: t.reps } : null;
          row.name = name;
        }
        m.set(key, row);
      }
    }
    return [...m.values()].map(({ lastDate: _d, allSets, tops, ...r }) => {
      const rec = computeRecords(allSets);
      const sorted = tops.sort((a, b) => b.date - a.date);
      return { ...r, prev: sorted[1] ? { weight: sorted[1].weight, reps: sorted[1].reps } : null, maxWeight: rec.maxWeight, best1RM: rec.best1RM };
    });
  }, [sessions, nameOf, groupOf]);
}

function Trend({ a, b, unit = '%' }: { a: number; b: number; unit?: string }) {
  if (!(b > 0)) return <span className="text-fg-3">—</span>;
  const v = Math.round(((a - b) / b) * 100);
  return (
    <span className={cn('font-bold', v > 0 ? 'text-accent-400' : v < 0 ? 'text-danger' : 'text-fg-2')}>
      {v > 0 ? '▲ +' : v < 0 ? '▼ ' : '= '}
      {v}
      {unit}
    </span>
  );
}

/** Ultima sessione contro la media di tutte le sessioni, e per ogni gruppo muscolare. */
function useGroupStats() {
  const { sessions, groupOf } = useSessions();
  return useMemo(() => {
    const per = new Map<string, { date: number; volume: number; sets: number }[]>();
    for (const s of sessions) {
      const acc = new Map<string, { volume: number; sets: number }>();
      for (const l of s.logs) {
        const work = l.sets.filter((x) => x.type !== 'warmup');
        if (!work.length) continue;
        const g = groupOf(l);
        const a = acc.get(g) ?? { volume: 0, sets: 0 };
        a.volume += work.reduce((t, x) => t + x.weight * x.reps, 0);
        a.sets += work.length;
        acc.set(g, a);
      }
      for (const [g, a] of acc) per.set(g, [...(per.get(g) ?? []), { date: s.date, ...a }]);
    }
    const out = new Map<string, { last: { volume: number; sets: number; date: number }; avgVolume: number; avgSets: number; count: number }>();
    for (const [g, list] of per) {
      const sorted = list.sort((a, b) => b.date - a.date);
      out.set(g, {
        last: sorted[0],
        avgVolume: sorted.reduce((t, x) => t + x.volume, 0) / sorted.length,
        avgSets: sorted.reduce((t, x) => t + x.sets, 0) / sorted.length,
        count: sorted.length,
      });
    }
    return out;
  }, [sessions, groupOf]);
}

function SummaryCard() {
  const { sessions } = useSessions();
  const last = sessions[0];
  if (!last) return null;
  const avg = (f: (s: Session) => number) => sessions.reduce((t, s) => t + f(s), 0) / sessions.length;
  const sets = (s: Session) => s.logs.reduce((t, l) => t + l.sets.filter((x) => x.type !== 'warmup').length, 0);
  const rated = sessions.filter((s) => s.recap);
  const rows: [string, string, string, React.ReactNode][] = [
    ['Volume', formatTonnage(sessionTonnage(last)), formatTonnage(avg(sessionTonnage)), <Trend a={sessionTonnage(last)} b={avg(sessionTonnage)} />],
    ['Serie', String(sets(last)), avg(sets).toFixed(1), <Trend a={sets(last)} b={avg(sets)} />],
    [
      'Durata',
      formatDuration(last.duration),
      formatDuration(Math.round(avg((s) => s.duration ?? 0))),
      last.duration ? <Trend a={last.duration} b={avg((s) => s.duration ?? 0)} /> : '—',
    ],
    [
      'Voto',
      last.recap ? `${last.recap.rating}/5` : '—',
      rated.length ? `${(rated.reduce((t, s) => t + s.recap!.rating, 0) / rated.length).toFixed(1)}/5` : '—',
      '',
    ],
  ];
  return (
    <Card className="p-4">
      <h2 className="section-title">
        <SectionTitle help="train-exercises">Ultima sessione vs media ({sessions.length} sessioni)</SectionTitle>
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-fg-3">
            <th className="py-1 text-left font-semibold" />
            <th className="py-1 text-right font-semibold">Ultima</th>
            <th className="py-1 text-right font-semibold">Media</th>
            <th className="py-1 text-right font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, a, b, t]) => (
            <tr key={l} className="border-t border-line-subtle">
              <td className="py-2 text-fg-2">{l}</td>
              <td className="py-2 text-right font-semibold text-fg">{a}</td>
              <td className="py-2 text-right text-fg-2">{b}</td>
              <td className="py-2 text-right">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ExercisesTab() {
  const navigate = useNavigate();
  const rows = useExerciseRows();
  const groupStats = useGroupStats();
  const groups = useMemo(() => sortGroups([...new Set(rows.map((r) => r.group))]), [rows]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (rows.length === 0) return <NoData />;

  return (
    <div className="space-y-2">
      <SummaryCard />
      <h2 className="section-title !mb-0 pt-2">Per gruppo muscolare</h2>
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
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-fg">{g}</span>
                {groupStats.get(g) && (
                  <span className="block text-xs text-fg-3">
                    Ultima {formatTonnage(groupStats.get(g)!.last.volume)} · media {formatTonnage(groupStats.get(g)!.avgVolume)} ·{' '}
                    <Trend a={groupStats.get(g)!.last.volume} b={groupStats.get(g)!.avgVolume} />
                  </span>
                )}
              </span>
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
                            {r.prev ? ` · prima ${formatKg(r.prev.weight, 2)}×${r.prev.reps} ` : ''}
                            {r.last && r.prev && <Trend a={epley1RM(r.last.weight, r.last.reps)} b={epley1RM(r.prev.weight, r.prev.reps)} />}
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
