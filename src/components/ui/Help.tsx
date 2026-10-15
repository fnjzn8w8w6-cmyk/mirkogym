import { useState } from 'react';
import { Modal } from './Modal';
import { HELP, type HelpId } from '@/lib/help';
import { cn } from '@/lib/cn';

/** Data di rilascio delle funzioni senza data propria: l'etichetta NUOVO resta visibile per 21 giorni dal rilascio. */
const RELEASE = '2026-10-03';
const NEW_DAYS = 21;

/** Etichetta "NUOVO" accanto alle funzioni appena introdotte (`since` = data di rilascio di quella funzione). */
export function NewBadge({ since = RELEASE, className }: { since?: string; className?: string }) {
  if (Date.now() - new Date(`${since}T00:00:00`).getTime() > NEW_DAYS * 86400000) return null;
  return (
    <span className={cn('ml-1.5 inline-block rounded-full bg-accent-500 px-1.5 py-px align-middle text-[9px] font-extrabold tracking-wider text-onaccent', className)}>
      NUOVO
    </span>
  );
}

/** Punto interrogativo che spiega come funziona una sezione. */
export function HelpTip({ id, className }: { id: HelpId; className?: string }) {
  const [open, setOpen] = useState(false);
  const h = HELP[id];
  return (
    <>
      <button
        type="button"
        aria-label={`Come funziona: ${h.title}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-400/50 align-middle text-[11px] font-bold normal-case tracking-normal text-violet-400',
          className,
        )}
      >
        ?
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={h.title}>
        <div className="space-y-2 text-base text-fg-2" onClick={(e) => e.stopPropagation()}>
          {h.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Modal>
    </>
  );
}

/** Titolo di sezione con punto interrogativo (e, se serve, etichetta NUOVO). */
export function SectionTitle({ children, help, isNew, since, className }: { children: React.ReactNode; help: HelpId; isNew?: boolean; since?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span>{children}</span>
      {isNew && <NewBadge since={since} />}
      <HelpTip id={help} />
    </span>
  );
}
