import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NewBadge, SectionTitle } from '@/components/ui/Help';
import { useSettings } from '@/hooks/use-settings';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useLearnedFavorites } from '@/hooks/use-habits';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { fmtPieces } from '@/lib/food-units';
import type { Macros } from '@/lib/foods';
import { DEFAULT_NUTRITION } from '@/lib/coach';
import { emptyMeals, habitsFor, suggestMeals, type Suggestion } from '@/lib/meal-suggest';
import type { RecipeData, SlotKey } from '@/lib/recipes';
import { fromISODate } from '@/lib/date-utils';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { planPrefs } from './NutritionPlanner';
import { fmtNum } from './shared';

const LABEL: Record<DiaryMeal, string> = { colazione: 'colazione', pranzo: 'pranzo', cena: 'cena', spuntini: 'spuntino' };
const MEAL_SLOTS: Record<DiaryMeal, SlotKey[]> = { colazione: ['colazione'], pranzo: ['pranzo'], cena: ['cena'], spuntini: ['spuntino', 'merenda'] };
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** "Ti mancano X kcal": pasti che chiudono calorie e macro rimanenti, partendo da ciò che mangi di solito. */
export function MealSuggest({
  remaining,
  entries,
  date,
  data,
  onAdd,
}: {
  remaining: Macros;
  entries: DiaryEntry[];
  date: string;
  data: RecipeData | null;
  onAdd: (items: DiaryEntry[], label: string) => void;
}) {
  const { settings, update } = useSettings();
  const history = useRecentFoodLogs(180);
  const learned = useLearnedFavorites();
  const empty = emptyMeals(entries);
  const [meal, setMeal] = useState<DiaryMeal>(empty[0] ?? 'spuntini');
  const [open, setOpen] = useState(false);
  const [exclude, setExclude] = useState<string[]>([]);
  // "Tutto in questo pasto" (chiudi la giornata con un pasto solo) oppure "Dividi tra i pasti vuoti"
  const [mode, setMode] = useState<'all' | 'split'>(() => {
    try {
      const v = localStorage.getItem('suggest-mode');
      if (v === 'all' || v === 'split') return v;
    } catch {
      /* non disponibile */
    }
    return 'all';
  });
  const feedback = settings.mealFeedback ?? { liked: [], skipped: [] };

  const prefs = useMemo(
    () => planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, [...(settings.favoriteRecipes ?? []), ...learned.map((l) => l.id)]),
    [settings.nutritionPrefs, settings.favoriteRecipes, learned],
  );
  const past = useMemo(() => history.filter((l) => l.date !== date), [history, date]);
  const planMeal = useMemo(() => {
    const day = settings.weekPlan?.days[(fromISODate(date).getDay() + 6) % 7]?.meals ?? [];
    return day.find((m) => MEAL_SLOTS[meal].includes(m.slot)) ?? null;
  }, [settings.weekPlan, date, meal]);
  // Quota del pasto: ciò che manca si divide tra i pasti principali ancora vuoti (lo spuntino ha una quota piccola)
  const splitShare = useMemo(() => {
    const W: Record<DiaryMeal, number> = { colazione: 0.25, pranzo: 0.35, cena: 0.35, spuntini: 0.12 };
    const open_ = new Set(empty.filter((m) => m !== 'spuntini'));
    if (meal !== 'spuntini') open_.add(meal);
    const pool = [...open_].reduce((a, m) => a + W[m], 0) + (meal === 'spuntini' ? W.spuntini : 0);
    return pool > 0 ? Math.min(1, W[meal] / pool) : 1;
  }, [empty, meal]);
  const canSplit = splitShare < 0.999;
  const share = mode === 'split' && canSplit ? splitShare : 1;
  const mealRem = useMemo(
    () => ({ kcal: remaining.kcal * share, protein: remaining.protein * share, carbs: remaining.carbs * share, fat: remaining.fat * share }),
    [remaining, share],
  );
  const list = useMemo(
    () => (open ? suggestMeals({ remaining: mealRem, meal, foodLogs: past, data, prefs, planMeal, feedback, exclude }) : []),
    [open, mealRem, meal, past, data, prefs, planMeal, feedback, exclude],
  );
  const habits = useMemo(() => habitsFor(past, meal).slice(0, 3), [past, meal]);

  if (remaining.kcal < 150) return null;

  const saveFeedback = (patch: Partial<typeof feedback>) =>
    void settle(update({ mealFeedback: { liked: (patch.liked ?? feedback.liked).slice(-100), skipped: (patch.skipped ?? feedback.skipped).slice(-100) } }));

  const add = (s: Suggestion) => {
    const now = Date.now();
    onAdd(
      s.items.map((i) => ({
        id: uid(),
        meal,
        name: i.name,
        unit: i.unit,
        qty: i.qty,
        per: i.per,
        ...(i.foodId ? { foodId: i.foodId } : {}),
        ...(i.recipeId ? { recipeId: i.recipeId } : {}),
        ...(i.pieces && i.pieceGrams ? { pieces: i.pieces, pieceGrams: i.pieceGrams } : {}),
        createdAt: now,
      })),
      LABEL[meal],
    );
    saveFeedback({ liked: [...feedback.liked.filter((k) => k !== s.key), s.key] });
    setOpen(false);
    setExclude([]);
  };

  const r = (v: number) => Math.round(v);
  return (
    <Card className="border-accent-500/40 p-4" style={{ background: 'linear-gradient(135deg, rgba(57,255,136,0.08), rgba(21,15,34,0.95))' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
            <SectionTitle help="diet-suggest" isNew>
              Cosa mangio adesso?
            </SectionTitle>
          </div>
          <div className="mt-1 text-base text-fg">
            Ti mancano <strong className="font-display text-accent-400">{r(remaining.kcal)} kcal</strong>
          </div>
          <div className="text-xs text-fg-2">
            P {r(Math.max(0, remaining.protein))} g · C {r(Math.max(0, remaining.carbs))} g · G {r(Math.max(0, remaining.fat))} g
          </div>
          {share < 0.999 && (
            <div className="mt-1 text-xs text-fg-3">
              Per {meal === 'spuntini' ? 'lo spuntino' : `${meal === 'colazione' ? 'la' : 'il'} ${LABEL[meal]}`}: circa <strong className="text-fg">{r(mealRem.kcal)} kcal</strong> (il resto per gli altri pasti vuoti)
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(['colazione', 'pranzo', 'cena', 'spuntini'] as DiaryMeal[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={meal === m}
            onClick={() => {
              setMeal(m);
              setExclude([]);
            }}
            className={cn('h-8 rounded-full border px-3 text-xs font-semibold capitalize', meal === m ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2')}
          >
            {LABEL[m]}
            {!empty.includes(m) && m !== 'spuntini' ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {canSplit && (
        <div className="mt-2 flex rounded-full bg-surface-2 p-1 text-xs font-semibold" role="radiogroup" aria-label="Come usare le calorie mancanti">
          {(
            [
              ['all', `Tutto in ${meal === 'spuntini' ? 'uno spuntino' : `questo pasto`}`],
              ['split', 'Dividi tra i pasti vuoti'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              onClick={() => {
                setMode(v);
                setExclude([]);
                try {
                  localStorage.setItem('suggest-mode', v);
                } catch {
                  /* non disponibile */
                }
              }}
              className={cn('flex-1 rounded-full px-2 py-1.5', mode === v ? 'bg-accent-500 text-onaccent' : 'text-fg-2')}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {!open ? (
        <Button className="mt-3" fullWidth icon={<Sparkles className="h-5 w-5" />} onClick={() => setOpen(true)}>
          Suggeriscimi un pasto
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          {list.length === 0 && <p className="text-sm text-fg-3">Carico le idee…</p>}
          {list.map((s) => (
            <div key={s.key} className="rounded-lg border border-line-subtle bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold text-fg">
                  {s.emoji} {s.source === 'storico' ? `L'hai già mangiato ${s.times} ${s.times === 1 ? 'volta' : 'volte'}` : s.source === 'piano' ? 'Dal tuo piano di oggi' : s.title}
                </div>
                <span className="shrink-0 font-display text-sm font-extrabold text-accent-400">{r(s.macros.kcal)} kcal</span>
              </div>
              <ul className="mt-1 text-sm text-fg-2">
                {s.items.map((i) => (
                  <li key={i.name}>
                    • {i.name} —{' '}
                    {i.unit === 'porzione' ? `${fmtNum(i.qty)} ${i.qty === 1 ? 'porzione' : 'porzioni'}` : i.pieces ? `${fmtPieces(i.pieces)} pz (${fmtNum(i.qty)} g)` : `${fmtNum(i.qty)} g`}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-xs text-fg-3">
                {(
                  [
                    ['P', s.macros.protein, mealRem.protein],
                    ['C', s.macros.carbs, mealRem.carbs],
                    ['G', s.macros.fat, mealRem.fat],
                  ] as [string, number, number][]
                ).map(([l, v, t]) => (
                  <span key={l} className={cn('mr-2', Math.abs(v - t) <= Math.max(5, t * 0.2) ? 'text-accent-400' : '')}>
                    {l} {r(v)}/{r(Math.max(0, t))}
                    {Math.abs(v - t) <= Math.max(5, t * 0.2) ? ' ✓' : ''}
                  </span>
                ))}
              </div>
              <Button size="sm" className="mt-2" fullWidth onClick={() => add(s)}>
                Aggiungi a {LABEL[meal]}
              </Button>
            </div>
          ))}
          {list.length > 0 && Math.max(...list.map((x) => x.macros.kcal)) < mealRem.kcal * 0.85 && (
            <p className="text-xs text-fg-3">
              ℹ️ Sono tante calorie per un solo {meal === 'spuntini' ? 'spuntino' : 'pasto'}: le proposte arrivano al massimo a porzioni ragionevoli. Il resto puoi coprirlo con un altro pasto.
            </p>
          )}
          {list.length > 0 && (
            <button
              type="button"
              className="w-full text-center text-sm font-semibold text-violet-400"
              onClick={() => {
                setExclude((x) => [...x, ...list.map((s) => s.key)]);
                saveFeedback({ skipped: [...feedback.skipped, ...list.map((s) => s.key)] });
              }}
            >
              Altre idee ↻
            </button>
          )}
        </div>
      )}
      {habits.length > 0 && (
        <p className="mt-3 text-xs text-fg-3">
          🕘 Dal tuo storico, a {LABEL[meal]} mangi spesso: {habits.map((h) => `${h.name} (${h.count})`).join(', ')}. <NewBadge />
        </p>
      )}
    </Card>
  );
}
