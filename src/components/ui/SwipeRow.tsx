import { useState, type ReactNode } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

interface SwipeAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone: 'danger' | 'neutral';
}

/** Riga con azioni rivelate da swipe verso sinistra (stile iOS). */
export function SwipeRow({ children, actions }: { children: ReactNode; actions: SwipeAction[] }) {
  const controls = useAnimationControls();
  const [open, setOpen] = useState(false);
  const width = actions.length * 84;

  const close = () => {
    setOpen(false);
    void controls.start({ x: 0 });
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-y-0 right-0 flex" style={{ width }} aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              close();
              a.onClick();
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${
              a.tone === 'danger' ? 'bg-danger text-white' : 'bg-surface-3 text-fg'
            }`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -width, right: 0 }}
        dragElastic={0.1}
        animate={controls}
        onDragEnd={(_, info) => {
          const shouldOpen = info.offset.x < -50 || (open && info.offset.x < 30);
          setOpen(shouldOpen);
          void controls.start({ x: shouldOpen ? -width : 0, transition: { type: 'spring', damping: 30, stiffness: 400 } });
        }}
        onClickCapture={(e) => {
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        className="relative bg-base"
      >
        {children}
      </motion.div>
    </div>
  );
}
