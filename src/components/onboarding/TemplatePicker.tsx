import { Check } from 'lucide-react';
import { TEMPLATES, type Template } from '@/lib/templates';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';

/** Elenco dei modelli di scheda, con anteprima dei gruppi allenati. */
export function TemplatePicker({ value, onChange }: { value: string | null; onChange: (t: Template) => void }) {
  return (
    <ul className="space-y-2">
      {TEMPLATES.map((t) => {
        const days = t.days();
        const groups = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))];
        const active = value === t.id;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onChange(t)}
              aria-pressed={active}
              className={cn(
                'card flex w-full items-start gap-3 p-4 text-left transition-colors',
                active ? 'border-accent-500 bg-accent-glow' : 'hover:border-line-strong',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-lg text-fg">{t.name}</span>
                  <span className="shrink-0 text-xs text-fg-3">{t.level}</span>
                </span>
                <span className="mt-0.5 block text-sm text-fg-2">{t.description}</span>
                {groups.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {groups.map((g) => (
                      <span key={g} className="flex items-center gap-1 text-xs text-fg-3">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: groupColor(g) }} aria-hidden />
                        {g}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-accent-500 bg-accent-500 text-onaccent' : 'border-line',
                )}
                aria-hidden
              >
                {active && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
