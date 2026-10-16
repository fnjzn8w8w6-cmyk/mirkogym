import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

const ITEM = 40;
const VISIBLE = 5;

/**
 * Rotella stile iPhone: si scorre col dito e si ferma sul valore al centro (anche tocco sul valore o frecce da tastiera).
 */
export function Wheel({
  values,
  value,
  onChange,
  format = String,
  label,
  className,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const index = Math.max(0, values.indexOf(value));

  // posizione allineata al valore (all'apertura e quando cambia da fuori)
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM) !== index) el.scrollTop = index * ITEM;
  }, [index]);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const pick = (i: number, smooth = true) => {
    const j = Math.max(0, Math.min(values.length - 1, i));
    ref.current?.scrollTo({ top: j * ITEM, behavior: smooth ? 'smooth' : 'auto' });
    if (values[j] !== value) onChange(values[j]);
  };

  // a fine scorrimento si prende il valore al centro
  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM)));
      if (values[i] !== value) onChange(values[i]);
    }, 120);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      pick(index - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      pick(index + 1);
    }
  };

  return (
    <div className={cn('relative', className)} style={{ height: ITEM * VISIBLE }}>
      {/* banda del valore scelto */}
      <div className="pointer-events-none absolute inset-x-0 rounded-md border border-accent-500/40 bg-accent-glow" style={{ top: ITEM * 2, height: ITEM }} aria-hidden />
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onScroll={onScroll}
        onKeyDown={onKey}
        className="no-scrollbar relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        style={{ paddingTop: ITEM * 2, paddingBottom: ITEM * 2, maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)' }}
      >
        {values.map((v, i) => (
          <button
            key={v}
            type="button"
            tabIndex={-1}
            onClick={() => pick(i)}
            className={cn('flex w-full snap-center items-center justify-center font-display text-xl', v === value ? 'font-extrabold text-fg' : 'font-semibold text-fg-3')}
            style={{ height: ITEM }}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

const MINUTES = Array.from({ length: 11 }, (_, i) => i);
const SECONDS = Array.from({ length: 12 }, (_, i) => i * 5);

/** Tempo di recupero con due rotelle: minuti e secondi (a passi di 5 s). Minimo 10 secondi. */
export function RestPicker({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const total = Math.max(10, Math.min(MINUTES[MINUTES.length - 1] * 60 + 55, Math.round(seconds / 5) * 5));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const set = (m: number, s: number) => onChange(Math.max(10, m * 60 + s));
  return (
    <div className="flex items-center justify-center gap-2">
      <Wheel className="w-20" label="Recupero: minuti" values={MINUTES} value={min} onChange={(m) => set(m, sec)} />
      <span className="text-sm font-semibold text-fg-3">min</span>
      <Wheel className="w-20" label="Recupero: secondi" values={SECONDS} value={sec} onChange={(s) => set(min, s)} format={(v) => String(v).padStart(2, '0')} />
      <span className="text-sm font-semibold text-fg-3">sec</span>
    </div>
  );
}

/** Recupero salvato nella scheda: "90 sec", "2 min", "150 sec" (lo legge parseRestSeconds). */
export const restText = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} sec`);
