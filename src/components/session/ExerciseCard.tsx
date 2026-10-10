import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Check, ChevronDown, Clock, Flame, Gauge, Minus, Plus, SlidersHorizontal, StickyNote, Trash2 } from 'lucide-react';
import type { DraftExercise, DraftSet, Exercise, Suggestion } from '@/types';
import { formatKg, groupColor } from '@/lib/analytics';
import { isCompound, parseRirNumbers, warmupSets } from '@/lib/progression';
import { parseNum } from '@/hooks/use-active-session';
import { cn } from '@/lib/cn';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/Button';
import { SET_GRID, SetRow } from './SetRow';
import { ExerciseDemo } from '../library/ExerciseDemo';
import { HelpTip, NewBadge } from '@/components/ui/Help';
import { effortTarget, scaleLabel, type EffortScale } from '@/lib/effort';
import { SuggestionBox } from './SuggestionBox';
import { EffortSheet, type EffortSetInfo } from './EffortSheet';
import { useState, type ReactNode } from 'react';

/** Confronto diretto con l'ultima volta che hai fatto l'esercizio. */
function PrevCompare({ prevSets, lastDate, sets, lastText, scale }: { prevSets: { weight: string; reps: number }[]; lastDate?: number; sets: DraftSet[]; lastText?: string; scale: EffortScale }) {
  if (!prevSets.length || !lastDate) return null;
  const working = sets.filter((s) => s.type !== 'warmup');
  const vol = (list: { w: number; r: number }[]) => list.reduce((a, x) => a + x.w * x.r, 0);
  const done = working
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.done && parseNum(s.weight) != null && Number(s.reps) > 0);
  const today = vol(done.map(({ s }) => ({ w: parseNum(s.weight) ?? 0, r: Number(s.reps) })));
  const before = vol(done.map(({ i }) => prevSets[i]).filter(Boolean).map((p) => ({ w: parseNum(p.weight) ?? 0, r: p.reps })));
  const diff = before > 0 ? Math.round(((today - before) / before) * 100) : null;
  return (
    <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-violet-400">
        <span className="inline-flex items-center gap-1.5">
          Volta scorsa · {new Date(lastDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} <HelpTip id="session-previous" />
        </span>
        {diff != null && (
          <span className={cn('normal-case tracking-normal', diff > 0 ? 'text-accent-400' : diff < 0 ? 'text-danger' : 'text-fg-2')}>
            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {diff > 0 ? '+' : ''}
            {diff}% volume
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {prevSets.map((p, i) => (
          <span key={i} className="rounded bg-surface-3 px-1.5 py-0.5 text-sm font-semibold text-fg">
            {p.weight}×{p.reps}
          </span>
        ))}
      </div>
      {lastText?.includes('RIR') && (
        <div className="mt-1 text-xs text-fg-3">
          {scaleLabel(scale)} {effortTarget(lastText.slice(lastText.indexOf('RIR') + 3).trim(), scale)}
        </div>
      )}
    </div>
  );
}

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
  /** data dell'ultima volta (per il confronto) */
  lastDate?: number;
  /** scheda aperta (serie visibili) o chiusa (solo il riepilogo) */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** maniglia per trascinare l'esercizio prima o dopo */
  dragHandle?: ReactNode;
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
  onNote: () => void;
  onSwap: () => void;
  libraryId?: string;
  onInfo: () => void;
  effortScale: EffortScale;
  /** apre la modifica di serie, reps, sforzo e recupero */
  onEdit: () => void;
  onRemoveWarmups: () => void;
}

export function ExerciseCard({
  index,
  draft,
  exercise,
  suggestion,
  lastText,
  lastDate,
  expanded,
  onToggleExpanded,
  dragHandle,
  onSetChange,
  onToggleDone,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  prevSets,
  repTargets,
  onCycleType,
  onAddWarmups,
  onNote,
  onSwap,
  libraryId,
  onInfo,
  effortScale,
  onEdit,
  onRemoveWarmups,
}: ExerciseCardProps) {
  const [effortAt, setEffortAt] = useState<number | null>(null);
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
  // serie in corso: la prima allenante non ancora fatta (lo sforzo si segna solo su quella o su quelle già fatte)
  const currentIdx = draft.sets.findIndex((st) => st.type !== 'warmup' && !st.done);
  // serie allenanti per la scelta dello sforzo (le W non hanno RPE)
  const effortSets: EffortSetInfo[] = draft.sets
    .map((st, i) => ({ st, i }))
    .filter(({ st }) => st.type !== 'warmup')
    .map(({ st, i }) => ({
      index: i,
      number: workingIdx[i] + 1,
      rir: st.rir,
      target: rirForSet(exercise.rirTarget, workingIdx[i], n),
      detail: st.weight || st.reps ? `${st.weight || weightPh} kg × ${st.reps || (repTargets[workingIdx[i]] ?? exercise.repMax)}` : '',
    }));
  const canWarmup = !hasWarmups && isCompound(exercise) && workWeight != null && workWeight >= 20;

  // Esercizio chiuso: riepilogo compatto (si apre toccandolo, si sposta dalla maniglia)
  if (!expanded) {
    const target = `${exercise.sets}×${exercise.repMin === exercise.repMax ? exercise.repMin : `${exercise.repMin}-${exercise.repMax}`}`;
    const doneText = draft.sets.filter((s) => s.done).map((s) => `${s.weight || '–'}×${s.reps || '–'}`).join(' · ');
    return (
      <div className={cn('card flex w-full items-stretch overflow-hidden', allDone && 'border-success/20')}>
        {dragHandle}
        <button type="button" onClick={onToggleExpanded} className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left" aria-expanded={false} aria-label={`Apri ${draft.name}`}>
          {allDone ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-black">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-fg">{draft.name}</span>
            <span className="block truncate text-sm text-fg-3">
              {doneCount}/{draft.sets.length} serie{doneText ? ` · ${doneText}` : ` · ${target}`}
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-fg-3" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <section className="card overflow-hidden" aria-label={draft.name}>
      <div className="h-1 w-full" style={{ backgroundColor: color, opacity: 0.8 }} aria-hidden />
      <div className="p-4">
        <div className="flex items-start gap-3">
          {dragHandle && <div className="-my-2 -ml-4 -mr-2 flex">{dragHandle}</div>}
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
          <IconButton label="Chiudi esercizio" onClick={onToggleExpanded} className="-mr-2 -mt-1">
            <ChevronDown className="h-5 w-5 rotate-180" />
          </IconButton>
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
          <Chip icon={<Gauge className="h-3 w-3" aria-hidden />}>
            {scaleLabel(effortScale)} {effortTarget(exercise.rirTarget, effortScale)}
          </Chip>
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
          <ToolBtn icon={<SlidersHorizontal className="h-4 w-4" />} onClick={onEdit}>
            Modifica <NewBadge className="ml-0.5" />
          </ToolBtn>
          {canWarmup && (
            <ToolBtn icon={<Flame className="h-4 w-4" />} onClick={() => workWeight != null && onAddWarmups(warmupSets(workWeight))}>
              Riscaldamento
            </ToolBtn>
          )}
          <ToolBtn icon={<StickyNote className="h-4 w-4" />} onClick={onNote}>
            {exercise.notes ? 'Nota' : 'Aggiungi nota'}
          </ToolBtn>
          <ToolBtn icon={<ArrowLeftRight className="h-4 w-4" />} onClick={onSwap}>
            Sostituisci
          </ToolBtn>
        </div>

        {draft.warmup === 'auto' && draft.sets.some((st) => st.type === 'warmup' && !st.done) && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/25 bg-warning-bg px-3 py-2 text-sm text-fg-2">
            <Flame className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span className="min-w-0 flex-1">
              Riscaldamento suggerito: {draft.sets.filter((st) => st.type === 'warmup').length} serie W
            </span>
            <HelpTip id="session-warmup" />
            <button type="button" onClick={onRemoveWarmups} className="h-8 px-1 text-sm font-semibold text-fg-3 hover:text-fg">
              Togli
            </button>
          </div>
        )}

        <div className="mt-3">
          <SuggestionBox suggestion={suggestion} />
        </div>
        <PrevCompare prevSets={prevSets} lastDate={lastDate} sets={draft.sets} lastText={lastText} scale={effortScale} />

        <div className={cn(SET_GRID, 'mt-3 px-1 text-center text-xs uppercase tracking-wide text-fg-3')} aria-hidden>
          <span>Set</span>
          <span>Prec.</span>
          <span>Kg</span>
          <span>Reps</span>
          <span>{scaleLabel(effortScale)}</span>
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
                  effortScale={effortScale}
                  onEffort={() => setEffortAt(i)}
                  effortEnabled={s.done || i === currentIdx}
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
      <EffortSheet
        open={effortAt != null}
        onClose={() => setEffortAt(null)}
        scale={effortScale}
        set={effortSets.find((x) => x.index === effortAt) ?? null}
        onPick={(idx, rir) => onSetChange(idx, { rir })}
      />
    </section>
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
