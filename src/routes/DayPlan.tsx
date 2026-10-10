import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Clock, Gauge, Pencil, Play, StickyNote } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { ExerciseDemo } from '@/components/library/ExerciseDemo';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { useActiveSession } from '@/hooks/use-active-session';
import { groupColor } from '@/lib/analytics';
import { effortTarget, scaleLabel } from '@/lib/effort';
import { formatRelativeDay } from '@/lib/date-utils';
import { sessionMinutes } from '@/lib/program-generator';
import { libraryIdOf } from '@/lib/seed-data';

/** Scheda di un giorno da consultare senza far partire l'allenamento. */
export default function DayPlan() {
  const { dayId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getDay } = useSchedule();
  const { sessions } = useSessions();
  const { settings } = useSettings();
  const meso = useMesocycle();
  const { activeSession, start } = useActiveSession();
  const [starting, setStarting] = useState(false);
  const day = getDay(dayId);
  const scale = settings.effortScale ?? 'rpe';

  if (!day)
    return (
      <div className="page" style={{ paddingTop: 'calc(var(--safe-top) + 24px)' }}>
        <EmptyState title="Giorno non trovato" description="Torna alla scheda e scegli un giorno." action={<Button onClick={() => navigate('/training')}>Scheda</Button>} />
      </div>
    );

  const last = sessions.find((s) => s.dayId === day.id);
  const running = activeSession?.dayId === day.id;
  const begin = async () => {
    if (activeSession && !running) {
      toast.info('Hai già un allenamento in corso: riprendilo o terminalo dalla Home');
      return;
    }
    if (!running) {
      setStarting(true);
      try {
        await start(day, meso.isDeloadWeek);
      } catch {
        toast.error('Impossibile avviare la sessione');
        setStarting(false);
        return;
      }
    }
    navigate(`/session/${day.id}`);
  };

  return (
    <div style={{ paddingBottom: 'calc(var(--safe-bottom) + 110px)' }}>
      <header className="border-b border-line-subtle px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        <button type="button" onClick={() => navigate(-1)} className="flex h-9 items-center gap-1 text-sm font-semibold text-accent-400">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Scheda
        </button>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-fg">{day.name}</h1>
        <p className="text-base text-fg-2">
          {day.subtitle} · {day.exercises.length} esercizi · ~{sessionMinutes(day)} min{last ? ` · ultima volta ${formatRelativeDay(last.date).toLowerCase()}` : ''}
        </p>
      </header>

      <div className="mx-auto max-w-2xl space-y-2 px-4 pt-4">
        {day.exercises.map((ex, i) => {
          const lib = ex.libraryId ?? libraryIdOf(ex);
          return (
            <Card key={ex.id} className="flex gap-3 overflow-hidden p-3">
              <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: groupColor(ex.group) }} aria-hidden />
              {lib && <ExerciseDemo id={lib} animate={false} className="h-14 w-16 shrink-0 rounded-md" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-fg-3">
                  {i + 1} · {ex.group}
                </div>
                <div className="text-base font-semibold text-fg">{ex.name}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip>
                    {ex.sets}×{ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}-${ex.repMax}`}
                  </Chip>
                  <Chip icon={<Gauge className="h-3 w-3" aria-hidden />}>
                    {scaleLabel(scale)} {effortTarget(ex.rirTarget, scale)}
                  </Chip>
                  <Chip icon={<Clock className="h-3 w-3" aria-hidden />}>{ex.rest}</Chip>
                </div>
                {ex.notes && (
                  <p className="mt-1.5 flex gap-1.5 text-sm text-fg-2">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" aria-hidden />
                    <span className="whitespace-pre-wrap">{ex.notes}</span>
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle bg-base/90 px-4 pt-3 backdrop-blur-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button size="lg" variant="secondary" className="shrink-0" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate('/schedule')}>
            Modifica
          </Button>
          <Button size="lg" className="flex-1" loading={starting} icon={<Play className="h-4 w-4 fill-current" />} onClick={() => void begin()}>
            {running ? 'Riprendi' : 'Inizia'}
          </Button>
        </div>
      </div>
    </div>
  );
}
