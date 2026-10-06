import { useId } from 'react';
import { Medal as MedalIcon } from '@phosphor-icons/react';
import { iconFor } from '@/jsx/emoji-icons';

type Tier = 'bronze' | 'silver' | 'gold' | 'legend';
const METAL: Record<Tier, [string, string]> = {
  bronze: ['#F0B27A', '#9C5B2E'],
  silver: ['#F1F4F3', '#8E9893'],
  gold: ['#FFE08A', '#C8921E'],
  legend: ['#7CFFB5', '#1E9E5A'],
};
const HEX = 'M48 4 L86 26 L86 70 L48 92 L10 70 L10 26 Z';
const INNER = 'M48 12 L79 30 L79 66 L48 84 L17 66 L17 30 Z';

/** Medaglia esagonale dei traguardi: cornice metallica per livello, icona piena al centro. */
export function Medal({ emoji, tier, unlocked = true, size = 56 }: { emoji: string; tier: Tier; unlocked?: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const I = iconFor(emoji) ?? MedalIcon;
  const [a, b] = METAL[tier];
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden style={tier === 'legend' && unlocked ? { filter: 'drop-shadow(0 0 8px rgba(61,220,132,.5))' } : undefined}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset=".55" stopColor={b} />
          <stop offset="1" stopColor={a} />
        </linearGradient>
      </defs>
      {unlocked ? (
        <>
          <path d={HEX} fill={`url(#${id})`} />
          <path d={INNER} fill="#0D0F0E" />
        </>
      ) : (
        <path d={HEX} fill="#151816" stroke="#2A302C" strokeWidth="3" />
      )}
      <svg x="28" y="28" width="40" height="40" viewBox="0 0 256 256" overflow="visible">
        <I size={256} weight="fill" color={unlocked ? a : '#3A413D'} />
      </svg>
    </svg>
  );
}
