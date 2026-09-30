import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { imageUrl } from '@/lib/exercise-library';
import { cn } from '@/lib/cn';

interface Props {
  id: string;
  frames?: number;
  className?: string;
  /** Anima alternando posizione iniziale e finale (simulazione del movimento). */
  animate?: boolean;
  alt?: string;
}

/** Demo esercizio: le due foto (inizio/fine movimento) in dissolvenza continua. */
export function ExerciseDemo({ id, frames = 2, className, animate = true, alt = '' }: Props) {
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const canAnimate = animate && frames > 1 && !failed;

  useEffect(() => {
    if (!canAnimate || !loaded) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = window.setInterval(() => setFrame((f) => (f + 1) % frames), 1100);
    return () => window.clearInterval(t);
  }, [canAnimate, loaded, frames]);

  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-2 text-fg-3', className)} aria-hidden>
        <Dumbbell className="h-1/3 w-1/3" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-3" aria-hidden />}
      {Array.from({ length: canAnimate ? frames : 1 }, (_, i) => (
        <img
          key={i}
          src={imageUrl(id, i)}
          alt={i === 0 ? alt : ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => i === 0 && setLoaded(true)}
          onError={() => i === 0 && setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          style={{ opacity: i === frame ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
