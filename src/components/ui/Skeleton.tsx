import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

/** Placeholder generico di pagina durante il caricamento. */
export function PageSkeleton() {
  return (
    <div className="page space-y-4 pt-4" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  );
}
