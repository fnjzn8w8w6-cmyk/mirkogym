import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, Trophy, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastKind = 'success' | 'error' | 'info' | 'pr';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  pr: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const styles: Record<ToastKind, { icon: ReactNode; cls: string }> = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-success" />, cls: 'border-success/30' },
  error: { icon: <XCircle className="h-5 w-5 text-danger" />, cls: 'border-danger/30' },
  info: { icon: <Info className="h-5 w-5 text-info" />, cls: 'border-info/30' },
  pr: { icon: <Trophy className="h-5 w-5 text-warning" />, cls: 'border-warning/40 shadow-glow' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 4500 : 2800);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
      pr: (m) => show(m, 'pr'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
          style={{ top: 'calc(var(--safe-top) + 12px)' }}
          role="status"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.96 }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border bg-surface-2/95 px-4 py-3 text-base text-fg shadow-lg backdrop-blur',
                  styles[t.kind].cls,
                )}
              >
                {styles[t.kind].icon}
                <span className="flex-1">{t.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fuori da ToastProvider');
  return ctx;
}
