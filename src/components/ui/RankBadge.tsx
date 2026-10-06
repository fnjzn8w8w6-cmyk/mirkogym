import { useId } from 'react';
import { Crown, SketchLogo, Star } from '@phosphor-icons/react';

/** Metallo di ogni rango (chiaro, medio, scuro) e colore del simbolo. Indici come RANKS. */
const METAL: [string, string, string, string][] = [
  ['#9A9FA3', '#4A4E52', '#2A2D30', '#C3C8CC'], // Ferro
  ['#F0B07A', '#A9622F', '#5E3214', '#F3C29A'], // Bronzo
  ['#F4F7FA', '#A9B2BC', '#5D6670', '#F4F7FA'], // Argento
  ['#FFE9A3', '#E0A82E', '#7A5410', '#FFE29A'], // Oro
  ['#D9FFF8', '#5ED6C2', '#1D6E66', '#C9FFF5'], // Platino
  ['#DCEBFF', '#5B9DF5', '#1E3F8C', '#DCEBFF'], // Diamante
  ['#C9FFE0', '#3DDC84', '#0F5A33', '#D9FFE9'], // Campione
];
const SHIELD = 'M50 4 L90 16 L90 52 C90 78 72 96 50 106 C28 96 10 78 10 52 L10 16 Z';
const INNER = 'M50 13 L82 22.5 L82 52 C82 73 68 88 50 97 C32 88 18 73 18 52 L18 22.5 Z';
const chevron = (y: number) => `M32 ${y} L50 ${y + 10} L68 ${y} L68 ${y + 7} L50 ${y + 17} L32 ${y + 7}Z`;

/** Stemma a scudo dei ranghi di forza: metallo e simbolo cambiano a ogni rango. */
export function RankBadge({ rank, size = 44, locked = false }: { rank: number; size?: number; locked?: boolean }) {
  const id = useId().replace(/:/g, '');
  const r = Math.max(0, Math.min(METAL.length - 1, rank));
  const [a, b, c, light] = METAL[r];
  const glow = r === 6 ? 'drop-shadow(0 0 8px rgba(61,220,132,.55))' : r === 5 ? 'drop-shadow(0 0 6px rgba(91,157,245,.4))' : undefined;
  const glyph = (I: typeof Star, s: number, x: number, y: number) => (
    <svg x={x} y={y} width={s} height={s} viewBox="0 0 256 256" overflow="visible">
      <I size={256} weight="fill" color={light} />
    </svg>
  );
  if (locked)
    return (
      <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden>
        <path d={SHIELD} fill="#151816" stroke="#2A302C" strokeWidth="2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden style={glow ? { filter: glow } : undefined}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset=".5" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${id})`} />
      <path d={INNER} fill="#0D0F0E" />
      <path d={INNER} fill={b} opacity=".1" />
      <g fill={light}>
        {r <= 2 && Array.from({ length: r + 1 }, (_, i) => <path key={i} d={chevron(66 - i * 13 + r * 6.5)} />)}
        {(r === 3 || r === 6) && <path d={chevron(r === 3 ? 72 : 74)} />}
      </g>
      {r === 3 && glyph(Star, 40, 30, 30)}
      {r === 4 && (
        <>
          {glyph(Star, 30, 35, 24)}
          {glyph(Star, 22, 27, 54)}
          {glyph(Star, 22, 51, 54)}
        </>
      )}
      {r === 5 && glyph(SketchLogo, 46, 27, 30)}
      {r === 6 && glyph(Crown, 44, 28, 28)}
    </svg>
  );
}
