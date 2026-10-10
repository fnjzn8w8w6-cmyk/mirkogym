import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { BookOpen, CalendarDays, Camera, Shuffle, Undo2, ChevronLeft, ChevronRight, ClipboardCopy, Dumbbell, Moon, Plus, Trash2 } from 'lucide-react';
import { MealPhotoModal } from '@/components/imports/ImportModals';
import { useSettings } from '@/hooks/use-settings';
import { useFoodLog } from '@/hooks/use-food';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatLongDate, fromISODate, toISODate, todayISO } from '@/lib/date-utils';
import { macrosFor, round1, sumMacros, type Macros } from '@/lib/foods';
import type { UserProfile } from '@/lib/metabolism';
import { userNutrition } from '@/lib/coach';
import { alternativeMeal, mealInfo, type PlannedMeal, type Recipe } from '@/lib/recipes';
import { DEFAULT_NUTRITION } from '@/lib/coach';
import { useLearnedFavorites } from '@/hooks/use-habits';
import { planMealEntries, planMealsFor } from '@/lib/diary-plan';
import { RecipeLibrary } from './RecipeLibrary';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { FoodPicker } from './FoodPicker';
import { DayRecapForm } from '@/components/coach/Recaps';
import { useDayTarget } from '@/hooks/use-habits';
import { WhyKcal, planPrefs } from './NutritionPlanner';
import { HelpTip, NewBadge, SectionTitle } from '@/components/ui/Help';
import { WD_SHORT } from '@/lib/habits';
import { fmtPieces, pieceGrams } from '@/lib/food-units';
import { Segmented } from '@/components/ui/Input';
import { FillGap, NowSuggest } from './MealSuggest';
import { MacroBar, fmtNum, useRecipes } from './shared';

const MEALS: { key: DiaryMeal; label: string; emoji: string }[] = [
  { key: 'colazione', label: 'Colazione', emoji: '☕' },
  { key: 'pranzo', label: 'Pranzo', emoji: '🍝' },
  { key: 'cena', label: 'Cena', emoji: '🍽️' },
  { key: 'spuntini', label: 'Spuntini', emoji: '🍎' },
];

export const entryMacros = (e: DiaryEntry): Macros =>
  e.unit === 'g'
    ? macrosFor(e.per, e.qty)
    : { kcal: Math.round(e.per.kcal * e.qty), protein: round1(e.per.protein * e.qty), carbs: round1(e.per.carbs * e.qty), fat: round1(e.per.fat * e.qty) };

