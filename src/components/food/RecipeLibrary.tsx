import { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { SectionTitle } from '@/components/ui/Help';
import { useSettings } from '@/hooks/use-settings';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { cn } from '@/lib/cn';
import { normalize, type Macros } from '@/lib/foods';
import { CATEGORY_IT, type Recipe } from '@/lib/recipes';
import type { DiaryMeal } from '@/types';
import { RecipeAmountStep } from './FoodPicker';
import { RecipeEditor } from './RecipeEditor';
import { FavoriteButton, RecipeImage } from './shared';

type Filter = 'often' | 'mine' | 'fav' | 'all' | 'protein' | 'quick';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'often', label: '🕘 Mangiate spesso' },
  { value: 'mine', label: '⭐ Le mie' },
  { value: 'fav', label: '❤️ Preferite' },
  { value: 'all', label: 'Tutte' },
  { value: 'protein', label: '💪 Proteiche' },
  { value: 'quick', label: '⚡ ≤ 30 min' },
];
const MEAL_SLOT: Record<DiaryMeal, Recipe['slot']> = { colazione: 'colazione', pranzo: 'main', cena: 'main', spuntini: 'spuntino' };
const PAGE = 30;

/** La porzione "ci sta" nella quota del pasto: né troppo poco né oltre. */
const fits = (r: Recipe, budget: number) => Boolean(r.k && budget >= 120 && r.k[0] <= budget * 1.1 && r.k[0] >= budget * 0.5);
/** Quota tipica di ogni pasto sulla giornata. */
const SHARE: Record<DiaryMeal, number> = { colazione: 0.25, pranzo: 0.35, cena: 0.35, spuntini: 0.15 };

/**
 * Libreria ricette del diario (come la libreria esercizi): le tue ricette, le preferite,
 * quelle che mangi più spesso e tutto il ricettario, con le porzioni da scegliere.
 */
