import { useCallback, useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/Help';
import { useSettings } from '@/hooks/use-settings';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useLearnedFavorites } from '@/hooks/use-habits';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { fmtPieces } from '@/lib/food-units';
import type { Macros } from '@/lib/foods';
import { DEFAULT_NUTRITION } from '@/lib/coach';
import { habitsFor, suggestMeals, type Suggestion } from '@/lib/meal-suggest';
import type { RecipeData, SlotKey } from '@/lib/recipes';
import { fromISODate } from '@/lib/date-utils';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { planPrefs } from './NutritionPlanner';
import { fmtNum } from './shared';

/** Momenti della giornata: i due spuntini (merenda e dopo cena) finiscono entrambi in "Spuntini" nel diario. */
type Moment = 'colazione' | 'pranzo' | 'merenda' | 'cena' | 'dopocena';
const MOMENTS: { key: Moment; label: string; emoji: string; meal: DiaryMeal; share: number; slots: SlotKey[] }[] = [
  { key: 'colazione', label: 'Colazione', emoji: '☕', meal: 'colazione', share: 0.25, slots: ['colazione'] },
  { key: 'pranzo', label: 'Pranzo', emoji: '🍝', meal: 'pranzo', share: 0.35, slots: ['pranzo'] },
  { key: 'merenda', label: 'Spuntino', emoji: '🍎', meal: 'spuntini', share: 0.12, slots: ['spuntino', 'merenda'] },
  { key: 'cena', label: 'Cena', emoji: '🍽️', meal: 'cena', share: 0.35, slots: ['cena'] },
  { key: 'dopocena', label: 'Dopo cena', emoji: '🌙', meal: 'spuntini', share: 0.1, slots: ['spuntino', 'merenda'] },
];
const M = Object.fromEntries(MOMENTS.map((m) => [m.key, m])) as Record<Moment, (typeof MOMENTS)[number]>;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const r0 = (v: number) => Math.round(v);
const scale = (m: Macros, k: number): Macros => ({ kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k });

/** Che pasto è adesso: dall'ora e da cosa hai già segnato nel diario. */
export function momentNow(entries: DiaryEntry[], now = new Date()): Moment {
  const h = now.getHours() + now.getMinutes() / 60;
  const has = (m: DiaryMeal) => entries.some((e) => e.meal === m);
  if (h < 10.5) return has('colazione') ? 'merenda' : 'colazione';
  if (h < 12) return 'merenda';
  if (h < 15) return has('pranzo') ? 'merenda' : 'pranzo';
  if (h < 19) return 'merenda';
  if (h < 22) return has('cena') ? 'dopocena' : 'cena';
  return 'dopocena';
}

/** Dati comuni alle due sezioni: storico, gusti, piano del giorno, "mi piace" e "scartati". */
function useSuggestContext(date: string, data: RecipeData | null) {
  const { settings, update } = useSettings();
  const history = useRecentFoodLogs(180);
  const learned = useLearnedFavorites();
  const feedback = useMemo(() => settings.mealFeedback ?? { liked: [], skipped: [] }, [settings.mealFeedback]);
  const prefs = useMemo(
    () => planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, [...(settings.favoriteRecipes ?? []), ...learned.map((l) => l.id)]),
    [settings.nutritionPrefs, settings.favoriteRecipes, learned],
  );
  const past = useMemo(() => history.filter((l) => l.date !== date), [history, date]);
  const planDay = useMemo(() => settings.weekPlan?.days[(fromISODate(date).getDay() + 6) % 7]?.meals ?? [], [settings.weekPlan, date]);
  const suggest = useCallback(
    (moment: Moment, remaining: Macros, exclude: string[], count = 3) =>
      suggestMeals({
      remaining,
      meal: M[moment].meal,
      foodLogs: past,
      data,
      prefs,
      planMeal: planDay.find((m) => M[moment].slots.includes(m.slot)) ?? null,
      feedback,
      exclude,
      count,
      }),
    [past, data, prefs, planDay, feedback],
  );
  const saveFeedback = (patch: Partial<typeof feedback>) =>
    void settle(update({ mealFeedback: { liked: (patch.liked ?? feedback.liked).slice(-100), skipped: (patch.skipped ?? feedback.skipped).slice(-100) } }));
  const toEntries = (s: Suggestion, meal: DiaryMeal): DiaryEntry[] => {
    const now = Date.now();
    return s.items.map((i) => ({
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
    }));
  };
  return { past, feedback, suggest, saveFeedback, toEntries };
}

