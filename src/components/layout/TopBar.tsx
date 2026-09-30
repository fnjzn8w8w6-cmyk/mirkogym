import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { IconButton } from '../ui/Button';

interface TopBarProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  right?: ReactNode;
  large?: boolean;
}

export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning-bg px-2 text-xs text-warning" role="status">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> offline
    </span>
  );
}

export function TopBar({ title, subtitle, back, right, large }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-30 border-b border-line-subtle bg-base/85 backdrop-blur-xl"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="mx-auto flex min-h-[56px] w-full max-w-2xl items-center gap-2 px-4">
        {back && (
          <IconButton
            label="Indietro"
            className="-ml-3"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <ChevronLeft className="h-6 w-6" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1 py-2">
          {title && <h1 className={large ? 'truncate font-display text-[22px] font-extrabold leading-tight text-fg' : 'truncate text-lg text-fg'}>{title}</h1>}
          {subtitle && <div className="truncate text-sm text-fg-3">{subtitle}</div>}
        </div>
        <OfflineBadge />
        {right}
      </div>
    </header>
  );
}
