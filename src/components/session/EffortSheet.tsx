import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { HelpTip } from '../ui/Help';
import { cn } from '@/lib/cn';
import { EFFORT_OPTIONS, effortTarget, effortValue, scaleLabel, type EffortScale } from '@/lib/effort';

const fmt = (n: number) => String(n).replace('.', ',');

export interface EffortSetInfo {
  /** indice della serie nella bozza */
  index: number;
  /** numero mostrato (1, 2, 3…) */
  number: number;
  /** RIR segnato ('' = non ancora) */
  rir: string;
  /** bersaglio della scheda per questa serie, in RIR */
  target: string;
  /** "67,5 kg × 8" se già compilata */
  detail: string;
}

/**
 * Sforzo delle serie di un esercizio: in alto si sceglie la serie, sotto i valori con la spiegazione.
 * Toccando un valore si passa da soli alla serie successiva. Restituisce sempre il RIR (RPE 8 → "2").
 */
export function EffortSheet({
  open,
  onClose,
  scale,
  sets,
  startAt,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  scale: EffortScale;
  sets: EffortSetInfo[];
  /** serie da cui partire (indice nella bozza) */
  startAt: number;
  onPick: (index: number, rir: string) => void;
}) {
  const [sel, setSel] = useState(startAt);
  useEffect(() => {
    if (open) setSel(startAt);
  }, [open, startAt]);

  const label = scaleLabel(scale);
  const cur = sets.find((s) => s.index === sel) ?? sets[0];
  if (!cur) return null;
  const current = effortValue(cur.rir, scale);
  const t = cur.target ? effortTarget(cur.target, scale) : '';
  const inTarget = (rpe: number) => {
    const nums = (cur.target.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => 10 - Number(x.replace(',', '.')));
    return nums.length > 0 && rpe >= Math.min(...nums) && rpe <= Math.max(...nums);
  };

  const pick = (rir: string) => {
    onPick(cur.index, rir);
    if (rir === '') return;
    // passa alla serie successiva; dopo l'ultima si chiude
    const pos = sets.findIndex((s) => s.index === cur.index);
    const next = sets[pos + 1];
    if (next) setSel(next.index);
    else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quanto è stata dura?"
      footer={
        cur.rir ? (
          <button type="button" className="h-11 w-full text-sm font-semibold text-fg-3" onClick={() => pick('')}>
            Togli il valore della serie {cur.number}
          </button>
        ) : undefined
      }
    >
      {/* scelta della serie */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Serie">
        {sets.map((s) => {
          const v = effortValue(s.rir, scale);
          const on = s.index === cur.index;
          return (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSel(s.index)}
              className={cn(
                'flex h-14 min-w-[64px] shrink-0 flex-col items-center justify-center rounded-md border px-2 transition-colors',
                on ? 'border-accent-500 bg-accent-glow' : 'border-line bg-surface-2',
              )}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">Serie {s.number}</span>
              <span className={cn('font-display text-lg font-extrabold leading-tight', v ? 'text-accent-400' : 'text-fg-disabled')}>{v || '–'}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <p className="text-sm text-fg-2">
          Serie {cur.number}
          {cur.detail && ` · ${cur.detail}`}
          {t && (
            <>
              {' · '}obiettivo <strong className="text-accent-400">{label} {t}</strong>
            </>
          )}
        </p>
        <HelpTip id="session-effort" />
      </div>
      <div className="mt-2 space-y-1.5">
        {EFFORT_OPTIONS.map((o) => {
          const shown = scale === 'rpe' ? fmt(o.rpe) : fmt(10 - o.rpe);
          const on = current === shown;
          return (
            <button
              key={o.rpe}
              type="button"
              aria-pressed={on}
              onClick={() => pick(String(10 - o.rpe))}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors active:bg-surface-3',
                on ? 'border-accent-500 bg-accent-glow' : 'border-line bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-12 shrink-0 items-center justify-center rounded-md font-display text-xl font-extrabold',
                  on ? 'bg-accent-500 text-onaccent' : 'bg-surface-3 text-fg',
                )}
              >
                {shown}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  {o.title}
                  {inTarget(o.rpe) && (
                    <span className="rounded-full border border-accent-500/50 px-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-400">obiettivo</span>
                  )}
                </span>
                <span className="block text-xs text-fg-3">{o.desc}</span>
              </span>
              {on && <Check className="h-5 w-5 shrink-0 text-accent-400" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
