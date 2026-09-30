import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Check, ChevronDown, Clock, Disc3, Flame, Minus, Plus, StickyNote, Target, Trash2 } from 'lucide-react';
import type { DraftExercise, DraftSet, Exercise, Suggestion } from '@/types';
import { formatKg, groupColor } from '@/lib/analytics';
import { isCompound, parseRirNumbers, warmupSets } from '@/lib/progression';
import { parseNum } from '@/hooks/use-active-session';
import { cn } from '@/lib/cn';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/Button';
import { SET_GRID, SetRow } from './SetRow';
import { ExerciseDemo } from '../library/ExerciseDemo';
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
  /** Serie allenanti dell'ultima volta (per la colonna "Prec."). */
  prevSets: { weight: string; reps: number }[];
  /** Obiettivo di reps per ciascuna serie allenante. */
  repTargets: string[];
  onCycleType: (setIdx: number) => void;
  onAddWarmups: (sets: { weight: number; reps: number }[]) => void;
  onPlates: (weight: number | null) => void;
  onNote: () => void;
  onSwap: () => void;
  libraryId?: string;
  onInfo: () => void;
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
  prevSets,
  repTargets,
  onCycleType,
  onAddWarmups,
  onPlates,
  onNote,
  onSwap,
  libraryId,
  onInfo,
}: ExerciseCardProps) {
  const color = groupColor(draft.group);
  const doneCount = draft.sets.filter((s) => s.done).length;
  const allDone = draft.sets.length > 0 && doneCount === draft.sets.length;
  const weightPh = suggestion.weight != null ? formatKg(suggestion.weight, 2) : 'kg';
  const lastSet = draft.sets[draft.sets.length - 1];
  // Numerazione delle sole serie allenanti (le W di riscaldamento non contano)
  const workingIdx: number[] = [];
  let n = 0;
  for (const st of draft.sets) workingIdx.push(st.type === 'warmup' ? -1 : n++);
  const workWeight = parseNum(draft.sets.find((st) => st.type !== 'warmup' && st.weight)?.weight ?? '') ?? suggestion.weight;
  const hasWarmups = draft.sets.some((st) => st.type === 'warmup');
  const canWarmup = !hasWarmups && isCompound(exercise) && workWeight != null && workWeight >= 20;

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
        <div className="flex items-start gap-3">
          {libraryId && (
            <button
              type="button"
              onClick={onInfo}
              aria-label={`Come si esegue: ${draft.name}`}
              className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-line"
            >
              <ExerciseDemo id={libraryId} className="h-16 w-20" />
              <span className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[10px] font-bold uppercase text-white">
                Demo
              </span>
            </button>
          )}
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

        {exercise.notes && (
          <button
            type="button"
            onClick={onNote}
            className="mt-2 flex w-full items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-left text-sm text-fg-2"
          >
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" aria-hidden />
            <span className="whitespace-pre-wrap">{exercise.notes}</span>
          </button>
        )}

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {canWarmup && (
            <ToolBtn icon={<Flame className="h-4 w-4" />} onClick={() => workWeight != null && onAddWarmups(warmupSets(workWeight))}>
              Riscaldamento
            </ToolBtn>
          )}
          <ToolBtn icon={<Disc3 className="h-4 w-4" />} onClick={() => onPlates(workWeight)}>
            Dischi
          </ToolBtn>
          <ToolBtn icon={<StickyNote className="h-4 w-4" />} onClick={onNote}>
            {exercise.notes ? 'Nota' : 'Aggiungi nota'}
          </ToolBtn>
          <ToolBtn icon={<ArrowLeftRight className="h-4 w-4" />} onClick={onSwap}>
            Sostituisci
          </ToolBtn>
        </div>

        <div className="mt-3">
          <SuggestionBox suggestion={suggestion} lastText={lastText} />
        </div>

        <div className={cn(SET_GRID, 'mt-3 px-1 text-center text-xs uppercase tracking-wide text-fg-3')} aria-hidden>
          <span>Set</span>
          <span>Prec.</span>
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
                  workingNumber={workingIdx[i] + 1}
                  prev={workingIdx[i] >= 0 ? prevSets[workingIdx[i]] : undefined}
                  onUsePrev={() => {
                    const p = workingIdx[i] >= 0 ? prevSets[workingIdx[i]] : undefined;
                    if (p) onSetChange(i, { weight: p.weight, reps: String(p.reps) });
                  }}
                  onCycleType={() => onCycleType(i)}
                  set={s}
                  exerciseName={draft.name}
                  weightPlaceholder={s.type === 'warmup' ? 'kg' : weightPh}
                  repsPlaceholder={
                    s.type === 'warmup'
                      ? ''
                      : (repTargets[workingIdx[i]] ?? `${exercise.repMin}-${exercise.repMax}`)
                  }
                  rirPlaceholder={s.type === 'warmup' ? '' : rirForSet(exercise.rirTarget, Math.max(0, workingIdx[i]), n)}
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

function ToolBtn({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-sm font-semibold text-fg-2 transition-colors hover:text-fg"
    >
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}