/** Calorie giorno per giorno della settimana: più alte nei giorni di allenamento. */
function WeekCalories({ week, cycling, date }: { week: { target: number }[]; cycling: number[]; date: string }) {
  const wd = (fromISODate(date).getDay() + 6) % 7;
  const min = Math.min(...week.map((d) => d.target));
  const max = Math.max(...week.map((d) => d.target));
  return (
    <Card className="p-4">
      <div className="section-title !mb-0 flex items-center">
        <SectionTitle help="diet-cycling" isNew>
          Calorie della settimana
        </SectionTitle>
      </div>
      <div className="mt-4 flex h-28 items-end gap-1.5">
        {week.map((d, i) => {
          const train = cycling.includes(i);
          const h = max > min ? 28 + ((d.target - min) / (max - min)) * 44 : 50;
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <span className={cn('mb-1 text-[10px] font-semibold', train ? 'text-accent-400' : 'text-fg-3')}>{d.target}</span>
              <span
                className={cn('w-full rounded-md', train ? 'bg-accent-500' : 'bg-surface-3', i === wd && 'outline outline-2 outline-offset-2 outline-fg')}
                style={{ height: `${h}px` }}
              />
              <span className={cn('mt-1.5 text-xs font-bold', i === wd ? 'text-fg' : 'text-fg-3')}>{WD_SHORT[i]}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-500" aria-hidden /> allenamento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" aria-hidden /> riposo
        </span>
      </div>
      <p className="mt-1.5 text-xs text-fg-3">Se ti alleni in un giorno diverso, le calorie si spostano da sole su quel giorno.</p>
    </Card>
  );
}

/** Macro del pasto: grammi di proteine, carboidrati e grassi e quanto pesano sulle calorie del pasto. */
function MealMacros({ m }: { m: Macros }) {
  const parts = [
    { k: 'P', label: 'proteine', short: 'Proteine', g: m.protein, kcal: m.protein * 4, color: '#3DDC84' },
    { k: 'C', label: 'carboidrati', short: 'Carbo', g: m.carbs, kcal: m.carbs * 4, color: '#A7B0AB' },
    { k: 'G', label: 'grassi', short: 'Grassi', g: m.fat, kcal: m.fat * 9, color: '#EAB308' },
  ];
  const tot = parts.reduce((a, p) => a + p.kcal, 0) || 1;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {parts.map((p) => (
          <span key={p.k} style={{ width: `${(p.kcal / tot) * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 text-sm">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5 whitespace-nowrap" aria-label={`${p.label}: ${Math.round(p.g)} grammi`}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            <span className="text-fg-3">{p.short}</span>
            <span className="font-semibold text-fg">{Math.round(p.g)} g</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const qtyText = (e: DiaryEntry) =>
  e.unit === 'g'
    ? e.pieces
      ? `${fmtPieces(e.pieces)} ${e.pieces === 1 ? 'pz' : 'pz'} (${fmtNum(e.qty)} g)`
      : `${fmtNum(e.qty)} g`
    : `${fmtNum(e.qty)} ${e.qty === 1 ? 'porzione' : 'porzioni'}`;

function dayLabel(date: string): string {
  const today = todayISO();
  if (date === today) return 'Oggi';
  if (date === toISODate(addDays(new Date(), -1))) return 'Ieri';
  if (date === toISODate(addDays(new Date(), 1))) return 'Domani';
  return formatLongDate(fromISODate(date));
}

export function FoodDiary({ profile }: { profile: UserProfile }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const { entries, loading, add, update, remove, recap, saveRecap } = useFoodLog(date);
  const { data } = useRecipes();
  const [adding, setAdding] = useState<DiaryMeal | null>(null);
  const [photoFor, setPhotoFor] = useState<DiaryMeal | null>(null);
  const [library, setLibrary] = useState<DiaryMeal | null>(null);
  // piatto alternativo al suggerimento del piano (stesse calorie), per pasto; si azzera cambiando giorno
  const [alt, setAlt] = useState<{ date: string; meals: Partial<Record<DiaryMeal, { meal: PlannedMeal; seen: string[] }>> }>({ date: '', meals: {} });
  const learned = useLearnedFavorites();
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editMode, setEditMode] = useState<'pz' | 'g'>('g');
  const [editPieces, setEditPieces] = useState(1);
  const dayT = useDayTarget(profile, date);
  const target = useMemo(() => dayT?.day ?? userNutrition(profile, settings), [dayT, profile, settings]);
  const totals = useMemo(() => sumMacros(entries.map(entryMacros)), [entries]);
  const left = target.target - totals.kcal;
  const remaining = useMemo(
    () => ({ kcal: target.target - totals.kcal, protein: target.protein - totals.protein, carbs: target.carbs - totals.carbs, fat: target.fat - totals.fat }),
    [target, totals],
  );

  const plan = settings.weekPlan;
  const weekday = (fromISODate(date).getDay() + 6) % 7;
  const planDay = plan?.days[weekday]?.meals ?? [];

  const byId = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);
  const copyFromPlan = () => {
    if (!data || !planDay.length) return;
    void add(planDay.flatMap((m) => planMealEntries(m, byId)));
    toast.success('Pasti del piano aggiunti al diario');
  };
  const altFor = (meal: DiaryMeal) => (alt.date === date ? alt.meals[meal] : undefined);
  /** Un altro piatto a caso al posto di quello del piano, con le stesse calorie. */
  const shuffle = (meal: DiaryMeal) => {
    const ms = planMealsFor(planDay, meal);
    if (!data || !ms.length) return;
    const cur = altFor(meal);
    const seen = [...(cur?.seen ?? ms.map((m) => m.refId))];
    const kcal = ms.reduce((a, m) => a + m.macros.kcal, 0);
    const pp = planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, [...(settings.favoriteRecipes ?? []), ...learned.map((l) => l.id)]);
    let next = alternativeMeal(data, pp, ms[0].slot, kcal, seen);
    // finite le idee si ricomincia (tranne il piatto attuale)
    if (!next) next = alternativeMeal(data, pp, ms[0].slot, kcal, [cur?.meal.refId ?? ms[0].refId]);
    if (!next) return;
    setAlt((a) => ({ date, meals: { ...(a.date === date ? a.meals : {}), [meal]: { meal: next, seen: [...seen, next.refId] } } }));
  };
  const resetAlt = (meal: DiaryMeal) => setAlt((a) => ({ date, meals: { ...(a.date === date ? a.meals : {}), [meal]: undefined } }));
  /** Un solo pasto dal piano (il piano è un suggerimento: lo prendi solo se ti va). */
  const addFromPlan = (meal: DiaryMeal) => {
    const a = altFor(meal);
    if (a && data) {
      void add(planMealEntries(a.meal, byId, meal));
      toast.success(`Aggiunto: ${mealInfo(a.meal, byId).name}`);
      resetAlt(meal);
      return;
    }
    const ms = planMealsFor(planDay, meal);
    if (!data || !ms.length) return;
    void add(ms.flatMap((m) => planMealEntries(m, byId, meal)));
    toast.success(`Dal piano: ${ms.map((m) => mealInfo(m, byId).name).join(' + ')}`);
  };

  const pickRecipe = (r: Recipe, servings: number) => {
    const meal = adding ?? library;
    if (!meal || !r.k) return;
    void add([{ id: uid(), meal, name: r.t, unit: 'porzione', qty: servings, per: { kcal: r.k[0], protein: r.k[1], carbs: r.k[2], fat: r.k[3] }, recipeId: r.id, createdAt: Date.now() }]);
    setAdding(null);
    setLibrary(null);
    toast.success(`${r.t} aggiunta`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <IconButton label="Giorno precedente" onClick={() => setDate(toISODate(addDays(fromISODate(date), -1)))}>
          <ChevronLeft className="h-6 w-6" />
        </IconButton>
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setDate(todayISO())} className="text-lg font-semibold text-fg">
            {dayLabel(date)}
          </button>
          <HelpTip id="diet-diary" />
        </span>
        <IconButton label="Giorno successivo" onClick={() => setDate(toISODate(addDays(fromISODate(date), 1)))}>
          <ChevronRight className="h-6 w-6" />
        </IconButton>
      </div>

      <Card variant="elevated" className="space-y-3 p-4">
        {dayT && dayT.day.delta !== 0 && (
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
                dayT.day.training ? 'border-accent-500/40 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
              )}
            >
              {dayT.day.training ? <Dumbbell className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
              {dayT.day.training ? 'Giorno di allenamento' : 'Giorno di riposo'}
            </span>
            <span className="flex items-center">
              <NewBadge />
              <HelpTip id="diet-cycling" className="ml-1" />
            </span>
          </div>
        )}
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="font-display text-2xl font-extrabold text-fg">{target.target}</div>
            <div className="text-xs uppercase text-fg-3">Obiettivo</div>
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold text-fg">{totals.kcal}</div>
            <div className="text-xs uppercase text-fg-3">Mangiate</div>
          </div>
          <div>
            <div className={cn('font-display text-2xl font-extrabold', left < 0 ? 'text-warning' : 'text-accent-500')}>{left}</div>
            <div className="text-xs uppercase text-fg-3">{left < 0 ? 'Oltre' : 'Restano'}</div>
          </div>
        </div>
        <MacroBar label="Proteine" value={totals.protein} target={target.protein} unit="g" color="#3DDC84" />
        <MacroBar label="Carboidrati" value={totals.carbs} target={target.carbs} unit="g" color="#A7B0AB" />
        <MacroBar label="Grassi" value={totals.fat} target={target.fat} unit="g" color="#EAB308" />
        {dayT && dayT.day.delta !== 0 && (
          <p className="text-sm text-fg-2">
            {dayT.day.training ? (
              <>
                Giorno di allenamento: <strong className="text-fg">+{dayT.day.delta} kcal</strong> sulla media, quasi tutte carboidrati attorno all'allenamento.
              </>
            ) : (
              <>
                Giorno di riposo: <strong className="text-fg">{dayT.day.delta} kcal</strong> sulla media.
              </>
            )}{' '}
            La media della settimana resta <strong className="text-fg">{dayT.base.target.toLocaleString('it-IT')} kcal</strong>.
          </p>
        )}
        <WhyKcal base={dayT?.base ?? target} day={dayT?.day} />
      </Card>

      {dayT?.cycling && <WeekCalories week={dayT.week} cycling={dayT.cycling} date={date} />}

      {date === todayISO() && !loading && (
        <>
          <NowSuggest
            remaining={remaining}
            dayTarget={target.target}
            entries={entries}
            date={date}
            data={data ?? null}
            onAdd={(items, label) => {
              void add(items);
              toast.success(`Aggiunto a ${label}`);
            }}
          />
          <FillGap
            remaining={remaining}
            entries={entries}
            date={date}
            data={data ?? null}
            onAdd={(items, label) => {
              void add(items);
              toast.success(`Aggiunto a ${label}`);
            }}
          />
        </>
      )}

      {planDay.length > 0 && !loading && entries.length === 0 && (
        <Button variant="secondary" fullWidth icon={<ClipboardCopy className="h-5 w-5" />} disabled={!data} onClick={copyFromPlan}>
          Copia i pasti del piano di {dayLabel(date).toLowerCase() === 'oggi' ? 'oggi' : 'questo giorno'}
        </Button>
      )}

      {MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal.key);
        const mt = sumMacros(list.map(entryMacros));
        const kcal = mt.kcal;
        const planned = planMealsFor(planDay, meal.key);
        return (
          <Card key={meal.key} className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-fg">
                {meal.emoji} {meal.label}
              </div>
              <span className="text-sm text-fg-3">{kcal} kcal</span>
            </div>
            {list.length > 0 && <MealMacros m={mt} />}
            {list.length > 0 && (
              <ul className="mt-1 divide-y divide-line-subtle">
                {list.map((e) => {
                  const m = entryMacros(e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(e);
                          setEditQty(String(e.qty));
                          setEditMode(e.pieces ? 'pz' : 'g');
                          setEditPieces(e.pieces ?? 1);
                        }}
                        className="flex w-full items-center gap-2 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-fg">{e.name}</span>
                          <span className="block text-xs text-fg-3">
                            {e.brand ? `${e.brand} · ` : ''}
                            {qtyText(e)} · P {fmtNum(m.protein)} · C {fmtNum(m.carbs)} · G {fmtNum(m.fat)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-fg-2">{m.kcal}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.length === 0 && planned.length > 0 && data && (() => {
              const a = altFor(meal.key);
              const shown = a ? [a.meal] : planned;
              return (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-dashed border-violet-400/50 p-2.5 text-sm text-fg-2">
                  <div className="min-w-0 flex-1">
                    {a ? '🔀 In alternativa' : '📅 Il piano suggerisce'}: <strong className="text-fg">{shown.map((m) => mealInfo(m, byId).name).join(' + ')}</strong> ·{' '}
                    {shown.reduce((x, m) => x + m.macros.kcal, 0)} kcal
                    {a && a.meal.kind === 'recipe' ? ` · ${fmtNum(a.meal.servings)} ${a.meal.servings === 1 ? 'porzione' : 'porzioni'}` : ''}
                    <div className="mt-1.5 flex items-center gap-4">
                      <button type="button" onClick={() => addFromPlan(meal.key)} className="whitespace-nowrap font-semibold text-violet-400">
                        Aggiungi al diario ✓
                      </button>
                      {a && (
                        <button type="button" onClick={() => resetAlt(meal.key)} className="flex items-center gap-1 text-fg-3">
                          <Undo2 className="h-3.5 w-3.5" /> Piano
                        </button>
                      )}
                      {!a && (
                        <span className="whitespace-nowrap text-xs text-fg-3">
                          🔀 cambia
                          <NewBadge />
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => shuffle(meal.key)}
                    aria-label="Cambia piatto (stesse calorie)"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-2"
                  >
                    <Shuffle className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" onClick={() => setAdding(meal.key)} className="flex h-9 items-center gap-1 rounded-md bg-accent-500 px-2.5 text-sm font-semibold text-onaccent">
                <Plus className="h-4 w-4" /> Alimento
              </button>
              <button type="button" onClick={() => setLibrary(meal.key)} className="flex h-9 items-center gap-1 rounded-md border border-line bg-surface-2 px-2.5 text-sm font-semibold text-fg">
                <BookOpen className="h-4 w-4" /> Ricetta
              </button>
              {planned.length > 0 && list.length > 0 && (
                <button type="button" disabled={!data} onClick={() => addFromPlan(meal.key)} className="flex h-9 items-center gap-1 rounded-md border border-violet-400/60 px-2.5 text-sm font-semibold text-violet-400">
                  <CalendarDays className="h-4 w-4" /> Piano
                </button>
              )}
              <button type="button" onClick={() => setPhotoFor(meal.key)} aria-label={`Foto del piatto: ${meal.label}`} className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-violet-400">
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </Card>
        );
      })}

      <Card className="p-4">
        <div className="mb-3 text-base font-semibold text-fg">📝 Com'è andata {dayLabel(date).toLowerCase() === 'oggi' ? 'oggi' : 'questa giornata'}?</div>
        <DayRecapForm key={date} initial={recap} onSend={(r) => saveRecap(r)} score={{ kcal: totals.kcal, target: target.target, protein: totals.protein, proteinTarget: target.protein }} />
      </Card>

      <RecipeLibrary
        open={library != null}
        onClose={() => setLibrary(null)}
        title={`Ricetta per ${MEALS.find((m) => m.key === library)?.label.toLowerCase() ?? ''}`}
        meal={library ?? 'pranzo'}
        recipes={data?.recipes ?? []}
        dayTarget={target.target}
        remaining={{ kcal: target.target - totals.kcal, protein: target.protein - totals.protein, carbs: target.carbs - totals.carbs, fat: target.fat - totals.fat }}
        onPick={pickRecipe}
      />

      <MealPhotoModal
        open={photoFor != null}
        onClose={() => setPhotoFor(null)}
        mealLabel={MEALS.find((m) => m.key === photoFor)?.label ?? ''}
        onAdd={(items) => {
          if (!photoFor) return;
          const now = Date.now();
          void add(items.map((i) => ({ id: uid(), meal: photoFor, name: i.name, unit: 'g' as const, qty: i.grams, per: i.per100, ...(i.foodId ? { foodId: i.foodId } : {}), createdAt: now })));
          toast.success('Piatto aggiunto al diario');
        }}
      />

      <FoodPicker
        open={adding != null}
        onClose={() => setAdding(null)}
        title={`Aggiungi a ${MEALS.find((m) => m.key === adding)?.label.toLowerCase() ?? ''}`}
        recipes={data?.recipes}
        onPickFood={(food, grams, pieces) => {
          if (!adding) return;
          void add([
            {
              id: uid(),
              meal: adding,
              name: food.name,
              brand: food.brand,
              unit: 'g',
              qty: grams,
              per: food.per100,
              foodId: food.id,
              ...(pieces ? { pieces: pieces.n, pieceGrams: pieces.grams } : {}),
              createdAt: Date.now(),
            },
          ]);
          setAdding(null);
          toast.success(`${food.name} aggiunto`);
        }}
        onPickRecipe={pickRecipe}
      />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.name}>
        {editing && (
          <div className="space-y-3">
            {(() => {
              const pg = editing.unit === 'g' ? (editing.pieceGrams ?? pieceGrams(editing.name)) : undefined;
              const pzMode = Boolean(pg) && editMode === 'pz';
              const q = pzMode ? editPieces * pg! : Number(editQty.replace(',', '.'));
              const m = entryMacros({ ...editing, qty: Number.isFinite(q) ? q : 0 });
              return (
                <>
                  {pg && (
                    <Segmented<'pz' | 'g'>
                      label="Unità"
                      value={editMode}
                      onChange={setEditMode}
                      options={[
                        { value: 'pz', label: `Pezzi (1 = ${fmtNum(pg)} g)` },
                        { value: 'g', label: 'Grammi' },
                      ]}
                    />
                  )}
                  {pzMode ? (
                    <div className="flex items-center justify-center gap-4">
                      <button type="button" aria-label="Un pezzo in meno" disabled={editPieces <= 0.5} onClick={() => setEditPieces((n) => Math.max(0.5, n - (n > 1 ? 1 : 0.5)))} className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-2xl font-bold text-fg disabled:opacity-40">
                        −
                      </button>
                      <div className="min-w-[80px] text-center">
                        <div className="font-display text-3xl font-extrabold text-fg">{fmtPieces(editPieces)}</div>
                        <div className="text-xs text-fg-3">{fmtNum(q)} g</div>
                      </div>
                      <button type="button" aria-label="Un pezzo in più" onClick={() => setEditPieces((n) => (n < 1 ? 1 : n + 1))} className="flex h-12 w-12 items-center justify-center rounded-full border border-accent-500 bg-accent-glow text-2xl font-bold text-accent-400">
                        +
                      </button>
                    </div>
                  ) : (
                    <Input label={editing.unit === 'g' ? 'Quantità (grammi)' : 'Porzioni'} inputMode="decimal" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                  )}
                  <p className="text-sm text-fg-2">
                    {m.kcal} kcal · P {fmtNum(m.protein)} · C {fmtNum(m.carbs)} · G {fmtNum(m.fat)}
                  </p>
                </>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="danger"
                icon={<Trash2 className="h-5 w-5" />}
                onClick={() => {
                  void remove(editing.id);
                  setEditing(null);
                }}
              >
                Elimina
              </Button>
              <Button
                disabled={editMode === 'g' && !(Number(editQty.replace(',', '.')) > 0)}
                onClick={() => {
                  const pg = editing.unit === 'g' ? (editing.pieceGrams ?? pieceGrams(editing.name)) : undefined;
                  if (pg && editMode === 'pz') void update({ ...editing, qty: Math.round(editPieces * pg * 10) / 10, pieces: editPieces, pieceGrams: pg });
                  else void update({ ...editing, qty: Number(editQty.replace(',', '.')), pieces: undefined });
                  setEditing(null);
                }}
              >
                Salva
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
