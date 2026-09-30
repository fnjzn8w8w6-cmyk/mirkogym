import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Check, ChevronDown, CloudUpload, GripVertical, Pencil, Plus } from 'lucide-react';
import type { Day, Exercise } from '@/types';
import { useSchedule } from '@/hooks/use-schedule';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ExerciseEditModal } from '@/components/modals/ExerciseEditModal';
import { settle } from '@/lib/firestore';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';

type SaveState = 'idle' | 'pending' | 'saved';

export default function ScheduleEditor() {
  const { days: remoteDays, save, loading } = useSchedule();
  const [days, setDays] = useState<Day[] | null>(null);
  const [open, setOpen] = useState<string | null>('day1');
  const [editing, setEditing] = useState<{ dayId: string; exercise: Exercise; isNew: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<{ dayId: string; exercise: Exercise } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<number | null>(null);
  const latest = useRef<Day[] | null>(null);

  // Copia locale inizializzata una volta: evita che gli snapshot remoti sovrascrivano l'editing
  useEffect(() => {
    if (!days && remoteDays.length) setDays(remoteDays);
  }, [days, remoteDays]);

  // Flush del salvataggio pendente all'uscita
  useEffect(
    () => () => {
      if (timer.current && latest.current) {
        window.clearTimeout(timer.current);
        void settle(save(latest.current));
      }
    },
    [save],
  );

  const commit = (next: Day[]) => {
    setDays(next);
    latest.current = next;
    setSaveState('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      timer.current = null;
      await settle(save(next));
      setSaveState('saved');
    }, 700);
  };

  const updateDay = (dayId: string, fn: (d: Day) => Day) => days && commit(days.map((d) => (d.id === dayId ? fn(d) : d)));

  if (loading || !days) return <PageSkeleton />;

  return (
    <div>
      <TopBar
        title="Editor scheda"
        back
        right={
          <span className="flex items-center gap-1 text-sm text-fg-3" role="status" aria-live="polite">
            {saveState === 'pending' ? (
              <>
                <CloudUpload className="h-4 w-4 animate-pulse" aria-hidden /> Salvataggio…
              </>
            ) : saveState === 'saved' ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden /> Salvato
              </>
            ) : null}
          </span>
        }
      />
      <div className="page space-y-2 pt-4">
        <p className="mb-2 text-sm text-fg-3">
          Le modifiche si salvano automaticamente. Trascina la maniglia <GripVertical className="inline h-4 w-4" aria-hidden /> per
          riordinare.
        </p>
        {days.map((d) => {
          const isOpen = open === d.id;
          return (
            <Card key={d.id} className="overflow-hidden">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : d.id)}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-2 font-bold text-fg-2">{d.order}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-fg">{d.name}</span>
                  <span className="block truncate text-sm text-fg-3">
                    {d.subtitle} · {d.exercises.length} esercizi
                  </span>
                </span>
                <ChevronDown className={cn('h-5 w-5 text-fg-3 transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen && (
                <div className="border-t border-line-subtle p-4">
                  <label className="block">
                    <span className="section-title block">Sottotitolo</span>
                    <input
                      value={d.subtitle}
                      onChange={(e) => updateDay(d.id, (x) => ({ ...x, subtitle: e.target.value }))}
                      className="h-12 w-full rounded-md border border-line bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent-500"
                    />
                  </label>
                  <Reorder.Group
                    axis="y"
                    values={d.exercises}
                    onReorder={(list: Exercise[]) => updateDay(d.id, (x) => ({ ...x, exercises: list }))}
                    className="mt-4 space-y-2"
                  >
                    {d.exercises.map((e) => (
                      <ExerciseItem key={e.id} exercise={e} onEdit={() => setEditing({ dayId: d.id, exercise: e, isNew: false })} />
                    ))}
                  </Reorder.Group>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        dayId: d.id,
                        isNew: true,
                        exercise: {
                          id: `${d.id.replace('day', 'd')}x${Date.now().toString(36)}`,
                          name: '',
                          group: d.exercises[0]?.group ?? 'Dorso',
                          sets: 3,
                          repMin: 8,
                          repMax: 12,
                          rirTarget: '1-2',
                          rest: '90 sec',
                        },
                      })
                    }
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line text-base font-semibold text-fg-2 hover:text-fg"
                  >
                    <Plus className="h-5 w-5" aria-hidden /> Aggiungi esercizio
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ExerciseEditModal
        open={Boolean(editing)}
        exercise={editing?.exercise ?? null}
        onClose={() => setEditing(null)}
        onDelete={
          editing && !editing.isNew
            ? () => {
                setToDelete({ dayId: editing.dayId, exercise: editing.exercise });
                setEditing(null);
              }
            : undefined
        }
        onSave={(ex) => {
          if (!editing) return;
          updateDay(editing.dayId, (d) => ({
            ...d,
            exercises: editing.isNew ? [...d.exercises, ex] : d.exercises.map((x) => (x.id === ex.id ? ex : x)),
          }));
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminare l'esercizio?"
        message={`"${toDelete?.exercise.name ?? ''}" verrà rimosso dalla scheda. Lo storico delle sessioni resta invariato.`}
        confirmLabel="Elimina"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) updateDay(toDelete.dayId, (d) => ({ ...d, exercises: d.exercises.filter((x) => x.id !== toDelete.exercise.id) }));
          setToDelete(null);
        }}
      />
    </div>
  );
}

function ExerciseItem({ exercise, onEdit }: { exercise: Exercise; onEdit: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={exercise}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-md border border-line-subtle bg-surface-2 pr-1"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 10 }}
    >
      <button
        type="button"
        aria-label={`Trascina ${exercise.name}`}
        onPointerDown={(e) => controls.start(e)}
        className="flex h-14 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-3 active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" onClick={onEdit} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-2 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-fg">{exercise.name}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            <Chip color={groupColor(exercise.group)}>{exercise.group}</Chip>
            <Chip>
              {exercise.sets}×{exercise.repMin}-{exercise.repMax}
            </Chip>
            <Chip>RIR {exercise.rirTarget}</Chip>
          </span>
        </span>
        <Pencil className="mr-2 h-4 w-4 shrink-0 text-fg-3" aria-hidden />
      </button>
    </Reorder.Item>
  );
}
