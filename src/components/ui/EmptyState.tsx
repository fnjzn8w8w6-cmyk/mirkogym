import type { ReactNode } from 'react';

type Illustration = 'dumbbell' | 'chart' | 'scale' | 'calendar';

function Art({ kind }: { kind: Illustration }) {
  const common = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg viewBox="0 0 96 96" className="h-24 w-24 text-accent-500" aria-hidden>
      <circle cx="48" cy="48" r="44" fill="var(--accent-glow)" />
      {kind === 'dumbbell' && (
        <g {...common}>
          <path d="M30 48h36" />
          <rect x="20" y="36" width="10" height="24" rx="3" />
          <rect x="66" y="36" width="10" height="24" rx="3" />
          <path d="M14 42v12M82 42v12" />
        </g>
      )}
      {kind === 'chart' && (
        <g {...common}>
          <path d="M24 70V26M24 70h50" />
          <path d="M30 60l12-14 10 8 16-20" />
          <circle cx="68" cy="34" r="3" fill="currentColor" />
        </g>
      )}
      {kind === 'scale' && (
        <g {...common}>
          <rect x="22" y="24" width="52" height="50" rx="10" />
          <path d="M36 40a12 12 0 0 1 24 0" />
          <path d="M48 40l5-6" />
        </g>
      )}
      {kind === 'calendar' && (
        <g {...common}>
          <rect x="22" y="28" width="52" height="46" rx="6" />
          <path d="M22 40h52M36 22v10M60 22v10" />
          <path d="M38 56l6 6 12-12" />
        </g>
      )}
    </svg>
  );
}

interface EmptyStateProps {
  illustration?: Illustration;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ illustration = 'dumbbell', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Art kind={illustration} />
      <h3 className="mt-5 text-lg text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-base text-fg-2">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
