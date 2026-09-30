import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  variant?: 'center' | 'sheet';
  children: ReactNode;
  footer?: ReactNode;
  /** Impedisce la chiusura con tap sullo sfondo (es. durante un salvataggio). */
  dismissible?: boolean;
  className?: string;
}

export function Modal({ open, onClose, title, variant = 'sheet', children, footer, dismissible = true, className }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panelRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      prevFocus?.focus?.();
    };
  }, [open, dismissible]);

  const isSheet = variant === 'sheet';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex', isSheet ? 'items-end justify-center' : 'items-center justify-center p-4')}>
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onClose()}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-surface shadow-lg outline-none',
              isSheet ? 'max-w-2xl rounded-t-xl pb-[var(--safe-bottom)]' : 'max-w-md rounded-xl',
              className,
            )}
            initial={isSheet ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
            animate={isSheet ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isSheet ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340, mass: 0.8 }}
            drag={isSheet && dismissible ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {isSheet && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-surface-3" aria-hidden />}
            {title && (
              <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-3">
                <h2 id={titleId} className="text-xl text-fg">
                  {title}
                </h2>
                {dismissible && (
                  <IconButton label="Chiudi" onClick={onClose} className="-mr-2">
                    <X className="h-5 w-5" />
                  </IconButton>
                )}
              </div>
            )}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {children}
            </div>
            {footer && <div className="shrink-0 border-t border-line-subtle px-5 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
