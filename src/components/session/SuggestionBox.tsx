import { History, Sparkles, TrendingDown, TrendingUp, Equal, Info } from 'lucide-react';
import type { Suggestion } from '@/types';
import { formatKg } from '@/lib/analytics';
import { HelpTip, NewBadge } from '@/components/ui/Help';
import { cn } from '@/lib/cn';

interface SuggestionBoxProps {
  suggestion: Suggestion;
  lastText?: string;
}

const icons = {
  progress: TrendingUp,
  maintain: Equal,
  deload: TrendingDown,
  'exercise-deload': TrendingDown,
  first: Sparkles,
  start: Info,
};

export function SuggestionBox({ suggestion, lastText }: SuggestionBoxProps) {
  const Icon = icons[suggestion.type];
  const tone =
    suggestion.type === 'progress'
      ? 'border-success/25 bg-success-bg'
      : suggestion.type === 'deload' || suggestion.type === 'exercise-deload'
        ? 'border-info/25 bg-info-bg'
        : 'border-warning/20 bg-warning-bg';
  const iconColor =
    suggestion.type === 'progress'
      ? 'text-success'
      : suggestion.type === 'deload' || suggestion.type === 'exercise-deload'
        ? 'text-info'
        : 'text-warning';

  return (
    <div className={cn('rounded-md border px-3 py-2.5', tone)}>
      {lastText && (
        <div className="flex items-start gap-2 text-sm text-fg-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" aria-hidden />
          <span>
            <span className="text-fg-3">Ultima volta: </span>
            {lastText}
          </span>
        </div>
      )}
      <div className={cn('flex items-start gap-2 text-sm', lastText && 'mt-1')}>
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColor)} aria-hidden />
        <span className="text-fg">
          {suggestion.weight != null && (
            <>
              <span className="font-bold">→ Suggerito: {formatKg(suggestion.weight, 2)} kg</span>{' '}
            </>
          )}
          <span className="text-fg-2">({suggestion.hint})</span>
          {/RIR calibrato|Settimana leggera|Carico equivalente/.test(suggestion.hint) && <NewBadge />}
        </span>
        <HelpTip id="session-suggestion" className="ml-auto mt-0.5" />
      </div>
    </div>
  );
}
