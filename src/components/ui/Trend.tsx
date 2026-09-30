import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatKg } from '@/lib/analytics';
import { cn } from '@/lib/cn';

interface TrendLineProps {
  delta: number | null;
  label: string;
  unit: string;
  /** 'up-good' = salire è positivo (verde), 'down-good' = scendere è positivo, 'neutral' = colori informativi. */
  polarity?: 'up-good' | 'down-good' | 'neutral';
}

export function TrendLine({ delta, label, unit, polarity = 'neutral' }: TrendLineProps) {
  if (delta == null) return <div className="text-sm text-fg-3">— · {label}</div>;
  const flat = Math.abs(delta) < 0.05;
  const up = delta > 0;
  const good = polarity === 'up-good' ? up : !up;
  const color = flat
    ? 'text-fg-3'
    : polarity === 'neutral'
      ? up
        ? 'text-warning'
        : 'text-info'
      : good
        ? 'text-success'
        : 'text-danger';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn('flex items-center gap-1 text-sm font-semibold', color)}>
      <Icon className="h-4 w-4" aria-hidden />
      {up && !flat ? '+' : ''}
      {formatKg(delta)}
      {unit} <span className="font-medium text-fg-3">· {label}</span>
    </div>
  );
}