function SuggestionCard({ s, target, title, action }: { s: Suggestion; target: Macros; title?: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-fg">
          {title ?? (
            <>
              {s.emoji} {s.source === 'storico' ? `L'hai già mangiato ${s.times} ${s.times === 1 ? 'volta' : 'volte'}` : s.source === 'piano' ? 'Dal tuo piano di oggi' : s.title}
            </>
          )}
        </div>
        <span className="shrink-0 font-display text-sm font-extrabold text-accent-400">{r0(s.macros.kcal)} kcal</span>
      </div>
      <ul className="mt-1 text-sm text-fg-2">
        {s.items.map((i) => (
          <li key={i.name}>
            • {i.name} — {i.unit === 'porzione' ? `${fmtNum(i.qty)} ${i.qty === 1 ? 'porzione' : 'porzioni'}` : i.pieces ? `${fmtPieces(i.pieces)} pz (${fmtNum(i.qty)} g)` : `${fmtNum(i.qty)} g`}
          </li>
        ))}
      </ul>
      <div className="mt-1 text-xs text-fg-3">
        {(
          [
            ['P', s.macros.protein, target.protein],
            ['C', s.macros.carbs, target.carbs],
            ['G', s.macros.fat, target.fat],
          ] as [string, number, number][]
        ).map(([l, v, t]) => {
          const ok = Math.abs(v - t) <= Math.max(5, t * 0.2);
          return (
            <span key={l} className={cn('mr-2', ok ? 'text-accent-400' : '')}>
              {l} {r0(v)}/{r0(Math.max(0, t))}
              {ok ? ' ✓' : ''}
            </span>
          );
        })}
      </div>
      {action}
    </div>
  );
}

