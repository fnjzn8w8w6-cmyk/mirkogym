import { cn } from '@/lib/cn';

type Shape = { m: string; t: 'e'; cx: number; cy: number; rx: number; ry: number; r?: number } | { m: string; t: 'r'; x: number; y: number; w: number; h: number; r: number };

const sym = (m: string, cx: number, cy: number, rx: number, ry: number, rot = 0): Shape[] => [
  { m, t: 'e', cx: 50 - cx, cy, rx, ry, r: -rot },
  { m, t: 'e', cx: 50 + cx, cy, rx, ry, r: rot },
];

// Figura stilizzata su griglia 100×200 (fronte), muscoli come forme semplici
const FRONT: Shape[] = [
  ...sym('shoulders', 20, 43, 8.5, 7.5, 20),
  ...sym('chest', 9, 53, 9.5, 7.5),
  ...sym('biceps', 25, 64, 4.8, 10, 10),
  ...sym('forearms', 29, 87, 4.2, 11, 8),
  { m: 'abdominals', t: 'r', x: 42.5, y: 62, w: 15, h: 32, r: 5 },
  ...sym('quadriceps', 8, 124, 7.5, 21, -3),
  ...sym('adductors', 2.5, 113, 2.4, 9),
  ...sym('calves', 8.5, 165, 5, 14),
];
const BACK: Shape[] = [
  { m: 'traps', t: 'e', cx: 50, cy: 39, rx: 13, ry: 7 },
  ...sym('shoulders', 20, 43, 8.5, 7.5, 20),
  ...sym('lats', 10, 62, 8, 14, -8),
  { m: 'middle back', t: 'r', x: 45, y: 48, w: 10, h: 20, r: 4 },
  { m: 'lower back', t: 'r', x: 43, y: 76, w: 14, h: 13, r: 5 },
  ...sym('triceps', 25, 63, 4.8, 10, 10),
  ...sym('forearms', 29, 87, 4.2, 11, 8),
  ...sym('glutes', 7.5, 102, 8.5, 8.5),
  ...sym('abductors', 14.5, 104, 2.4, 6),
  ...sym('hamstrings', 8, 130, 7, 18, -3),
  ...sym('calves', 8.5, 163, 6, 14),
];

interface Props {
  /** Muscoli principali (evidenziati pieni) */
  primary?: string[];
  secondary?: string[];
  /** In alternativa: intensità 0..1 per muscolo (mappa di calore). */
  intensity?: Record<string, number>;
  className?: string;
  labels?: boolean;
}

const BASE = '#2A2A2F';
const ACCENT = '249,115,22';

function fillFor(m: string, p: Props): string {
  if (p.intensity) {
    const v = p.intensity[m] ?? 0;
    return v > 0 ? `rgba(${ACCENT},${0.25 + 0.75 * Math.min(1, v)})` : BASE;
  }
  if (p.primary?.includes(m)) return `rgb(${ACCENT})`;
  if (p.secondary?.includes(m)) return `rgba(${ACCENT},0.4)`;
  return BASE;
}

function Figure({ shapes, props, dx }: { shapes: Shape[]; props: Props; dx: number }) {
  return (
    <g transform={`translate(${dx} 0)`}>
      {/* silhouette */}
      <circle cx={50} cy={16} r={10} fill="#1E1E22" />
      <rect x={45} y={25} width={10} height={9} rx={3} fill="#1E1E22" />
      <rect x={34} y={34} width={32} height={62} rx={12} fill="#1E1E22" />
      <rect x={35} y={90} width={30} height={20} rx={8} fill="#1E1E22" />
      {[-1, 1].map((s) => (
        <g key={s} fill="#1E1E22">
          <ellipse cx={50 + s * 30} cy={101} rx={4} ry={5} />
          <ellipse cx={50 + s * 9} cy={183} rx={5} ry={4} />
        </g>
      ))}
      {shapes.map((sh, i) =>
        sh.t === 'e' ? (
          <ellipse
            key={i}
            cx={sh.cx}
            cy={sh.cy}
            rx={sh.rx}
            ry={sh.ry}
            transform={sh.r ? `rotate(${sh.r} ${sh.cx} ${sh.cy})` : undefined}
            fill={fillFor(sh.m, props)}
            stroke="#0A0A0B"
            strokeWidth={1}
          />
        ) : (
          <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.r} fill={fillFor(sh.m, props)} stroke="#0A0A0B" strokeWidth={1} />
        ),
      )}
    </g>
  );
}

/** Figura fronte/retro con i muscoli colorati. */
export function MuscleFigure(props: Props) {
  const muscles = props.primary?.join(', ');
  return (
    <svg
      viewBox="0 0 210 196"
      className={cn('block', props.className)}
      role="img"
      aria-label={muscles ? `Muscoli coinvolti: ${muscles}` : 'Mappa muscolare'}
    >
      <Figure shapes={FRONT} props={props} dx={0} />
      <Figure shapes={BACK} props={props} dx={110} />
      {props.labels && (
        <g fill="#8A8A90" fontSize={9} fontWeight={600} textAnchor="middle">
          <text x={50} y={196}>Fronte</text>
          <text x={160} y={196}>Retro</text>
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
