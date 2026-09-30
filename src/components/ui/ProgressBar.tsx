import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface LinearProps {
  value: number; // 0..1
  className?: string;
  color?: string;
  label?: string;
}

export function ProgressBar({ value, className, color = 'var(--accent-500)', label }: LinearProps) {
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={false}
        animate={{ width: `${v * 100}%` }}
        transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      />
    </div>
  );
}

interface CircularProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label?: string;
}

export function CircularProgress({ value, size = 56, stroke = 5, color = 'var(--accent-500)', children, label }: CircularProps) {
  const v = Math.min(Math.max(value, 0), 1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
