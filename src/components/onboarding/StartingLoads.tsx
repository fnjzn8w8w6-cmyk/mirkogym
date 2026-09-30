import { useState } from 'react';
import { Check } from 'lucide-react';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { parseNum } from '@/hooks/use-active-session';
import { settle } from '@/lib/firestore';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { Button } from '../ui/Button';

/** Flusso guidato (opzionale) per inserire i carichi di partenza di ogni esercizio. */
export function StartingLoads() {
  const { days, save } = useSchedule();
  const { update } = useSettings();
  const [dayIdx, setDayIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const day = days[dayIdx];
  const last = dayIdx === days.length - 1;

  const skip = async () => {
    setBusy(true);
    await settle(update({ startingLoadsPrompted: true }));
  };

  const saveAll = async () => {
    setBusy(true);
    const next = days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        const w = parseNum(values[e.id] ?? '');
        return w != null && w > 0 ? { ...e, startWeight: w } : e;
      }),
    }));
    await settle(save(next));
    await settle(update({ startingLoadsPrompted: true }));
  };

  if (!day) return null;
  const filled = Object.values(values).filter((v) => parseNum(v) != null).length;

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl text-fg">Carichi di partenza</h1>
          <p className="mt-1 text-base text-fg-2">
            Opzionale: inserisci i pesi che usi oggi. Saranno il primo suggerimento in sessione.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={skip} disabled={busy}>
          Salta
        </Button>
      </div>

      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4" role="tablist">
        {days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={i === dayIdx}
            onClick={() => setDayIdx(i)}
            className={cn(
              'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors',
              i === dayIdx ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
            )}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm text-fg-3">{day.subtitle}</div>
      <ul className="mt-2 flex-1 space-y-2 pb-40">
        {day.exercises.map((e) => (
          <li key={e.id} className="card flex items-center gap-3 p-3">
            <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: groupColor(e.group) }} aria-hidden />
            <label htmlFor={`sw-${e.id}`} className="min-w-0 flex-1">
              <div className="truncate text-base text-fg">{e.name}</div>
              <div className="text-sm text-fg-3">
                {e.sets}×{e.repMin}-{e.repMax}
              </div>
            </label>
            <div className="relative w-28">
              <input
                id={`sw-${e.id}`}
                inputMode="decimal"
                placeholder="—"
                value={values[e.id] ?? ''}
                onChange={(ev) => setValues((v) => ({ ...v, [e.id]: ev.target.value }))}
                className="h-12 w-full rounded-md border border-line bg-surface-2 pl-3 pr-9 text-right text-lg font-semibold text-fg outline-none focus:border-accent-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-3">kg</span>
            </div>
          </li>
        ))}
      </ul>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-line-subtle bg-base/90 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="mx-auto flex max-w-2xl gap-3 px-4 pt-4">
          {dayIdx > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setDayIdx(dayIdx - 1)}>
              Indietro
            </Button>
          )}
          <Button
            size="lg"
            fullWidth
            loading={busy}
            icon={last ? <Check className="h-5 w-5" /> : undefined}
            onClick={() => (last ? saveAll() : setDayIdx(dayIdx + 1))}
          >
            {last ? `Salva${filled ? ` (${filled})` : ''}` : `Avanti · ${days[dayIdx + 1]?.name}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
