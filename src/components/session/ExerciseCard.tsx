import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock, Minus, Plus, Target, Trash2 } from 'lucide-react';
import type { DraftExercise, DraftSet, Exercise, Suggestion } from '@/types';
import { formatKg, groupColor } from '@/lib/analytics';
import { parseRirNumbers } from '@/lib/progression';
import { cn } from '@/lib/cn';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/Button';
import { SetRow } from './SetRow';
import { SuggestionBox } from './SuggestionBox';

/** RIR previsto per la serie i: "2/1/1" → per-serie; "1-2, ult. 0-1" → ultima diversa. */
export function rirForSet(rirTarget: string, i: number, total: number): string {
  const parts = rirTarget.split('/').map((p) => p.trim());
  if (parts.length > 1) return parts[Math.min(i, parts.length - 1)] ?? '';
  const m = rirTarget.match(/^(.*?),\s*ult\.?\s*(.+)$/i);
  if (m) return i === total - 1 ? m[2].trim() : m[1].trim();
  return parseRirNumbers(rirTarget).length ? rirTarget.trim() : '';
}

interface ExerciseCardProps {
  index: number;
  draft: DraftExercise;
  exercise: Exercise;
  suggestion: Suggestion;
  lastText?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetChange: (setIdx: number, patch: Partial<DraftSet>) => void;
  onToggleDone: (setIdx: number) => boolean;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onRemoveExercise?: () => void;
}

export function ExerciseCard({
  index,
  draft,
  exercise,
  suggestion,
  lastText,
  expanded,
  onToggleExpanded,
  onSetChange,
  onToggleDone,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: ExerciseCardProps) {
  const color = groupColor(draft.group);
  const doneCount = draft.sets.filter((s) => s.done).length;
  const allDone = draft.sets.length > 0 && doneCount === draft.sets.length;
  const weightPh = suggestion.weight != null ? formatKg(suggestion.weight, 2) : 'kg';
  const lastSet = draft.sets[draft.sets.length - 1];

  // Riepilogo compatto quando tutte le serie sono completate
  if (allDone && !expanded) {
    return (
      <motion.button
        layout
        type="button"
        onClick={onToggleExpanded}
        className="card flex w-full items-center gap-3 border-success/20 p-4 text-left"
        aria-expanded={false}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-black">
          <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-fg">{draft.name}</span>
          <span className="block truncate text-sm text-fg-3">
            {draft.sets.map((s) => `${s.weight || '–'}×${s.reps || '–'}`).join(' · ')}
          </span>
        </span>
        <ChevronDown className="h-5 w-5 text-fg-3" aria-hidden />
      </motion.button>
    );
  }

  return (
    <motion.section layout className="card overflow-hidden" aria-label={draft.name}>
      <div className="h-1 w-full" style={{ backgroundColor: color, opacity: 0.8 }} aria-hidden />
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-fg-3">
              Esercizio {index + 1} · {doneCount}/{draft.sets.length} serie
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-fg">{draft.name}</h2>
          </div>
          {allDone && (
            <IconButton label="Comprimi esercizio" onClick={onToggleExpanded} className="-mr-2 -mt-1">
              <ChevronDown className="h-5 w-5 rotate-180" />
            </IconButton>
          )}
          {onRemoveExercise && (
            <IconButton label="Rimuovi esercizio" onClick={onRemoveExercise} className="-mr-2 -mt-1">
              <Trash2 className="h-5 w-5" />
            </IconButton>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip color={color}>{draft.group}</Chip>
          <Chip>
            {exercise.sets}×{exercise.repMin}-{exercise.repMax}
          </Chip>
          <Chip icon={<Target className="h-3 w-3" aria-hidden />}>RIR {exercise.rirTarget}</Chip>
          <Chip icon={<Clock className="h-3 w-3" aria-hidden />}>{exercise.rest}</Chip>
          {draft.extra && <Chip tone="info">Extra</Chip>}
        </div>

        {exercise.notes && <p className="mt-2 text-sm text-fg-2">{exercise.notes}</p>}

        <div className="mt-3">
          <SuggestionBox suggestion={suggestion} lastText={lastText} />
        </div>

        <div className="mt-3 grid grid-cols-[36px_1fr_1fr_0.8fr_48px] gap-2 px-1 text-center text-xs uppercase tracking-wide text-fg-3" aria-hidden>
          <span>Set</span>
          <span>Kg</span>
          <span>Reps</span>
          <span>RIR</span>
          <span />
        </div>
        <div className="mt-1 space-y-1">
          <AnimatePresence initial={false}>
            {draft.sets.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <SetRow
                  index={i}
                  set={s}
                  exerciseName={draft.name}
                  weightPlaceholder={weightPh}
                  repsPlaceholder={`${exercise.repMin}-${exercise.repMax}`}
                  rirPlaceholder={rirForSet(exercise.rirTarget, i, draft.sets.length)}
                  onChange={(patch) => onSetChange(i, patch)}
                  onToggleDone={() => onToggleDone(i)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onAddSet}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-sm font-semibold text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
          >
            <Plus className="h-4 w-4" aria-hidden /> Aggiungi serie
          </button>
          {draft.sets.length > 1 && lastSet && !lastSet.done && (
            <button
              type="button"
              onClick={onRemoveSet}
              aria-label="Rimuovi ultima serie"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-line text-fg-3 hover:text-fg',
              )}
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
