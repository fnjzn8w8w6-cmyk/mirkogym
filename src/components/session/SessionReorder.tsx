import { Reorder, useDragControls } from 'framer-motion';
import { CheckCircle2, GripVertical } from 'lucide-react';
import type { DraftExercise } from '@/types';
import { groupColor } from '@/lib/analytics';
import { Button } from '../ui/Button';

/** Riordino degli esercizi durante la sessione: si trascinano dalla maniglia, come nella modifica della scheda. */
export function SessionReorder({
  exercises,
  onReorder,
  onDone,
  onSaveToSchedule,
}: {
  exercises: DraftExercise[];
  onReorder: (list: DraftExercise[]) => void;
  onDone: () => void;
  /** null = nessun esercizio della scheda da riordinare */
  onSaveToSchedule: (() => void) | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-xl font-extrabold uppercase text-fg">Riordina</div>
          <div className="text-sm text-fg-3">Trascina dalla maniglia per spostare un esercizio</div>
        </div>
        <Button size="sm" onClick={onDone}>
          Fatto
        </Button>
      </div>
      <Reorder.Group axis="y" values={exercises} onReorder={onReorder} className="space-y-2">
        {exercises.map((ex) => (
          <Item key={`${ex.exerciseId}-${ex.name}`} ex={ex} />
        ))}
      </Reorder.Group>
      <p className="text-xs text-fg-3">Vale per questa sessione. Le serie già fatte restano con il loro esercizio.</p>
      {onSaveToSchedule && (
        <Button variant="secondary" fullWidth onClick={onSaveToSchedule}>
          Salva questo ordine anche nella scheda
        </Button>
      )}
    </div>
  );
}

function Item({ ex }: { ex: DraftExercise }) {
  const controls = useDragControls();
  const done = ex.sets.filter((s) => s.done).length;
  const all = ex.sets.length > 0 && done === ex.sets.length;
  return (
    <Reorder.Item
      value={ex}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-md border border-line-subtle bg-surface pr-3"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 10 }}
    >
      <button
        type="button"
        aria-label={`Trascina ${ex.name}`}
        onPointerDown={(e) => controls.start(e)}
        className="flex h-16 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-3 active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </button>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: groupColor(ex.group) }} aria-hidden />
      <span className="min-w-0 flex-1 py-2">
        <span className="block truncate text-base font-semibold text-fg">{ex.name}</span>
        <span className="block text-xs text-fg-3">
          {ex.group} · {done}/{ex.sets.length} serie fatte
        </span>
      </span>
      {all && <CheckCircle2 className="h-5 w-5 shrink-0 text-accent-400" aria-label="Completato" />}
    </Reorder.Item>
  );
}