export function RecipeLibrary({
  open,
  onClose,
  title,
  meal,
  recipes,
  remaining,
  dayTarget,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meal: DiaryMeal;
  recipes: Recipe[];
  remaining: Macros;
  /** obiettivo calorico del giorno */
  dayTarget: number;
  onPick: (r: Recipe, servings: number) => void;
}) {
  const { settings } = useSettings();
  const favs = settings.favoriteRecipes ?? [];
  const logs = useRecentFoodLogs(120);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [chosen, setChosen] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);

  // quante volte hai registrato ogni ricetta nel diario
  const eaten = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) for (const e of l.entries) if (e.recipeId) m.set(e.recipeId, (m.get(e.recipeId) ?? 0) + 1);
    return m;
  }, [logs]);
  const usable = useMemo(() => recipes.filter((r) => r.k), [recipes]);
  // quanto "spendere" in questo pasto: quello che manca, ma non più della quota tipica del pasto (+30%)
  const budget = Math.max(0, Math.min(remaining.kcal, dayTarget * SHARE[meal] * 1.3));

  useEffect(() => {
    if (!open) return;
    setQ('');
    setChosen(null);
    setLimit(PAGE);
    setFilter(eaten.size ? 'often' : usable.some((r) => r.user) ? 'mine' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = useMemo(() => {
    const words = normalize(q.trim()).split(/\s+/).filter(Boolean);
    const slot = MEAL_SLOT[meal];
    return usable
      .filter((r) => {
        switch (filter) {
          case 'often':
            return eaten.has(r.id);
          case 'mine':
            return Boolean(r.user);
          case 'fav':
            return favs.includes(r.id);
          case 'protein':
            return Boolean(r.k && r.k[0] && (r.k[1] * 4) / r.k[0] >= 0.25 && r.k[1] >= 20);
          case 'quick':
            return r.min > 0 && r.min <= 30;
          default:
            return true;
        }
      })
      .filter((r) => {
        if (!words.length) return true;
        const text = normalize(`${r.t} ${CATEGORY_IT[r.cat] ?? ''} ${r.i.map((x) => x[0]).join(' ')}`);
        return words.every((w) => text.includes(w));
      })
      .sort(
        (a, b) =>
          (filter === 'often' ? (eaten.get(b.id) ?? 0) - (eaten.get(a.id) ?? 0) : 0) ||
          Number(b.slot === slot) - Number(a.slot === slot) ||
          Number(fits(b, budget)) - Number(fits(a, budget)) ||
          Number(Boolean(b.user)) - Number(Boolean(a.user)) ||
          Number(favs.includes(b.id)) - Number(favs.includes(a.id)),
      );
  }, [usable, q, filter, eaten, favs, meal, budget]);

  const chip = (active: boolean) =>
    cn('h-9 shrink-0 rounded-full border px-3 text-sm', active ? 'border-accent-500 bg-accent-glow font-semibold text-accent-400' : 'border-line bg-surface-2 text-fg-2');

  return (
    <>
      <Modal open={open && !creating} onClose={chosen ? () => setChosen(null) : onClose} title={chosen ? chosen.t : title}>
        {chosen ? (
          <RecipeAmountStep recipe={chosen} onConfirm={(sv) => onPick(chosen, sv)} />
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="diet-library" isNew>
                Libreria ricette
              </SectionTitle>
            </div>
            <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface-2 px-4 focus-within:border-accent-500">
              <Search className="h-4 w-4 text-fg-3" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Cerca ricetta o ingrediente…"
                aria-label="Cerca ricette"
                className="h-full flex-1 bg-transparent text-base text-fg outline-none"
              />
            </label>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  className={chip(filter === f.value)}
                  onClick={() => {
                    setFilter(f.value);
                    setLimit(PAGE);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {budget >= 120 && (
              <p className="text-sm text-fg-2">
                Ti mancano <strong className="text-accent-400">{Math.round(remaining.kcal)} kcal</strong>
                {budget < remaining.kcal - 50 ? (
                  <>
                    , per questo pasto circa <strong className="text-fg">{Math.round(budget / 10) * 10} kcal</strong>
                  </>
                ) : null}
                : in verde le ricette che ci stanno con 1 porzione.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {filter === 'mine' && !q && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-violet-400/60 bg-surface p-3 text-center"
                >
                  <Plus className="h-8 w-8 text-violet-400" aria-hidden />
                  <span className="text-sm font-semibold text-fg">Crea nuova ricetta</span>
                  <span className="text-xs text-fg-3">la ritrovi in "Le mie"</span>
                </button>
              )}
              {list.slice(0, limit).map((r) => {
                const ok = fits(r, budget);
                const times = eaten.get(r.id);
                return (
                  <div key={r.id} className={cn('relative overflow-hidden rounded-lg border bg-surface', ok ? 'border-accent-500/70' : 'border-line-subtle')}>
                    <button type="button" onClick={() => setChosen(r)} className="block w-full text-left" aria-label={`Scegli ${r.t}`}>
                      <RecipeImage recipe={r} className="aspect-[4/3] w-full" />
                      <div className="p-2.5">
                        <div className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight text-fg">{r.t}</div>
                        <div className={cn('mt-1 flex items-center gap-1 text-xs', ok ? 'text-accent-400' : 'text-fg-3')}>
                          <span>
                            {r.k![0]} kcal · P {r.k![1]}
                            {ok ? ' ✓' : ''}
                          </span>
                          {r.min > 0 && (
                            <span className="ml-auto flex items-center gap-0.5 text-fg-3">
                              <Clock className="h-3 w-3" aria-hidden />
                              {r.min}′
                            </span>
                          )}
                        </div>
                        {times ? <div className="text-xs text-fg-3">mangiata {times} {times === 1 ? 'volta' : 'volte'}</div> : null}
                      </div>
                    </button>
                    <FavoriteButton id={r.id} className="absolute right-2 top-2 h-8 w-8" />
                  </div>
                );
              })}
            </div>
            {list.length > limit && (
              <button type="button" className="h-11 w-full rounded-md border border-line bg-surface-2 text-sm font-semibold text-fg-2" onClick={() => setLimit(limit + PAGE)}>
                Mostra altre ({list.length - limit})
              </button>
            )}
            {list.length === 0 && (
              <p className="py-4 text-center text-sm text-fg-3">
                {filter === 'often' ? 'Non hai ancora registrato ricette nel diario.' : filter === 'mine' && !q ? '' : 'Nessuna ricetta con questi filtri.'}
              </p>
            )}
          </div>
        )}
      </Modal>
      <RecipeEditor open={creating} onClose={() => setCreating(false)} onSaved={() => setFilter('mine')} />
    </>
  );
}
