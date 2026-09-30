import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, SkipForward } from 'lucide-react';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { formatClock } from '@/lib/date-utils';
import { CircularProgress } from '../ui/ProgressBar';

/** Barra flottante del recupero (sopra la bottom nav, o in fondo durante la sessione). */
export function RestTimer({ inSession }: { inSession: boolean }) {
  const t = useRestTimer();
  const visible = t.running || t.finished;
  const bottom = inSession ? 'calc(var(--safe-bottom) + 12px)' : 'calc(var(--nav-h) + var(--safe-bottom) + 12px)';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="fixed inset-x-0 z-40 px-3"
          style={{ bottom }}
          role="timer"
          aria-live="off"
        >
          <div
            className={`mx-auto flex max-w-2xl items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur-xl ${
              t.finished ? 'border-success/40 bg-success-bg' : 'border-line bg-surface-2/95'
            }`}
          >
            {t.finished ? (
              <div className="flex h-14 flex-1 items-center justify-center text-lg font-bold text-success" role="status">
                Recupero finito — vai! 💪
              </div>
            ) : (
              <>
                <CircularProgress value={t.duration ? t.remaining / t.duration : 0} size={56} stroke={5} label="Recupero">
                  <span className="text-xs font-bold text-fg-2">REST</span>
                </CircularProgress>
                <div className="min-w-0 flex-1">
                  <div className="text-4xl leading-none text-fg" aria-label={`Recupero: ${t.remaining} secondi`}>
                    {formatClock(t.remaining)}
                  </div>
                  {t.label && <div className="mt-1 truncate text-sm text-fg-3">{t.label}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <TimerBtn label="Meno 30 secondi" onClick={() => t.adjust(-30)}>
                    <Minus className="h-4 w-4" aria-hidden />
                    30
                  </TimerBtn>
                  <TimerBtn label="Più 30 secondi" onClick={() => t.adjust(30)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    30
                  </TimerBtn>
                  <TimerBtn label="Salta recupero" onClick={t.skip} accent>
                    <SkipForward className="h-5 w-5" aria-hidden />
                  </TimerBtn>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TimerBtn({ label, onClick, children, accent }: { label: string; onClick: () => void; children: React.ReactNode; accent?: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`flex h-11 min-w-[44px] items-center justify-center gap-0.5 rounded-md px-2 text-sm font-bold ${
        accent ? 'bg-accent-500 text-white' : 'bg-surface-3 text-fg'
      }`}
    >
      {children}
    </motion.button>
  );
}