const chipCls = (on: boolean) => cn('h-8 rounded-full border px-3 text-xs font-semibold', on ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2');

/* ---------- 1) Cosa mangio adesso? ---------- */

/** Un pasto adatto a QUESTO momento: la quota normale di quel pasto, mai oltre quello che manca alla giornata. */
export function NowSuggest({
  remaining,
  dayTarget,
  entries,
  date,
  data,
  onAdd,
}: {
  remaining: Macros;
  dayTarget: number;
  entries: DiaryEntry[];
  date: string;
  data: RecipeData | null;
  onAdd: (items: DiaryEntry[], label: string) => void;
}) {
  const ctx = useSuggestContext(date, data);
  const auto = momentNow(entries);
  const [picked, setPicked] = useState<Moment | null>(null);
  const moment = picked ?? auto;
  const [open, setOpen] = useState(false);
  const [exclude, setExclude] = useState<string[]>([]);
  const mo = M[moment];
  const left = Math.max(0, remaining.kcal);
  const budget = Math.min(left, dayTarget * mo.share);
  const goal = useMemo(() => (left > 0 ? scale({ ...remaining, protein: Math.max(0, remaining.protein), carbs: Math.max(0, remaining.carbs), fat: Math.max(0, remaining.fat) }, budget / left) : remaining), [remaining, budget, left]);
  const { suggest } = ctx;
  const list = useMemo(() => (open && budget >= 100 ? suggest(moment, goal, exclude) : []), [open, budget, moment, goal, exclude, suggest]);
  const habits = useMemo(() => habitsFor(ctx.past, mo.meal).slice(0, 3), [ctx.past, mo.meal]);
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const icon = moment === 'dopocena' ? '🌙' : moment === 'colazione' ? '☀️' : '🕐';

  return (
    <Card className="border-accent-500/40 p-4" style={{ background: 'linear-gradient(135deg, rgba(61,220,132,0.08), rgba(13,15,14,0.95))' }}>
      <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
        <SectionTitle help="diet-suggest" isNew>
          Cosa mangio adesso?
        </SectionTitle>
      </div>
      <div className="mt-1 text-base text-fg">
        {picked ? mo.emoji : `${icon} Sono le ${time} →`} <strong>{mo.label.toLowerCase()}</strong>
      </div>
      {budget >= 100 ? (
        <div className="text-xs text-fg-2">
          circa <strong className="font-display text-accent-400">{Math.round(budget / 10) * 10} kcal</strong> · P {r0(goal.protein)} g
          {left - budget > 50 ? ` (alla giornata ne mancano ${r0(left)})` : ''}
        </div>
      ) : (
        <p className="mt-1 text-sm text-fg-2">
          👏 Hai già raggiunto le calorie di oggi. Se hai fame: verdure, yogurt magro, una tisana.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MOMENTS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={moment === m.key}
            onClick={() => {
              setPicked(m.key === auto ? null : m.key);
              setExclude([]);
            }}
            className={chipCls(moment === m.key)}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>
      {budget >= 100 &&
        (!open ? (
          <Button className="mt-3" fullWidth icon={<Sparkles className="h-5 w-5" />} onClick={() => setOpen(true)}>
            Suggeriscimi {moment === 'merenda' || moment === 'dopocena' ? 'uno spuntino' : `${moment === 'colazione' ? 'una' : 'la'} ${mo.label.toLowerCase()}`}
          </Button>
        ) : (
          <div className="mt-3 space-y-2">
            {list.length === 0 && <p className="text-sm text-fg-3">Carico le idee…</p>}
            {list.map((s) => (
              <SuggestionCard
                key={s.key}
                s={s}
                target={goal}
                action={
                  <Button
                    size="sm"
                    className="mt-2"
                    fullWidth
                    onClick={() => {
                      onAdd(ctx.toEntries(s, mo.meal), mo.label.toLowerCase());
                      ctx.saveFeedback({ liked: [...ctx.feedback.liked.filter((k) => k !== s.key), s.key] });
                      setOpen(false);
                      setExclude([]);
                    }}
                  >
                    Aggiungi a {mo.meal === 'spuntini' ? 'spuntini' : mo.label.toLowerCase()}
                  </Button>
                }
              />
            ))}
            {list.length > 0 && (
              <button
                type="button"
                className="w-full text-center text-sm font-semibold text-violet-400"
                onClick={() => {
                  setExclude((x) => [...x, ...list.map((s) => s.key)]);
                  ctx.saveFeedback({ skipped: [...ctx.feedback.skipped, ...list.map((s) => s.key)] });
                }}
              >
                Altre idee ↻
              </button>
            )}
          </div>
        ))}
      {habits.length > 0 && budget >= 100 && (
        <p className="mt-3 text-xs text-fg-3">
          🕘 Dal tuo storico, a {mo.label.toLowerCase()} mangi spesso: {habits.map((h) => `${h.name} (${h.count})`).join(', ')}.
        </p>
      )}
    </Card>
  );
}

/* ---------- 2) Ti mancano calorie? ---------- */

/** Le calorie che mancano alla giornata, divise tra i pasti che scegli tu. */
export function FillGap({
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
  const ctx = useSuggestContext(date, data);
  const [open, setOpen] = useState(false);
  const logged = (m: Moment) => M[m].meal !== 'spuntini' && entries.some((e) => e.meal === M[m].meal);
  // di partenza: i pasti principali ancora vuoti, altrimenti lo spuntino dopo cena (finché non scegli tu)
  const [manual, setManual] = useState<Moment[] | null>(null);
  const free = (['colazione', 'pranzo', 'cena'] as Moment[]).filter((m) => !logged(m));
  const sel = manual ?? (free.length ? free : (['dopocena'] as Moment[]));
  const setSel = (f: (s: Moment[]) => Moment[]) => setManual(f(sel));
  const [mode, setMode] = useState<'prop' | 'equal'>('prop');
  const [exclude, setExclude] = useState<Partial<Record<Moment, string[]>>>({});

  const shares = useMemo(() => {
    const ordered = MOMENTS.filter((m) => sel.includes(m.key));
    const tot = ordered.reduce((a, m) => a + (mode === 'equal' ? 1 : m.share), 0) || 1;
    return ordered.map((m) => ({ m, k: (mode === 'equal' ? 1 : m.share) / tot }));
  }, [sel, mode]);
  const rem = useMemo(
    () => ({ kcal: Math.max(0, remaining.kcal), protein: Math.max(0, remaining.protein), carbs: Math.max(0, remaining.carbs), fat: Math.max(0, remaining.fat) }),
    [remaining],
  );
  const { suggest } = ctx;
  const picks = useMemo(() => {
    if (!open) return [];
    // pasti diversi tra loro: un'idea già usata per un pasto non viene riproposta per il successivo
    const used: string[] = [];
    return shares.map(({ m, k }) => {
      const goal = scale(rem, k);
      const s = suggest(m.key, goal, [...(exclude[m.key] ?? []), ...used], 1)[0];
      if (s) used.push(s.key);
      return { m, goal, s };
    });
  }, [open, shares, rem, exclude, suggest]);

  if (remaining.kcal < 150) return null;

  const again = (m: Moment, key?: string) => {
    if (key) ctx.saveFeedback({ skipped: [...ctx.feedback.skipped, key] });
    setExclude((x) => ({ ...x, [m]: [...(x[m] ?? []), ...(key ? [key] : [])] }));
  };
  const addAll = () => {
    const ok = picks.filter((p) => p.s);
    if (!ok.length) return;
    onAdd(
      ok.flatMap((p) => ctx.toEntries(p.s!, p.m.meal)),
      ok.map((p) => p.m.label.toLowerCase()).join(' e '),
    );
    ctx.saveFeedback({ liked: [...ctx.feedback.liked, ...ok.map((p) => p.s!.key)] });
    setOpen(false);
    setExclude({});
  };

  return (
    <Card className="border-violet-400/40 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
        <SectionTitle help="diet-fill" isNew>
          Ti mancano calorie e non sai come raggiungerle?
        </SectionTitle>
      </div>
      <div className="mt-1 text-base text-fg">
        Ti mancano <strong className="font-display text-accent-400">{r0(remaining.kcal)} kcal</strong>
      </div>
      <div className="text-xs text-fg-2">
        P {r0(rem.protein)} g · C {r0(rem.carbs)} g · G {r0(rem.fat)} g
      </div>
      {!open ? (
        <Button className="mt-3" variant="secondary" fullWidth onClick={() => setOpen(true)}>
          Dividile tra i pasti
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-sm text-fg-2">1. In quali pasti vuoi recuperarle?</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MOMENTS.map((m) => {
                const on = sel.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSel((s) => (on ? (s.length > 1 ? s.filter((x) => x !== m.key) : s) : [...s, m.key]))}
                    className={chipCls(on)}
                  >
                    {m.emoji} {m.label}
                    {logged(m.key) ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>
          {sel.length > 1 && (
            <div>
              <div className="text-sm text-fg-2">2. Come le divido?</div>
              <div className="mt-1.5 flex rounded-full bg-surface-2 p-1 text-xs font-semibold" role="radiogroup" aria-label="Come dividere le calorie">
                {(
                  [
                    ['prop', 'In proporzione'],
                    ['equal', 'In parti uguali'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={mode === v}
                    onClick={() => setMode(v)}
                    className={cn('flex-1 rounded-full px-2 py-1.5', mode === v ? 'bg-accent-500 text-onaccent' : 'text-fg-2')}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(3, shares.length)}, minmax(0, 1fr))` }}>
            {shares.map(({ m, k }) => (
              <div key={m.key} className="rounded-md bg-surface-2 py-2 text-center text-xs text-fg-2">
                {m.emoji} {m.label}
                <div className="font-display text-base font-extrabold text-accent-400">{Math.round((rem.kcal * k) / 10) * 10} kcal</div>
              </div>
            ))}
          </div>
          {picks.map(({ m, goal, s }) =>
            s ? (
              <SuggestionCard
                key={m.key}
                s={s}
                target={goal}
                title={
                  <>
                    {m.emoji} {m.label} — {s.source === 'storico' ? `già mangiato ${s.times} ${s.times === 1 ? 'volta' : 'volte'}` : s.source === 'piano' ? 'dal piano' : s.title}
                  </>
                }
                action={
                  <button type="button" onClick={() => again(m.key, s.key)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-violet-400">
                    <RefreshCw className="h-3.5 w-3.5" /> Un'altra idea per {m.label.toLowerCase()}
                  </button>
                }
              />
            ) : (
              <p key={m.key} className="text-sm text-fg-3">
                {m.emoji} {m.label}: nessuna idea {exclude[m.key]?.length ? 'nuova' : ''}.{' '}
                {exclude[m.key]?.length ? (
                  <button type="button" className="font-semibold text-violet-400" onClick={() => setExclude((x) => ({ ...x, [m.key]: [] }))}>
                    Ricomincia
                  </button>
                ) : null}
              </p>
            ),
          )}
          {picks.some((p) => p.s) && (
            <Button fullWidth onClick={addAll}>
              {picks.filter((p) => p.s).length > 1 ? 'Aggiungi tutto al diario' : 'Aggiungi al diario'}
            </Button>
          )}
          <p className="text-xs text-fg-3">
            Dove le calorie sono tante per un solo pasto le porzioni restano ragionevoli: in quel caso aggiungi un altro pasto.
          </p>
        </div>
      )}
    </Card>
  );
}
