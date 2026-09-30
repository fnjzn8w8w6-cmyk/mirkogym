import { cn } from '@/lib/cn';
import { useSettings } from '@/hooks/use-settings';
import { ANTERIOR, POSTERIOR } from './body-polygons';

/**
 * Mappa muscolare anatomica (fronte/retro) colorata con il colore dell'app.
 * Figura maschile o femminile (proporzioni: spalle, vita, fianchi) in base al profilo.
 */

/** Muscolo della figura → muscoli della libreria esercizi (free-exercise-db). */
const MAP: Record<string, string[]> = {
  chest: ['chest'],
  obliques: ['abdominals'],
  abs: ['abdominals'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  neck: ['neck', 'traps'],
  'front-deltoids': ['shoulders'],
  'back-deltoids': ['shoulders'],
  abductors: ['abductors'],
  adductor: ['adductors'],
  quadriceps: ['quadriceps'],
  calves: ['calves'],
  'left-soleus': ['calves'],
  'right-soleus': ['calves'],
  forearm: ['forearms'],
  trapezius: ['traps'],
  'upper-back': ['lats', 'middle back'],
  'lower-back': ['lower back'],
  gluteal: ['glutes'],
  hamstring: ['hamstrings'],
};
const NEUTRAL = new Set(['head', 'knees']);

interface Props {
  /** Muscoli principali (evidenziati pieni) */
  primary?: string[];
  secondary?: string[];
  /** In alternativa: intensità 0..1 per muscolo (mappa di calore). */
  intensity?: Record<string, number>;
  sex?: 'm' | 'f';
  className?: string;
  labels?: boolean;
}

/** Fattore di larghezza per la figura femminile in funzione dell'altezza (scala 0-200). */
function femaleWidth(y: number): number {
  const pts: [number, number][] = [[0, 0.9], [25, 0.85], [45, 0.82], [62, 0.84], [80, 0.86], [96, 1.12], [112, 1.14], [135, 1.03], [200, 0.98]];
  for (let i = 1; i < pts.length; i++)
    if (y <= pts[i][0]) {
      const [y0, a] = pts[i - 1];
      const [y1, b] = pts[i];
      return a + ((b - a) * (y - y0)) / (y1 - y0);
    }
  return 1;
}

function level(muscle: string, p: Props): number {
  const ids = MAP[muscle] ?? [];
  if (p.intensity) return Math.max(0, ...ids.map((m) => Math.min(1, p.intensity?.[m] ?? 0)));
  if (ids.some((m) => p.primary?.includes(m))) return 1;
  if (ids.some((m) => p.secondary?.includes(m))) return 0.45;
  return 0;
}

function Figure({ data, height, props, dx }: { data: [string, number[][]][]; height: number; props: Props; dx: number }) {
  const k = 200 / height;
  const pts = (n: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < n.length; i += 2) {
      const y = n[i + 1] * k;
      const x = props.sex === 'f' ? 50 + (n[i] - 50) * femaleWidth(y) : n[i];
      out.push(`${(x + dx).toFixed(1)},${y.toFixed(1)}`);
    }
    return out.join(' ');
  };
  return (
    <g>
      {data.map(([muscle, polys]) => {
        const v = NEUTRAL.has(muscle) ? -1 : level(muscle, props);
        return polys.map((poly, i) => (
          <polygon
            key={`${muscle}-${i}`}
            points={pts(poly)}
            fill={v > 0 ? 'var(--accent-500)' : v < 0 ? 'var(--bg-surface-2)' : 'var(--bg-surface-3)'}
            fillOpacity={v > 0 ? 0.28 + 0.72 * v : 1}
            stroke="var(--bg-base)"
            strokeWidth={0.6}
          >
            <title>{muscle}</title>
          </polygon>
        ));
      })}
    </g>
  );
}

export function MuscleFigure(input: Props) {
  const { settings } = useSettings();
  const props = { ...input, sex: input.sex ?? settings.profile?.sex ?? 'm' };
  const muscles = props.primary?.join(', ');
  return (
    <svg
      viewBox="-4 -2 218 212"
      className={cn('block', props.className)}
      role="img"
      aria-label={muscles ? `Muscoli coinvolti: ${muscles}` : 'Mappa muscolare'}
    >
      <Figure data={ANTERIOR} height={200} props={props} dx={0} />
      <Figure data={POSTERIOR} height={220} props={props} dx={110} />
      {props.labels && (
        <g fill="var(--text-tertiary)" fontSize={9} fontWeight={600} textAnchor="middle">
          <text x={50} y={208}>Fronte</text>
          <text x={160} y={208}>Retro</text>
        </g>
      )}
    </svg>
  );
}

/** Gruppo della scheda → muscoli della figura. */
export const GROUP_MUSCLES: Record<string, string[]> = {
  Petto: ['chest'],
  Dorso: ['lats', 'middle back', 'lower back', 'traps'],
  Spalle: ['shoulders'],
  Bicipiti: ['biceps', 'forearms'],
  Tricipiti: ['triceps'],
  Gambe: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  Core: ['abdominals'],
};
