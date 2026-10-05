import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Camera, ChevronLeft, ChevronRight, ClipboardCopy, Plus, Trash2 } from 'lucide-react';
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
import { mealInfo, simpleFoodPer100, type PlannedMeal, type Recipe } from '@/lib/recipes';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { FoodPicker } from './FoodPicker';
import { DayRecapForm } from '@/components/coach/Recaps';
import { useDayTarget } from '@/hooks/use-habits';
import { WhyKcal } from './NutritionPlanner';
import { HelpTip } from '@/components/ui/Help';
import { fmtPieces, pieceGrams } from '@/lib/food-units';
import { Segmented } from '@/components/ui/Input';
import { MealSuggest } from './MealSuggest';
import { MacroBar, fmtNum, useRecipes } from './shared';

const MEALS: { key: DiaryMeal; label: string; emoji: string }[] = [
  { key: 'colazione', label: 'Colazione', emoji: '☕' },
  { key: 'pranzo', label: 'Pranzo', emoji: '🍝' },
  { key: 'cena', label: 'Cena', emoji: '🍽️' },
  { key: 'spuntini', label: 'Spuntini', emoji: '🍎' },
];
const SLOT_TO_MEAL: Record<PlannedMeal['slot'], DiaryMeal> = { colazione: 'colazione', pranzo: 'pranzo', cena: 'cena', spuntino: 'spuntini', merenda: 'spuntini' };

export const entryMacros = (e: DiaryEntry): Macros =>
  e.unit === 'g'
    ? macrosFor(e.per, e.qty)
    : { kcal: Math.round(e.per.kcal * e.qty), protein: round1(e.per.protein * e.qty), carbs: round1(e.per.carbs * e.qty), fat: round1(e.per.fat * e.qty) };

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
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editMode, setEditMode] = useState<'pz' | 'g'>('g');
  const [editPieces, setEditPieces] = useState(1);
  const dayT = useDayTarget(profile, date);
  const target = useMemo(() => dayT?.day ?? userNutrition(profile, settings), [dayT, profile, settings]);
  const totals = useMemo(() => sumMacros(entries.map(entryMacros)), [entries]);
  const left = target.target - totals.kcal;

  const plan = settings.weekPlan;
  const weekday = (fromISODate(date).getDay() + 6) % 7;
  const planDay = plan?.days[weekday]?.meals ?? [];

  const copyFromPlan = () => {
    if (!data || !planDay.length) return;
    const byId = new Map(data.recipes.map((r) => [r.id, r]));
    const now = Date.now();
    const out: DiaryEntry[] = [];
    for (const m of planDay) {
      const meal = SLOT_TO_MEAL[m.slot];
      const info = mealInfo(m, byId);
      if (m.kind === 'custom' && m.fixed) out.push({ id: uid(), meal, name: info.name, unit: 'porzione', qty: 1, per: m.fixed, createdAt: now });
      if (m.kind === 'recipe' && info.recipe?.k) {
        const k = info.recipe.k;
        out.push({ id: uid(), meal, name: info.recipe.t, unit: 'porzione', qty: m.servings, per: { kcal: k[0], protein: k[1], carbs: k[2], fat: k[3] }, recipeId: info.recipe.id, createdAt: now });
      }
      for (const p of [...m.items, ...m.extras])
        out.push({ id: uid(), meal, name: p.food, unit: 'g', qty: p.grams, per: simpleFoodPer100(p.food), createdAt: now });
    }
    void add(out);
    toast.success('Pasti del piano aggiunti al diario');
  };

  const pickRecipe = (r: Recipe, servings: number) => {
    if (!adding || !r.k) return;
    void add([{ id: uid(), meal: adding, name: r.t, unit: 'porzione', qty: servings, per: { kcal: r.k[0], protein: r.k[1], carbs: r.k[2], fat: r.k[3] }, recipeId: r.id, createdAt: Date.now() }]);
    setAdding(null);
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
        <MacroBar label="Proteine" value={totals.protein} target={target.protein} unit="g" color="#39FF88" />
        <MacroBar label="Carboidrati" value={totals.carbs} target={target.carbs} unit="g" color="#C084FC" />
        <MacroBar label="Grassi" value={totals.fat} target={target.fat} unit="g" color="#EAB308" />
        {dayT && dayT.day.delta !== 0 && (
          <p className="text-xs text-fg-2">
            {dayT.day.training ? `🏋️ Giorno di allenamento: +${dayT.day.delta} kcal di carboidrati` : `😴 Giorno di riposo: ${dayT.day.delta} kcal`}
            <HelpTip id="diet-cycling" className="ml-1" />
          </p>
        )}
        <WhyKcal base={dayT?.base ?? target} day={dayT?.day} />
      </Card>

      {date === todayISO() && !loading && (
        <MealSuggest
          remaining={{ kcal: target.target - totals.kcal, protein: target.protein - totals.protein, carbs: target.carbs - totals.carbs, fat: target.fat - totals.fat }}
          entries={entries}
          date={date}
          data={data ?? null}
          onAdd={(items, label) => {
            void add(items);
            toast.success(`Aggiunto a ${label}`);
          }}
        />
      )}

      {planDay.length > 0 && !loading && entries.length === 0 && (
        <Button variant="secondary" fullWidth icon={<ClipboardCopy className="h-5 w-5" />} disabled={!data} onClick={copyFromPlan}>
          Copia i pasti del piano di {dayLabel(date).toLowerCase() === 'oggi' ? 'oggi' : 'questo giorno'}
        </Button>
      )}

      {MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal.key);
        const kcal = list.reduce((a, e) => a + entryMacros(e).kcal, 0);
        return (
          <Card key={meal.key} className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-fg">
                {meal.emoji} {meal.label}
              </div>
              <span className="text-sm text-fg-3">{kcal} kcal</span>
            </div>
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
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={() => setAdding(meal.key)} className="flex items-center gap-1 text-sm font-semibold text-accent-400">
                <Plus className="h-4 w-4" /> Aggiungi alimento
              </button>
              <button type="button" onClick={() => setPhotoFor(meal.key)} aria-label={`Foto del piatto: ${meal.label}`} className="flex items-center gap-1 text-sm font-semibold text-violet-400">
                <Camera className="h-4 w-4" /> Foto piatto
              </button>
            </div>
          </Card>
        );
      })}

      <Card className="p-4">
        <div className="mb-3 text-base font-semibold text-fg">📝 Com'è andata {dayLabel(date).toLowerCase() === 'oggi' ? 'oggi' : 'questa giornata'}?</div>
        <DayRecapForm key={date} initial={recap} onSend={(r) => saveRecap(r)} />
      </Card>

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
