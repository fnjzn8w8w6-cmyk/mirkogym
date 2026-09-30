import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

const COLORS = ['#F97316', '#FB923C', '#FACC15', '#22C55E', '#3B82F6', '#EC4899', '#8B5CF6', '#FAFAFA'];

/** Esplosione di coriandoli leggera (~1.5s), senza dipendenze esterne. */
export function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 2, // -1..1 (frazione di viewport)
        peak: 0.25 + Math.random() * 0.45,
        rotate: (Math.random() - 0.5) * 900,
        delay: Math.random() * 0.15,
        duration: 1.2 + Math.random() * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.7,
      })),
    [count],
  );

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-[55%]"
          style={{
            width: p.w,
            height: p.round ? p.w : p.h,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{
            x: `${p.x * 50}vw`,
            y: [`0vh`, `-${p.peak * 100}vh`, `${60}vh`],
            rotate: p.rotate,
            opacity: [1, 1, 0],
            scale: 1,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
        />
      ))}
    </div>,
    document.body,
  );
}
