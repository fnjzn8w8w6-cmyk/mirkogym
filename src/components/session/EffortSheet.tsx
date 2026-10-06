import { Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { HelpTip } from '../ui/Help';
import { cn } from '@/lib/cn';
import { EFFORT_OPTIONS, effortTarget, effortValue, scaleLabel, type EffortScale } from '@/lib/effort';

const fmt = (n: number) => String(n).replace('.', ',');

/**
 * Scelta dello sforzo di una serie: elenco con spiegazione di ogni valore,
 * evidenziando il bersaglio di oggi. Restituisce sempre il RIR (rpe 8 → "2").
 */
export function EffortSheet({
  open,
  onClose,
  scale,
  value,
  target,
  subtitle,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  scale: EffortScale;
  /** RIR attuale della serie ('' = non segnato) */
  value: string;
  /** bersaglio della scheda in RIR (es. "1-2") */
  target: string;
  subtitle: string;
  onPick: (rir: string) => void;
}) {
  const label = scaleLabel(scale);
  const current = effortValue(value, scale);
  const t = target ? effortTarget(target, scale) : '';
  const inTarget = (rpe: number) => {
    const nums = (target.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => 10 - Number(x.replace(',', '.')));
    return nums.length > 0 && rpe >= Math.min(...nums) && rpe <= Math.max(...nums);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quanto è stata dura?"
      footer={
        value ? (
          <button type="button" className="h-11 w-full text-sm font-semibold text-fg-3" onClick={() => onPick('')}>
            Togli il valore
          </button>
        ) : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-fg-2">
          {subtitle}
          {t && (
            <>
              {' · '}obiettivo di oggi <strong className="text-accent-400">{label} {t}</strong>
            </>
          )}
        </p>
        <HelpTip id="session-effort" />
      </div>
      <div className="mt-3 space-y-1.5">
        {EFFORT_OPTIONS.map((o) => {
          const shown = scale === 'rpe' ? fmt(o.rpe) : fmt(10 - o.rpe);
          const on = current === shown;
          return (
            <button
              key={o.rpe}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(String(10 - o.rpe))}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
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
                  {inTarget(o.rpe) && <span className="rounded-full border border-accent-500/50 px-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-400">obiettivo</span>}
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
