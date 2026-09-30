import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, Gauge, Repeat, Weight } from 'lucide-react';
import { useSessions } from '@/hooks/use-sessions';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressionChart } from '@/components/charts/ProgressionChart';
import { VolumeChart } from '@/components/charts/VolumeChart';
import { computeRecords, epley1RM, exerciseHistory, exerciseKey, formatKg, groupColor } from '@/lib/analytics';
import { formatDayMonth, formatShortDate } from '@/lib/date-utils';

export default function HistoryExercise() {
  const { key: rawKey = '' } = useParams();
  const key = decodeURIComponent(rawKey);
  const navigate = useNavigate();
  const { sessions, nameOf, groupOf } = useSessions();

  const history = useMemo(() => exerciseHistory(sessions, key, nameOf), [sessions, key, nameOf]);
  const meta = useMemo(() => {
    for (const s of sessions) for (const l of s.logs) if (exerciseKey(nameOf(l)) === key) return { name: nameOf(l), group: groupOf(l) };
    return null;
  }, [sessions, key, nameOf, groupOf]);

  const allSets = useMemo(() => history.flatMap((h) => h.sets), [history]);
  const records = useMemo(() => computeRecords(allSets), [allSets]);

  if (!meta || history.length === 0) {
    return (
      <div>
        <TopBar title="Esercizio" back />
        <EmptyState
          illustration="chart"
          title="Nessun dato"
          description="Questo esercizio non ha ancora serie registrate."
          action={<Button onClick={() => navigate('/history?tab=exercises')}>Tutti gli esercizi</Button>}
        />
      </div>
    );
  }

  const last = history[history.length - 1];
  const current1RM = last.best1RM;
  const repsAtMax = records.repsAtWeight.get(records.maxWeight) ?? 0;
  // Miglior set per reps: il set con più reps al peso più alto possibile
  const bestReps = allSets.reduce((b, s) => (s.reps > b.reps || (s.reps === b.reps && s.weight > b.weight) ? s : b), allSets[0]);

  const progression = history.map((h) => ({
    date: h.date,
    weight: h.top?.weight ?? 0,
    reps: h.top?.reps ?? 0,
    e1rm: h.best1RM,
  }));
  const volumes = history.map((h) => ({ label: formatDayMonth(h.date), title: formatShortDate(h.date), value: Math.round(h.volume) }));

  return (
    <div>
      <TopBar title={meta.name} subtitle={`${history.length} sessioni`} back />
      <div className="page space-y-3 pt-4">
        <div className="flex gap-2">
          <Chip color={groupColor(meta.group)}>{meta.group}</Chip>
        </div>

        <Card variant="elevated" className="p-5">
          <div className="text-xs uppercase tracking-wider text-fg-3">1RM stimato attuale (Epley)</div>
          <div className="mt-1 text-4xl text-fg">
            {current1RM} <span className="text-xl text-fg-3">kg</span>
          </div>
          <div className="text-sm text-fg-3">
            dal top set {last.top ? `${formatKg(last.top.weight, 2)}×${last.top.reps}` : '—'} · {formatShortDate(last.date)}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <PRBadge icon={<Weight className="h-4 w-4" />} label="Peso max" value={`${formatKg(records.maxWeight, 2)}`} sub={`×${repsAtMax}`} />
          <PRBadge icon={<Repeat className="h-4 w-4" />} label="Reps max" value={`${bestReps.reps}`} sub={`@ ${formatKg(bestReps.weight, 2)}kg`} />
          <PRBadge icon={<Gauge className="h-4 w-4" />} label="1RM max" value={`${records.best1RM}`} sub="kg stimati" />
        </div>

        {history.length > 1 ? (
          <>
            <Card className="p-4">
              <h2 className="section-title">Progressione carichi</h2>
              <ProgressionChart data={progression} />
            </Card>
            <Card className="p-4">
              <h2 className="section-title">Volume per sessione (kg)</h2>
              <VolumeChart data={volumes} valueLabel="Volume" />
            </Card>
          </>
        ) : (
          <Card className="p-4 text-base text-fg-3">I grafici appariranno dalla seconda sessione.</Card>
        )}

        <Card className="overflow-hidden">
          <h2 className="section-title px-4 pt-4">Storico completo</h2>
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-line-subtle text-xs uppercase text-fg-3">
                <th className="py-2 pl-4 text-left font-semibold">Data</th>
                <th className="py-2 text-left font-semibold">Serie</th>
                <th className="py-2 pr-4 text-right font-semibold">1RM</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr
                  key={`${h.sessionId}-${h.date}`}
                  className="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-surface-2"
                  onClick={() => navigate(`/history/session/${h.sessionId}`)}
                >
                  <td className="whitespace-nowrap py-2.5 pl-4 align-top text-fg-2">{formatDayMonth(h.date)}</td>
                  <td className="py-2.5 text-sm text-fg">
                    {h.sets.map((s, i) => (
                      <span key={i} className="mr-2 inline-flex items-center gap-0.5 whitespace-nowrap">
                        {formatKg(s.weight, 2)}×{s.reps}
                        {s.rir != null && <span className="text-fg-3">@{s.rir}</span>}
                        {s.isPersonalRecord && <Award className="h-3.5 w-3.5 text-warning" aria-label="PR" />}
                      </span>
                    ))}
                  </td>
                  <td className="py-2.5 pr-4 text-right align-top font-semibold text-fg">
                    {Math.max(...h.sets.map((s) => epley1RM(s.weight, s.reps)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function PRBadge({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card className="border-warning/20 p-3">
      <div className="flex items-center gap-1 text-xs uppercase text-warning">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl text-fg">{value}</div>
      <div className="text-sm text-fg-3">{sub}</div>
    </Card>
  );
}
