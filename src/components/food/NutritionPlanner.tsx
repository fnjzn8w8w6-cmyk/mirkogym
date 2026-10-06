import { useMemo, useState } from 'react';
import { Apple, ChevronRight, FileUp, Plus, RefreshCw, Settings2, ShoppingCart, Shuffle } from 'lucide-react';
import { DietImportModal } from '@/components/imports/ImportModals';
import { useSettings } from '@/hooks/use-settings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Segmented } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { MACRO_STYLE_LABEL, type MacroStyle, type Nutrition, type UserProfile } from '@/lib/metabolism';
import { DEFAULT_NUTRITION, DIETS, userNutrition, type NutritionPrefs } from '@/lib/coach';
import {
  SLOT_LABEL,
  dayTotals,
  formatQty,
  mealCandidates,
  mealInfo,
  planWeek,
  replaceMeal,
  rescalePlan,
  weeklyShopping,
  type PlanPrefs,
  type PlannedMeal,
  type Recipe,
  type RecipeData,
  type SimpleMeal,
  type WeekPlan,
} from '@/lib/recipes';
import { MacroBar, MacroLine, RecipeImage, fmtNum, useRecipes } from './shared';
import { RecipeEditor } from './RecipeEditor';
import { useFoodLog, useMyRecipes } from '@/hooks/use-food';
import { todayISO } from '@/lib/date-utils';
import type { DiaryMeal, UserRecipe } from '@/types';
import { RecipeDetail } from './RecipeDetail';
import { useLearnedFavorites } from '@/hooks/use-habits';
import { weekTargets } from '@/lib/habits';
import { HelpTip, NewBadge, SectionTitle } from '@/components/ui/Help';
import { RecipeGallery } from './RecipeGallery';

export { DEFAULT_NUTRITION };
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const DAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const todayIdx = () => (new Date().getDay() + 6) % 7;

export function planPrefs(p: NutritionPrefs, favorites: string[]): PlanPrefs {
  return { diet: p.diet, meals: p.meals, allergies: p.allergies, dislikes: p.dislikes, cooking: p.cooking, favorites, likes: p.likes };
}

/* ---------- Scheda di un pasto ---------- */

