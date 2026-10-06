import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Copy, Layers, Scale, Share2, Trash2, Trophy } from 'lucide-react';
import { renderShareCard, shareImage } from '@/lib/share-card';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { epley1RM, exerciseKey, formatKg, formatTonnage, groupColor, logVolume, sessionTonnage } from '@/lib/analytics';
import { formatDuration, formatLongDate, formatShortDate } from '@/lib/date-utils';
import { WorkoutRecapForm } from '@/components/coach/Recaps';
import { settle } from '@/lib/firestore';

export default function HistorySession() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { sessions, byId, nameOf, groupOf, remove, duplicate, save } = useSessions();
  const { getDay } = useSchedule();
  const [confirm, setConfirm] = useState(false);
  const s = byId.get(id);

  if (!s) {
    return (
      <div>
        <TopBar title="Sessione" back="/training?tab=sessions" />
        <EmptyState title="Sessione non trovata" action={<Button onClick={() => navigate('/training?tab=sessions')}>Torna allo storico</Button>} />
      </div>
    );
  }

  const day = getDay(s.dayId);
  // sessione precedente dello stesso giorno della scheda (per il confronto)
  const prev = sessions.filter((x) => x.dayId === s.dayId && x.date < s.date).sort((a, b) => b.date - a.date)[0];
  const prevLog = (name: string) => {
    for (const x of sessions.filter((x) => x.date < s.date).sort((a, b) => b.date - a.date)) {
      const l = x.logs.find((ll) => exerciseKey(nameOf(ll)) === exerciseKey(name) && ll.sets.length);
      if (l) return { log: l, date: x.date };
    }
    return null;
  };
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const prCount = s.logs.reduce((a, l) => a + l.sets.filter((x) => x.isPersonalRecord).length, 0);

  return (
    <div>
      <TopBar
        title={`${day?.name ?? 'Sessione'} · ${day?.subtitle ?? ''}`}
        subtitle={formatLongDate(s.date)}
        back="/training?tab=sessions"
        right={
          <>
            <IconButton
              label="Condividi immagine"
              onClick={async () => {
                try {
                  const blob = await renderShareCard(s, day?.name ?? 'Allenamento', day?.subtitle ?? '', nameOf);
                  const how = await shareImage(blob, `vulcanlift-${new Date(s.date).toISOString().slice(0, 10)}.png`);
                  if (how === 'downloaded') toast.success('Immagine salvata');
                } catch (e) {
                  if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Condivisione non riuscita');
                }
              }}
            >
              <Share2 className="h-5 w-5" />
            </IconButton>
            <IconButton
              label="Duplica sessione"
              onClick={() => duplicate(s).then(() => toast.success('Sessione duplicata con data odierna'))}
            >
              <Copy className="h-5 w-5" />
            </IconButton>
            <IconButton label="Elimina sessione" onClick={() => setConfirm(true)} className="-mr-2 text-danger">
              <Trash2 className="h-5 w-5" />
            </IconButton>
          </>
        }
      />
      <div className="page space-y-3 pt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini icon={<Clock className="h-3.5 w-3.5" />} label="Durata" value={formatDuration(s.duration)} />
          <Mini icon={<Layers className="h-3.5 w-3.5" />} label="Volume" value={formatTonnage(sessionTonnage(s))} />
          <Mini icon={<Trophy className="h-3.5 w-3.5" />} label="PR" value={String(prCount)} />
          <Mini icon={<Scale className="h-3.5 w-3.5" />} label="Peso corp." value={s.bodyweightSnapshot ? `${formatKg(s.bodyweightSnapshot)} kg` : '—'} />
        </div>
        {s.deload && <Chip tone="info">Settimana di deload</Chip>}
        {prev && (
          <Card className="border-violet-500/30 p-4">
            <div className="section-title !mb-1">Rispetto alla volta prima ({formatShortDate(prev.date)})</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Volume', pct(sessionTonnage(s), sessionTonnage(prev))],
                ['Durata', s.duration && prev.duration ? pct(s.duration, prev.duration) : null],
                ['Serie', pct(s.logs.reduce((a, l) => a + l.sets.length, 0), prev.logs.reduce((a, l) => a + l.sets.length, 0))],
              ].map(([label, v]) => (
                <div key={String(label)} className="rounded-md bg-surface-2 py-2">
                  <Delta v={v as number | null} />
                  <div className="text-xs uppercase text-fg-3">{label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card className="p-4">
          <div className="section-title">Il tuo resoconto per il coach</div>
          {s.recap ? (
            <div className="space-y-1 text-base text-fg-2">
              <div>
                ⭐ Voto <strong className="text-fg">{s.recap.rating}/5</strong> · ⚡ Energia <strong className="text-fg">{s.recap.energy}/5</strong>
              </div>
              {s.recap.pain.length > 0 && <div>🩹 Fastidi: {s.recap.pain.join(', ')}</div>}
              {s.recap.note && <p className="whitespace-pre-wrap">📝 {s.recap.note}</p>}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-fg-3">Non l'hai compilato: puoi farlo ora, il coach lo userà nelle prossime analisi.</p>
              <WorkoutRecapForm onSend={(r) => settle(save({ ...s, recap: r }))} />
            </>
          )}
        </Card>
        {s.notes && (
          <Card className="p-4">
            <div className="section-title">Note</div>
            <p className="whitespace-pre-wrap text-base text-fg-2">{s.notes}</p>
          </Card>
        )}

        {s.logs.map((l, i) => {
          const name = nameOf(l);
          const group = groupOf(l);
          return (
            <Card key={`${l.exerciseId}-${i}`} className="overflow-hidden">
              <button
                type="button"
                onClick={() => navigate(`/history/exercise/${encodeURIComponent(exerciseKey(name))}`)}
                className="flex w-full items-center justify-between gap-2 px-4 pt-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold text-fg">{name}</span>
                  <span className="mt-1 flex gap-1.5">
                    <Chip color={groupColor(group)}>{group}</Chip>
                    {l.extra && <Chip tone="info">Extra</Chip>}
                  </span>
                </span>
                <span className="text-right text-sm text-fg-3">
                  Volume
                  <span className="block text-base font-bold text-fg">{formatTonnage(logVolume(l))}</span>
                </span>
              </button>
              {(() => {
                const p = prevLog(name);
                if (!p) return null;
                const work = p.log.sets.filter((x) => x.type !== 'warmup');
                return (
                  <div className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-md bg-violet-500/10 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-fg-2">
                      Volta prima ({formatShortDate(p.date)}): {work.map((x) => `${formatKg(x.weight, 2)}×${x.reps}`).join(', ')}
                    </span>
                    <Delta v={pct(logVolume(l), logVolume(p.log))} small />
                  </div>
                );
              })()}
              <table className="mt-3 w-full text-base">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase text-fg-3">
                    <th className="py-2 pl-4 text-left font-semibold">Set</th>
                    <th className="py-2 text-right font-semibold">Kg</th>
                    <th className="py-2 text-right font-semibold">Reps</th>
                    <th className="py-2 text-right font-semibold">RIR</th>
                    <th className="py-2 pr-4 text-right font-semibold">1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {l.sets.map((set, j) => (
                    <tr key={j} className="border-b border-line-subtle last:border-0">
                      <td className="py-2.5 pl-4 text-fg-2">
                        <span className="inline-flex items-center gap-1">
                          {set.type === 'warmup' ? (
                            <span className="font-bold text-warning">W</span>
                          ) : set.type === 'drop' ? (
                            <span className="font-bold text-info">D</span>
                          ) : set.type === 'failure' ? (
                            <span className="font-bold text-danger">F</span>
                          ) : (
                            j + 1 - l.sets.slice(0, j).filter((x) => x.type === 'warmup').length
                          )}
                          {set.isPersonalRecord && <Trophy className="h-4 w-4 text-warning" aria-label="PR" />}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-fg">{formatKg(set.weight, 2)}</td>
                      <td className="py-2.5 text-right font-semibold text-fg">{set.reps}</td>
                      <td className="py-2.5 text-right text-fg-2">{set.rir ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-right text-fg-3">{epley1RM(set.weight, set.reps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Eliminare la sessione?"
        message="L'operazione non può essere annullata."
        confirmLabel="Elimina"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          await remove(s.id);
          toast.success('Sessione eliminata');
          navigate('/training?tab=sessions', { replace: true });
        }}
      />
    </div>
  );
}

function Delta({ v, small }: { v: number | null; small?: boolean }) {
  if (v == null) return <span className={small ? 'text-sm text-fg-3' : 'text-lg text-fg-3'}>—</span>;
  return (
    <span className={`${small ? 'shrink-0 text-sm' : 'text-lg'} font-bold ${v > 0 ? 'text-accent-400' : v < 0 ? 'text-danger' : 'text-fg-2'}`}>
      {v > 0 ? '▲ +' : v < 0 ? '▼ ' : '= '}
      {v}%
    </span>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-xs uppercase text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg text-fg">{value}</div>
    </Card>
  );
}
