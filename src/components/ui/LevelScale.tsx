import { cn } from '@/lib/cn';

/**
 * Scala da 1 a 5 con barre crescenti e una parola sotto (es. fame: Nessuna … Sempre).
 * Più chiara delle faccine, che con le icone piene si assomigliano tutte.
 */
export function LevelScale({ label, value, onChange, words }: { label: string; value: number; onChange: (v: number) => void; words: string[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
      {words.map((w, i) => {
        const on = value === i + 1;
        return (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}: ${w} (${i + 1} su 5)`}
            onClick={() => onChange(i + 1)}
            className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-md border', on ? 'border-accent-500 bg-accent-glow' : 'border-line bg-surface-2')}
          >
            <span className="flex h-4 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2, 3, 4].map((b) => (
                <span
                  key={b}
                  className={cn('w-[4px] rounded-sm', b <= i ? (on ? 'bg-accent-400' : 'bg-fg-2') : 'bg-surface-3')}
                  style={{ height: `${6 + b * 2.5}px` }}
                />
              ))}
            </span>
            <span className={cn('text-[11px] font-semibold leading-none', on ? 'text-accent-400' : 'text-fg-2')}>{w}</span>
          </button>
        );
      })}
    </div>
  );
}

export const HUNGER_WORDS = ['Nessuna', 'Poca', 'Normale', 'Tanta', 'Sempre'];
