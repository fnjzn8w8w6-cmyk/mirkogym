import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { DraftSet } from '@/types';
import { cn } from '@/lib/cn';

interface SetRowProps {
  index: number;
  set: DraftSet;
  weightPlaceholder: string;
  repsPlaceholder: string;
  rirPlaceholder: string;
  onChange: (patch: Partial<DraftSet>) => void;
  /** Ritorna false se la serie non è valida (es. reps mancanti). */
  onToggleDone: () => boolean;
  exerciseName: string;
}

/** Riga serie: peso → reps → ✓ (3 tap). Il peso vuoto usa il suggerimento. */
export function SetRow({
  index,
  set,
  weightPlaceholder,
  repsPlaceholder,
  rirPlaceholder,
  onChange,
  onToggleDone,
  exerciseName,
}: SetRowProps) {
  const repsRef = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState(0);

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

  return (
    <motion.div
      key={shake}
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
      transition={{ duration: 0.3 }}
      className={cn('grid grid-cols-[36px_1fr_1fr_0.8fr_48px] items-center gap-2 rounded-md px-1 py-1', set.done && 'bg-success/5')}
    >
      <span
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold',
          set.done ? 'bg-success/20 text-success' : 'bg-surface-3 text-fg-2',
        )}
      >
        {index + 1}
        {set.isPersonalRecord && (
          <Trophy className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-base p-0.5 text-warning" aria-label="Record personale" />
        )}
      </span>
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
      <input
        aria-label={`${label}: RIR`}
        inputMode="numeric"
        placeholder={rirPlaceholder}
        value={set.rir}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
          onChange({ rir: v === '' ? '' : String(Math.min(Number(v), 10)) });
        }}
        onFocus={(e) => e.target.select()}
        className={cn(inputCls, 'text-base')}
      />
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