function MealCard({ meal, byId, onOpen, onSwap }: { meal: PlannedMeal; byId: Map<string, Recipe>; onOpen: () => void; onSwap: () => void }) {
  const info = mealInfo(meal, byId);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onOpen} className="flex w-full gap-3 p-3 text-left" aria-label={`${SLOT_LABEL[meal.slot]}: ${info.name}`}>
        <RecipeImage recipe={info.recipe} emoji={meal.kind === 'custom' ? '🍕' : info.simple?.emoji} className="h-20 w-20 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-accent-400">{SLOT_LABEL[meal.slot]}</span>
          <span className="line-clamp-2 block text-base font-semibold leading-snug text-fg">{info.name}</span>
          {meal.kind === 'custom' && <span className="block text-xs text-fg-3">Pasto libero · valori stimati</span>}
          {meal.kind === 'recipe' && (
            <span className="block text-xs text-fg-3">
              {String(meal.servings).replace('.', ',')} {meal.servings === 1 ? 'porzione' : 'porzioni'}
              {info.recipe?.min ? ` · ${info.recipe.min} min` : ''}
            </span>
          )}
          <MacroLine {...meal.macros} className="block text-xs" />
        </span>
        <ChevronRight className="mt-6 h-5 w-5 shrink-0 text-fg-3" aria-hidden />
      </button>
      {(meal.kind === 'simple' || meal.extras.length > 0) && (
        <ul className="border-t border-line-subtle px-3 py-2 text-sm">
          {meal.kind === 'simple' &&
            meal.items.map((it) => (
              <li key={it.food} className="flex justify-between py-0.5">
                <span className="text-fg-2">{it.food}</span>
                <span className="text-fg-3">{it.grams} g</span>
              </li>
            ))}
          {meal.extras.map((it) => (
            <li key={`x-${it.food}`} className="flex justify-between py-0.5">
              <span className="text-fg-2">+ {it.food}</span>
              <span className="text-fg-3">{it.grams} g · per i macro</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex border-t border-line-subtle">
        <button type="button" onClick={onSwap} className="flex h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold text-fg-2">
          <Shuffle className="h-4 w-4" aria-hidden /> Cambia
        </button>
      </div>
    </Card>
  );
}

/* ---------- Scelta di un pasto alternativo ---------- */

function SimpleMealDetail({ meal, onClose }: { meal: SimpleMeal | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(meal)} onClose={onClose} title={meal?.name}>
      {meal && (
        <div className="space-y-3">
          <div className="flex h-32 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500/25 to-violet-500/25 text-6xl">{meal.emoji}</div>
          <ul className="divide-y divide-line-subtle">
            {meal.items.map(([f, g]) => (
              <li key={f} className="flex justify-between py-1.5 text-base">
                <span className="text-fg">{f}</span>
                <span className="text-fg-3">{g} g</span>
              </li>
            ))}
          </ul>
          {meal.prep && <p className="text-base text-fg-2">👩‍🍳 {meal.prep}</p>}
          <p className="text-xs text-fg-3">Le grammature nel piano sono ricalcolate sulle tue calorie.</p>
        </div>
      )}
    </Modal>
  );
}

function SwapModal({
  open,
  slot,
  currentId,
  data,
  prefs,
  onClose,
  onPick,
}: {
  open: boolean;
  slot: PlannedMeal['slot'] | null;
  /** pasto attuale (escluso da "Sorprendimi") */
  currentId?: string;
  data: RecipeData;
  prefs: PlanPrefs;
  onClose: () => void;
  onPick: (choice: { kind: 'recipe' | 'simple'; id: string }) => void;
}) {
  const [preview, setPreview] = useState<Recipe | null>(null);
  const cands = useMemo(() => (slot ? mealCandidates(data, prefs, slot) : { recipes: [], simple: [] }), [slot, data, prefs]);
  const random = () => {
    const all = [...cands.recipes.map((r) => ({ kind: 'recipe' as const, id: r.id })), ...cands.simple.map((m) => ({ kind: 'simple' as const, id: m.id }))].filter(
      (c) => c.id !== currentId,
    );
    if (all.length) onPick(all[Math.floor(Math.random() * all.length)]);
  };
  return (
    <Modal open={open} onClose={onClose} title={slot ? `Cambia ${SLOT_LABEL[slot].toLowerCase()}` : ''}>
      <div className="space-y-4">
        <Button variant="secondary" fullWidth icon={<Shuffle className="h-5 w-5" />} onClick={random}>
          Sorprendimi
        </Button>
        {cands.simple.length > 0 && (
          <section>
            <div className="section-title">Veloci all'italiana</div>
            <div className="grid grid-cols-2 gap-2">
              {cands.simple.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick({ kind: 'simple', id: m.id })}
                  className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2 text-left text-sm text-fg"
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="line-clamp-2">{m.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {cands.recipes.length > 0 && (
          <section>
            <div className="section-title">Ricette ({cands.recipes.length}) · tocca per vederla</div>
            <RecipeGallery recipes={cands.recipes} onOpen={setPreview} categories={false} />
          </section>
        )}
      </div>
      <RecipeDetail
        recipe={preview}
        onClose={() => setPreview(null)}
        onAddToPlan={(r) => {
          setPreview(null);
          onPick({ kind: 'recipe', id: r.id });
        }}
      />
    </Modal>
  );
}

/* ---------- Aggiunta di una ricetta al piano (dalla galleria) ---------- */

export function AddToPlanModal({ recipe, plan, data, onClose, onPlace }: {
  recipe: Recipe | null;
  plan: WeekPlan | undefined;
  data: RecipeData;
  onClose: () => void;
  onPlace: (day: number, meal: number) => void;
}) {
  const [day, setDay] = useState(todayIdx());
  const byId = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data]);
  return (
    <Modal open={Boolean(recipe)} onClose={onClose} title="Aggiungi al piano">
      {recipe && plan && (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">Scegli il giorno e il pasto da sostituire: le porzioni vengono ricalcolate sulle calorie di quel pasto.</p>
          <DayPills value={day} onChange={setDay} />
          <div className="space-y-2">
            {plan.days[day].meals.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPlace(day, i)}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-surface-2 p-2 text-left"
              >
                <RecipeImage recipe={mealInfo(m, byId).recipe} emoji={mealInfo(m, byId).simple?.emoji} className="h-12 w-12 shrink-0 rounded-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase text-accent-400">{SLOT_LABEL[m.slot]}</span>
                  <span className="block truncate text-sm text-fg">{mealInfo(m, byId).name}</span>
                </span>
                <span className="text-sm font-semibold text-accent-400">Sostituisci</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function DayPills({ value, onChange, plan, target, cycling }: { value: number; onChange: (d: number) => void; plan?: WeekPlan; target?: Nutrition; cycling?: number[] | null }) {
  const today = todayIdx();
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Giorno della settimana">
      {DAY_SHORT.map((d, i) => {
        const kcal = plan && target ? dayTotals(plan.days[i].meals).kcal : null;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={value === i}
            onClick={() => onChange(i)}
            className={cn(
              'flex h-14 flex-col items-center justify-center rounded-md border text-sm',
              value === i ? 'border-accent-500 bg-accent-glow font-bold text-accent-400' : 'border-line bg-surface-2 text-fg-2',
            )}
          >
            <span>
              {d}
              {cycling?.includes(i) ? '🏋️' : ''}
            </span>
            {i === today && <span className="text-[10px] font-semibold uppercase">oggi</span>}
            {i !== today && kcal != null && <span className="text-[10px] text-fg-3">{Math.round(kcal / 10) * 10}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "Perché queste calorie?": scomposizione dell'obiettivo del giorno. */
export function WhyKcal({ base, day }: { base: Nutrition; day?: Nutrition & { delta?: number } }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const real = settings.metabolism;
  const adj = real ? 0 : (settings.kcalAdjust ?? 0);
  const total = day?.target ?? base.target;
  const delta = day?.delta ?? 0;
  const ritmo = base.target - base.tdee - adj;
  const phase = settings.goalPlan?.phases[settings.goalPlan.current];
  const rows: [string, number, boolean?][] = [
    [real ? `Il tuo metabolismo (dal diario, ${real.days} giornate)` : 'Fabbisogno stimato (formula)', base.tdee],
    [phase ? `Ritmo per l'obiettivo "${phase.label}"` : 'Obiettivo (surplus/deficit)', ritmo, true],
    ...(adj ? ([['Correzione dei check-in', adj, true]] as [string, number, boolean][]) : []),
    ...(delta ? ([[delta > 0 ? 'Giorno di allenamento (+ carboidrati)' : 'Giorno di riposo (riequilibrio)', delta, true]] as [string, number, boolean][]) : []),
  ];
  return (
    <div className="pt-1">
      <button type="button" className="flex items-center gap-1 text-sm font-semibold text-violet-400" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Perché {total.toLocaleString('it-IT')} kcal? <NewBadge />
      </button>
      {open && (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {rows.map(([l, v, signed]) => (
              <tr key={l} className="border-t border-line-subtle">
                <td className="py-1.5 text-fg-2">{l}</td>
                <td className={cn('py-1.5 text-right font-semibold', signed && v > 0 ? 'text-accent-400' : signed && v < 0 ? 'text-warning' : 'text-fg')}>
                  {signed && v > 0 ? '+' : ''}
                  {Math.round(v).toLocaleString('it-IT')}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-1.5 font-bold text-fg">Totale</td>
              <td className="py-1.5 text-right font-bold text-fg">{total.toLocaleString('it-IT')}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- Dietologo: piano settimanale ---------- */

export function NutritionPlanner({ profile, header }: { profile: UserProfile; header?: React.ReactNode }) {
  const [importOpen, setImportOpen] = useState(false);
  const importCard = (
    <>
      <Card interactive className="flex items-center gap-3 p-4" onClick={() => setImportOpen(true)} role="button" aria-label="Importa la dieta del nutrizionista">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-glow text-accent-500">
          <FileUp className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-fg">Hai già un nutrizionista?</span>
          <span className="block text-sm text-fg-2">Carica foto o PDF della tua dieta</span>
        </span>
      </Card>
      <DietImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
  const { settings, update } = useSettings();
  const toast = useToast();
  const { data, error, retry } = useRecipes();
  const [prefs, setPrefs] = useState<NutritionPrefs>(settings.nutritionPrefs ?? DEFAULT_NUTRITION);
  const [editPrefs, setEditPrefs] = useState(false);
  const [day, setDay] = useState(todayIdx());
  const [shopOpen, setShopOpen] = useState(false);
  const [swap, setSwap] = useState<number | null>(null);
  const [openRecipe, setOpenRecipe] = useState<{ recipe: Recipe; servings: number } | null>(null);
  const [openSimple, setOpenSimple] = useState<SimpleMeal | null>(null);
  const adjust = settings.kcalAdjust ?? 0;
  const target = useMemo(() => userNutrition(profile, settings), [profile, settings]);
  const learned = useLearnedFavorites();
  // preferiti + ricette che mangi davvero (imparate dal diario)
  const favorites = useMemo(() => [...(settings.favoriteRecipes ?? []), ...learned.map((l) => l.id)], [settings.favoriteRecipes, learned]);
  const pp = useMemo(() => planPrefs(settings.nutritionPrefs ?? prefs, favorites), [settings.nutritionPrefs, prefs, favorites]);
  // calorie che seguono la scheda: un obiettivo per ogni giorno (se attivo)
  const cycling = settings.carbCycling?.length ? settings.carbCycling : null;
  const week = useMemo(() => (cycling ? weekTargets(target, cycling) : undefined), [target, cycling]);
  const plan = settings.weekPlan;
  const byId = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);

  const save = (p: WeekPlan, extra: Partial<typeof settings> = {}) => settle(update({ weekPlan: p, ...extra }));

  const create = async () => {
    if (!data) return;
    // obiettivi ricalcolati con lo stile dei macro appena scelto
    const t = userNutrition(profile, { ...settings, nutritionPrefs: prefs });
    const p = planWeek(data, t, planPrefs(prefs, favorites), Date.now(), cycling ? weekTargets(t, cycling) : undefined);
    await save(p, { nutritionPrefs: prefs });
    setEditPrefs(false);
    toast.success('Piano settimanale pronto: 7 giorni tutti diversi');
  };

  const shopping = useMemo(() => (plan && data && shopOpen ? weeklyShopping(plan, data) : []), [plan, data, shopOpen]);

  if (error)
    return (
      <Card className="p-4 text-center">
        <p className="text-base text-fg-2">{error}</p>
        <Button className="mt-3" onClick={retry}>
          Riprova
        </Button>
      </Card>
    );

  const targets = (
    <Card variant="elevated" className="p-4">
      <div className="flex items-center gap-2 text-lg text-fg">
        <Apple className="h-5 w-5 text-accent-500" aria-hidden /> <SectionTitle help="diet-why-kcal">I tuoi obiettivi giornalieri</SectionTitle>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ['Kcal', target.target, ''],
          ['Proteine', target.protein, 'g'],
          ['Carbo', target.carbs, 'g'],
          ['Grassi', target.fat, 'g'],
        ].map(([l, v, u]) => (
          <div key={String(l)} className="rounded-md bg-surface-2 py-2">
            <div className="text-lg text-fg">
              {v}
              <span className="text-xs text-fg-3">{u}</span>
            </div>
            <div className="text-xs uppercase text-fg-3">{l}</div>
          </div>
        ))}
      </div>
      {adjust !== 0 && (
        <p className="mt-2 text-sm text-fg-3">
          Include la correzione del check-in: {adjust > 0 ? '+' : ''}
          {adjust} kcal.{' '}
          <button type="button" className="font-semibold text-accent-400" onClick={() => void settle(update({ kcalAdjust: 0 }))}>
            Azzera
          </button>
        </p>
      )}
    </Card>
  );

  if (!plan || editPrefs)
    return (
      <div className="space-y-4">
        {targets}
        {header}
        {importCard}
        <Card className="space-y-3 p-4">
          <div className="text-base font-semibold text-fg">
            <SectionTitle help="diet-plan">Il tuo piano settimanale</SectionTitle>
          </div>
          <p className="text-sm text-fg-2">
            7 giorni di pasti diversi scelti tra centinaia di ricette italiane (e le tue), con porzioni calcolate sulle tue calorie e proteine.
          </p>
          <div>
            <div className="section-title">Alimentazione</div>
            <div className="grid grid-cols-2 gap-2">
              {DIETS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={prefs.diet === d.value}
                  onClick={() => setPrefs({ ...prefs, diet: d.value })}
                  className={cn(
                    'h-11 rounded-md border text-sm font-semibold',
                    prefs.diet === d.value ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
                  )}
                >
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title">Pasti al giorno</div>
            <Segmented<number>
              label="Pasti al giorno"
              value={prefs.meals}
              onChange={(v) => setPrefs({ ...prefs, meals: v as 3 | 4 | 5 })}
              options={[3, 4, 5].map((n) => ({ value: n, label: `${n} pasti` }))}
            />
          </div>
          <div>
            <div className="section-title">Tempo per cucinare</div>
            <Segmented<NutritionPrefs['cooking']>
              label="Tempo per cucinare"
              value={prefs.cooking}
              onChange={(v) => setPrefs({ ...prefs, cooking: v })}
              options={[
                { value: 'poco', label: '≤ 30 min' },
                { value: 'medio', label: '≤ 1 ora' },
                { value: 'molto', label: 'Senza limiti' },
              ]}
            />
          </div>
          <div>
            <div className="section-title">Macronutrienti</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MACRO_STYLE_LABEL) as MacroStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={(prefs.style ?? 'standard') === st}
                  onClick={() => setPrefs({ ...prefs, style: st })}
                  className={cn(
                    'h-11 rounded-md border text-sm font-semibold',
                    (prefs.style ?? 'standard') === st ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
                  )}
                >
                  {MACRO_STYLE_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
          <Input label="Allergie / intolleranze" placeholder="es. lattosio, glutine" value={prefs.allergies} onChange={(e) => setPrefs({ ...prefs, allergies: e.target.value })} />
          <Input label="Cibi che non ti piacciono" placeholder="es. funghi, piccante" value={prefs.dislikes} onChange={(e) => setPrefs({ ...prefs, dislikes: e.target.value })} />
          <Input label="Cibi che ami" placeholder="es. pollo, salmone, riso" value={prefs.likes} onChange={(e) => setPrefs({ ...prefs, likes: e.target.value })} />
          {favorites.length > 0 && <p className="text-sm text-fg-3">❤️ Le tue {favorites.length} ricette preferite avranno la precedenza.</p>}
          <Button fullWidth size="lg" loading={!data} disabled={!data} onClick={() => void create()}>
            {plan ? 'Crea un nuovo piano' : 'Crea il mio piano settimanale'}
          </Button>
          {plan && (
            <Button fullWidth variant="ghost" onClick={() => setEditPrefs(false)}>
              Annulla
            </Button>
          )}
        </Card>
      </div>
    );

  const meals = plan.days[day]?.meals ?? [];
  const totals = dayTotals(meals);
  const stale = Math.abs(plan.targetKcal - target.target) >= 50;

  return (
    <div className="space-y-4">
      {targets}
      {header}
      {plan.source === 'nutrizionista' ? (
        <p className="text-sm text-fg-2">🩺 Dieta del tuo nutrizionista (porzioni fisse). <button type="button" className="font-semibold text-accent-400" onClick={() => setImportOpen(true)}>Importane un'altra</button></p>
      ) : (
        importCard
      )}
      {plan.source === 'nutrizionista' && <DietImportModal open={importOpen} onClose={() => setImportOpen(false)} />}
      {stale && data && plan.source !== 'nutrizionista' && (
        <Card className="border-warning/40 p-4">
          <p className="text-sm text-fg-2">
            Il tuo obiettivo è cambiato ({plan.targetKcal} → {target.target} kcal). Ricalcolo le porzioni mantenendo le stesse ricette?
          </p>
          <Button
            className="mt-2"
            size="sm"
            onClick={() => {
              void save(rescalePlan(plan, data, target, pp, week));
              toast.success('Porzioni ricalcolate');
            }}
          >
            Ricalcola porzioni
          </Button>
        </Card>
      )}

      <DayPills value={day} onChange={setDay} plan={plan} target={target} cycling={cycling} />

      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2 text-base font-semibold text-fg">
          <span>{DAY_LONG[day]}</span>
          {cycling && (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', cycling.includes(day) ? 'bg-violet-500/20 text-violet-400' : 'bg-surface-3 text-fg-3')}>
              {cycling.includes(day) ? '🏋️ Allenamento' : '😴 Riposo'} <HelpTip id="diet-cycling" />
            </span>
          )}
        </div>
        <MacroBar label="Calorie" value={totals.kcal} target={(week?.[day] ?? target).target} unit="kcal" color="#3DDC84" />
        <MacroBar label="Proteine" value={totals.protein} target={(week?.[day] ?? target).protein} unit="g" color="#3DDC84" />
        <MacroBar label="Carboidrati" value={totals.carbs} target={(week?.[day] ?? target).carbs} unit="g" color="#A7B0AB" />
        <MacroBar label="Grassi" value={totals.fat} target={(week?.[day] ?? target).fat} unit="g" color="#EAB308" />
        <WhyKcal base={target} day={week?.[day]} />
      </Card>

      {!data ? (
        <p className="text-center text-sm text-fg-3">Carico le ricette…</p>
      ) : (
        meals.map((m, i) => (
          <MealCard
            key={`${day}-${i}-${m.refId}`}
            meal={m}
            byId={byId}
            onOpen={() => {
              const info = mealInfo(m, byId);
              if (info.recipe) setOpenRecipe({ recipe: info.recipe, servings: m.servings });
              else if (info.simple) setOpenSimple(info.simple);
            }}
            onSwap={() => setSwap(i)}
          />
        ))
      )}

      {learned.length > 0 && (
        <Card className="p-4">
          <div className="section-title !mb-1">
            <SectionTitle help="diet-tastes" isNew>
              Il piano impara i tuoi gusti
            </SectionTitle>
          </div>
          <p className="text-sm text-fg-2">
            ✅ Proposte più spesso, perché le mangi davvero: {learned.slice(0, 3).map((l) => `${l.name} (${l.count}×)`).join(', ')}.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<ShoppingCart className="h-5 w-5" />} onClick={() => setShopOpen(true)}>
          Spesa settimana
        </Button>
        <Button
          variant="secondary"
          icon={<RefreshCw className="h-5 w-5" />}
          disabled={!data}
          onClick={() => {
            if (!data) return;
            void save(planWeek(data, target, pp, Date.now(), week));
            toast.success('Nuova settimana generata');
          }}
        >
          Rigenera
        </Button>
      </div>
      <Button variant="ghost" fullWidth icon={<Settings2 className="h-5 w-5" />} onClick={() => (setPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION), setEditPrefs(true))}>
        Preferenze alimentari
      </Button>
      <p className="text-xs text-fg-3">
        Ricette: FrigoDispensa e Wikibooks (CC BY-SA 4.0); valori nutrizionali calcolati con USDA FoodData Central. Indicazioni generali, non sostituiscono un nutrizionista.
      </p>

      {data && (
        <SwapModal
          open={swap != null}
          slot={swap != null ? (meals[swap]?.slot ?? null) : null}
          currentId={swap != null ? meals[swap]?.refId : undefined}
          data={data}
          prefs={pp}
          onClose={() => setSwap(null)}
          onPick={(choice) => {
            if (swap == null) return;
            void save(replaceMeal(plan, day, swap, choice, data, target, pp));
            setSwap(null);
            toast.success('Pasto cambiato');
          }}
        />
      )}
      <RecipeDetail recipe={openRecipe?.recipe ?? null} servings={openRecipe?.servings} onClose={() => setOpenRecipe(null)} />
      <SimpleMealDetail meal={openSimple} onClose={() => setOpenSimple(null)} />

      <Modal open={shopOpen} onClose={() => setShopOpen(false)} title="Lista della spesa · settimana">
        <p className="mb-3 text-sm text-fg-3">Tutti gli ingredienti dei 7 giorni, con le porzioni del tuo piano.</p>
        <ul className="divide-y divide-line-subtle">
          {shopping.map((i) => (
            <li key={i.name} className="flex justify-between gap-3 py-2 text-base">
              <span className="text-fg">{i.name}</span>
              <span className="shrink-0 font-semibold text-fg-2">{formatQty(i)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

/* ---------- Tab Ricette ---------- */

export function RecipesTab({ profile }: { profile: UserProfile }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const { data, mine, error, retry } = useRecipes();
  const { remove } = useMyRecipes();
  const [open, setOpen] = useState<Recipe | null>(null);
  const [placing, setPlacing] = useState<Recipe | null>(null);
  const [editor, setEditor] = useState<{ recipe: UserRecipe | null } | null>(null);
  const [diary, setDiary] = useState<Recipe | null>(null);
  const target = useMemo(() => userNutrition(profile, settings), [profile, settings]);
  const pp = planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, settings.favoriteRecipes ?? []);

  if (error)
    return (
      <Card className="p-4 text-center">
        <p className="text-base text-fg-2">{error}</p>
        <Button className="mt-3" onClick={retry}>
          Riprova
        </Button>
      </Card>
    );
  if (!data) return <p className="py-10 text-center text-sm text-fg-3">Carico le ricette…</p>;

  return (
    <div className="space-y-3">
      <Button fullWidth icon={<Plus className="h-5 w-5" />} onClick={() => setEditor({ recipe: null })}>
        Crea la tua ricetta
      </Button>
      <p className="text-sm text-fg-2">
        {data.recipes.length - mine.length} ricette italiane con calorie e macro calcolati dagli ingredienti. Salva con il ❤️ quelle che ti ispirano: il
        piano le preferirà.
      </p>
      <RecipeGallery recipes={data.recipes} onOpen={setOpen} />
      <RecipeDetail
        recipe={open}
        onClose={() => setOpen(null)}
        onAddToPlan={(r) => {
          if (!settings.weekPlan) {
            toast.error('Prima crea il piano settimanale nella sezione Piano');
            return;
          }
          setOpen(null);
          setPlacing(r);
        }}
        onAddToDiary={(r) => {
          setOpen(null);
          setDiary(r);
        }}
        onEdit={(r) => {
          setOpen(null);
          setEditor({ recipe: mine.find((m) => `u:${m.id}` === r.id) ?? null });
        }}
        onDelete={(r) => {
          setOpen(null);
          void remove(r.id.slice(2));
          toast.success('Ricetta eliminata');
        }}
      />
      <AddToPlanModal
        recipe={placing}
        plan={settings.weekPlan}
        data={data}
        onClose={() => setPlacing(null)}
        onPlace={(day, meal) => {
          if (!placing || !settings.weekPlan) return;
          void settle(update({ weekPlan: replaceMeal(settings.weekPlan, day, meal, { kind: 'recipe', id: placing.id }, data, target, pp) }));
          setPlacing(null);
          toast.success(`Aggiunta a ${DAY_LONG[day]}`);
        }}
      />
      <AddToDiaryModal recipe={diary} onClose={() => setDiary(null)} />
      <RecipeEditor open={editor != null} recipe={editor?.recipe} onClose={() => setEditor(null)} />
    </div>
  );
}

/** Aggiunge una ricetta al diario di oggi (pasto e porzioni a scelta). */
function AddToDiaryModal({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const toast = useToast();
  const { add } = useFoodLog(todayISO());
  const [meal, setMeal] = useState<DiaryMeal>('pranzo');
  const [sv, setSv] = useState(1);
  const k = recipe?.k;
  return (
    <Modal open={Boolean(recipe)} onClose={onClose} title="Aggiungi al diario di oggi">
      {recipe && k && (
        <div className="space-y-4">
          <div className="text-base text-fg">{recipe.t}</div>
          <Segmented<DiaryMeal>
            label="Pasto"
            value={meal}
            onChange={setMeal}
            options={[
              { value: 'colazione', label: 'Colaz.' },
              { value: 'pranzo', label: 'Pranzo' },
              { value: 'cena', label: 'Cena' },
              { value: 'spuntini', label: 'Spunt.' },
            ]}
          />
          <div className="flex items-center justify-between rounded-md bg-surface-2 p-2">
            <Button variant="ghost" onClick={() => setSv(Math.max(0.25, sv - 0.25))} aria-label="Meno">
              −
            </Button>
            <span className="text-lg text-fg">
              {fmtNum(sv)} {sv === 1 ? 'porzione' : 'porzioni'}
            </span>
            <Button variant="ghost" onClick={() => setSv(Math.min(6, sv + 0.25))} aria-label="Più">
              +
            </Button>
          </div>
          <MacroLine kcal={k[0] * sv} protein={k[1] * sv} carbs={k[2] * sv} fat={k[3] * sv} className="block text-center" />
          <Button
            fullWidth
            size="lg"
            onClick={() => {
              void add([
                {
                  id: `${Date.now().toString(36)}r`,
                  meal,
                  name: recipe.t,
                  unit: 'porzione',
                  qty: sv,
                  per: { kcal: k[0], protein: k[1], carbs: k[2], fat: k[3] },
                  recipeId: recipe.id,
                  createdAt: Date.now(),
                },
              ]);
              toast.success('Aggiunta al diario');
              onClose();
            }}
          >
            Aggiungi
          </Button>
        </div>
      )}
    </Modal>
  );
}
