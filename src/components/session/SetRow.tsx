import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { DraftSet, SetType } from '@/types';
import { cn } from '@/lib/cn';
import { parseNum } from '@/hooks/use-active-session';
import { effortValue, type EffortScale } from '@/lib/effort';

/** Confronto di una serie con la stessa serie della volta scorsa (peso × ripetizioni, stima 1RM). */
export function setTrend(set: DraftSet, prev?: { weight: string; reps: number }): 'up' | 'same' | 'down' | null {
  const w = parseNum(set.weight);
  const r = Number(set.reps);
  if (!prev || set.type === 'warmup' || w == null || !(r > 0)) return null;
  const score = (kg: number, reps: number) => kg * (1 + reps / 30);
  const a = score(w, r);
  const b = score(parseNum(prev.weight) ?? 0, prev.reps);
  return Math.abs(a - b) <= 0.005 * b ? 'same' : a > b ? 'up' : 'down';
}

export const SET_GRID = 'grid grid-cols-[34px_42px_1fr_1fr_44px_46px] items-center gap-1.5';

const TYPE_STYLE: Record<Exclude<SetType, 'normal'>, { label: string; cls: string; name: string }> = {
  warmup: { label: 'W', cls: 'bg-warning-bg text-warning', name: 'riscaldamento' },
  drop: { label: 'D', cls: 'bg-info-bg text-info', name: 'drop set' },
  failure: { label: 'F', cls: 'bg-danger-bg text-danger', name: 'a cedimento' },
};

interface SetRowProps {
  index: number;
  /** Numero mostrato per le serie allenanti (le serie W non vengono numerate). */
  workingNumber: number;
  prev?: { weight: string; reps: number };
  onUsePrev?: () => void;
  onCycleType: () => void;
  set: DraftSet;
  weightPlaceholder: string;
  repsPlaceholder: string;
  rirPlaceholder: string;
  effortScale: EffortScale;
  /** apre la scelta dello sforzo partendo da questa serie */
  onEffort: () => void;
  onChange: (patch: Partial<DraftSet>) => void;
  /** Ritorna false se la serie non è valida (es. reps mancanti). */
  onToggleDone: () => boolean;
  exerciseName: string;
}

/** Riga serie: peso → reps → ✓ (3 tap). Il peso vuoto usa il suggerimento. */
export function SetRow({
  index,
  workingNumber,
  prev,
  onUsePrev,
  onCycleType,
  set,
  weightPlaceholder,
  repsPlaceholder,
  rirPlaceholder,
  effortScale,
  onEffort,
  onChange,
  onToggleDone,
  exerciseName,
}: SetRowProps) {
  const trend = setTrend(set, prev);
  const repsRef = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState(0);
  const effort = effortValue(set.rir, effortScale);

  const toggle = () => {
    if (!onToggleDone()) {
      setShake((s) => s + 1);
      repsRef.current?.focus();
    }
  };

  const inputCls = cn(
    'h-12 w-full min-w-0 rounded-md border text-center text-lg font-semibold outline-none transition-colors placeholder:font-medium placeholder:text-fg-disabled',
    set.done
      ? 'border-transparent bg-success/10 text-fg'
      : 'border-line bg-surface-2 text-fg focus:border-accent-500 focus:bg-surface-3',
  );
  const label = `${exerciseName}, serie ${index + 1}`;
  const typeStyle = set.type && set.type !== 'normal' ? TYPE_STYLE[set.type] : null;

  return (
    <motion.div
      key={shake}
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
      transition={{ duration: 0.3 }}
      className={cn(SET_GRID, 'rounded-md px-1 py-1', set.done && 'bg-success/5')}
    >
      <button
        type="button"
        onClick={onCycleType}
        aria-label={`${label}: tipo ${typeStyle?.name ?? 'normale'} (tocca per cambiare)`}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold',
          typeStyle ? typeStyle.cls : set.done ? 'bg-success/20 text-success' : 'bg-surface-3 text-fg-2',
        )}
      >
        {typeStyle?.label ?? workingNumber}
        {set.isPersonalRecord && (
          <Trophy className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-base p-0.5 text-warning" aria-label="Record personale" />
        )}
      </button>
      <button
        type="button"
        onClick={onUsePrev}
        disabled={!prev}
        aria-label={prev ? `${label}: usa la volta precedente ${prev.weight}×${prev.reps}` : `${label}: nessun dato precedente`}
        className="flex h-12 flex-col items-center justify-center rounded-md text-xs leading-tight text-fg-3 enabled:hover:bg-surface-2"
      >
        {prev ? (
          <>
            <span className="font-semibold text-fg-2">{prev.weight}</span>
            <span>
              ×{prev.reps}
              {trend && (
                <span
                  aria-label={trend === 'up' ? 'meglio della volta scorsa' : trend === 'down' ? 'peggio della volta scorsa' : 'come la volta scorsa'}
                  className={cn('ml-0.5 font-bold', trend === 'up' ? 'text-accent-400' : trend === 'down' ? 'text-danger' : 'text-fg-3')}
                >
                  {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '='}
                </span>
              )}
            </span>
          </>
        ) : (
          '—'
        )}
      </button>
      <input
        aria-label={`${label}: peso kg`}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={weightPlaceholder}
        value={set.weight}
        onChange={(e) => onChange({ weight: e.target.value.replace(/[^0-9.,]/g, '') })}
        onKeyDown={(e) => e.key === 'Enter' && repsRef.current?.focus()}
        onFocus={(e) => e.target.select()}
        className={inputCls}
      />
      <input
        ref={repsRef}
        aria-label={`${label}: ripetizioni`}
        inputMode="numeric"
        enterKeyHint="done"
        placeholder={repsPlaceholder}
        value={set.reps}
        onChange={(e) => onChange({ reps: e.target.value.replace(/[^0-9]/g, '') })}
        onKeyDown={(e) => e.key === 'Enter' && toggle()}
        onFocus={(e) => e.target.select()}
        className={inputCls}
      />
      {set.type === 'warmup' ? (
        <span aria-hidden />
      ) : (
        <button
          type="button"
          onClick={onEffort}
          aria-label={`${label}: sforzo ${effortScale.toUpperCase()} ${effort || 'non segnato'}`}
          className={cn(
            inputCls,
            'flex items-center justify-center text-base',
            effort ? (set.done ? 'text-accent-400' : 'text-fg') : 'font-medium text-fg-disabled',
          )}
        >
          {effort || rirPlaceholder || '–'}
        </button>
      )}
      <motion.button
        type="button"
        onClick={toggle}
        whileTap={{ scale: 0.88 }}
        aria-pressed={set.done}
        aria-label={set.done ? `${label}: annulla completamento` : `${label}: completa`}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-md transition-colors',
          set.done ? 'bg-success text-black' : 'bg-surface-3 text-fg-3 hover:text-fg',
        )}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {/* Il checkmark si "disegna" quando la serie viene completata */}
          <motion.path
            key={set.done ? 'done' : 'todo'}
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={{ pathLength: set.done ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            strokeOpacity={set.done ? 1 : 0.55}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </svg>
      </motion.button>
    </motion.div>
  );
}
