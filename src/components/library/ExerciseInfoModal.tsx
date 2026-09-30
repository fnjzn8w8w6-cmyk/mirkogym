import { ExternalLink, PlayCircle } from 'lucide-react';
import {
  CATEGORY_IT,
  EQUIPMENT_IT,
  LEVEL_IT,
  MUSCLE_IT,
  displayName,
  groupForLibrary,
  youtubeUrl,
  type LibraryExercise,
} from '@/lib/exercise-library';
import { groupColor } from '@/lib/analytics';
import { Modal } from '../ui/Modal';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { ExerciseDemo } from './ExerciseDemo';
import { MuscleFigure } from './MuscleFigure';

interface Props {
  exercise: LibraryExercise | null;
  onClose: () => void;
  /** Azione principale opzionale (es. "Aggiungi alla scheda"). */
  action?: { label: string; onClick: (e: LibraryExercise) => void };
}

export function ExerciseInfoModal({ exercise, onClose, action }: Props) {
  const ex = exercise;
  return (
    <Modal
      open={Boolean(ex)}
      onClose={onClose}
      title={ex ? displayName(ex) : ''}
      footer={
        ex && action ? (
          <Button size="lg" fullWidth onClick={() => action.onClick(ex)}>
            {action.label}
          </Button>
        ) : undefined
      }
    >
      {ex && (
        <div className="space-y-4">
          <div className="relative">
            <ExerciseDemo id={ex.id} frames={ex.g} className="aspect-[3/2] w-full rounded-lg" alt={ex.n} />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">
              Simulazione del movimento
            </span>
          </div>
          {displayName(ex) !== ex.n && <p className="-mt-2 text-sm text-fg-3">{ex.n}</p>}

          <div className="flex flex-wrap gap-1.5">
            <Chip color={groupColor(groupForLibrary(ex))}>{groupForLibrary(ex)}</Chip>
            <Chip>{EQUIPMENT_IT[ex.e] ?? ex.e}</Chip>
            <Chip>{LEVEL_IT[ex.l] ?? ex.l}</Chip>
            <Chip>{CATEGORY_IT[ex.c] ?? ex.c}</Chip>
            {ex.k && <Chip>{ex.k === 'compound' ? 'Multiarticolare' : 'Monoarticolare'}</Chip>}
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-3">
            <MuscleFigure primary={ex.p} secondary={ex.s} className="h-36 w-auto shrink-0" />
            <div className="text-sm">
              <div className="text-xs uppercase tracking-wide text-fg-3">Muscoli principali</div>
              <div className="mt-0.5 font-semibold text-fg">{ex.p.map((m) => MUSCLE_IT[m] ?? m).join(', ')}</div>
              {ex.s.length > 0 && (
                <>
                  <div className="mt-2 text-xs uppercase tracking-wide text-fg-3">Secondari</div>
                  <div className="mt-0.5 text-fg-2">{ex.s.map((m) => MUSCLE_IT[m] ?? m).join(', ')}</div>
                </>
              )}
            </div>
          </div>

          <a
            href={youtubeUrl(ex)}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface-2 text-base font-semibold text-fg hover:bg-surface-3"
          >
            <PlayCircle className="h-5 w-5 text-danger" aria-hidden /> Guarda video su YouTube
            <ExternalLink className="h-4 w-4 text-fg-3" aria-hidden />
          </a>

          <section>
            <h3 className="section-title">Come si esegue</h3>
            <ol className="space-y-2">
              {ex.i.map((step, i) => (
                <li key={i} className="flex gap-3 text-base text-fg-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-glow text-xs font-bold text-accent-400">
                    {i + 1}
                  </span>
                  <span lang="en">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-fg-3">Istruzioni in inglese · foto: free-exercise-db (pubblico dominio)</p>
          </section>
        </div>
      )}
    </Modal>
  );
}
