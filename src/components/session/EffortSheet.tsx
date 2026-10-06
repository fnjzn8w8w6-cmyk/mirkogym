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
 * Sforzo della serie appena fatta (o in corso): i valori con la spiegazione, evidenziando l'obiettivo.
 * Restituisce sempre il RIR (RPE 8 → "2").
 */
export function EffortSheet({
  open,
  onClose,
  scale,
  set: cur,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  scale: EffortScale;
  set: EffortSetInfo | null;
  onPick: (index: number, rir: string) => void;
}) {
  const label = scaleLabel(scale);
  if (!cur) return null;
  const current = effortValue(cur.rir, scale);
  const t = cur.target ? effortTarget(cur.target, scale) : '';
  const inTarget = (rpe: number) => {
    const nums = (cur.target.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => 10 - Number(x.replace(',', '.')));
    return nums.length > 0 && rpe >= Math.min(...nums) && rpe <= Math.max(...nums);
  };

  const pick = (rir: string) => {
    onPick(cur.index, rir);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quanto è stata dura?"
      footer={
        cur.rir ? (
          <button type="button" className="h-11 w-full text-sm font-semibold text-fg-3" onClick={() => pick('')}>
            Togli il valore
          </button>
        ) : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
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
