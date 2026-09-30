import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  default: 'bg-surface-2 text-fg-2 border-line-subtle',
  accent: 'bg-accent-glow text-accent-400 border-accent-500/25',
  success: 'bg-success-bg text-success border-success/25',
  warning: 'bg-warning-bg text-warning border-warning/25',
  danger: 'bg-danger-bg text-danger border-danger/25',
  info: 'bg-info-bg text-info border-info/25',
};

interface ChipProps {
  tone?: Tone;
  /** Colore custom (es. gruppo muscolare): sovrascrive il tono. */
  color?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Chip({ tone = 'default', color, icon, className, children }: ChipProps) {
  const style: CSSProperties | undefined = color
    ? { color, backgroundColor: `${color}1f`, borderColor: `${color}40` }
    : undefined;
  return (
    <span
      style={style}
      className={cn(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs',
        !color && tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
