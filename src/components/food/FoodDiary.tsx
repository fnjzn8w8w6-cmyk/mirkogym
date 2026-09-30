import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ClipboardCopy, Plus, Trash2 } from 'lucide-react';
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
const qtyText = (e: DiaryEntry) => (e.unit === 'g' ? `${fmtNum(e.qty)} g` : `${fmtNum(e.qty)} ${e.qty === 1 ? 'porzione' : 'porzioni'}`);

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
  const { entries, loading, add, update, remove } = useFoodLog(date);
  const { data } = useRecipes();
  const [adding, setAdding] = useState<DiaryMeal | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const target = useMemo(() => userNutrition(profile, settings), [profile, settings]);
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
        <button type="button" onClick={() => setDate(todayISO())} className="text-lg font-semibold text-fg">
          {dayLabel(date)}
        </button>
        <IconButton label="Giorno successivo" onClick={() => setDate(toISODate(addDays(fromISODate(date), 1)))}>
          <ChevronRight className="h-6 w-6" />
        </IconButton>
      </div>

      <Card variant="elevated" className="space-y-3 p-4">
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="text-2xl text-fg">{target.target}</div>
            <div className="text-xs uppercase text-fg-3">Obiettivo</div>
          </div>
          <div>
            <div className="text-2xl text-fg">{totals.kcal}</div>
            <div className="text-xs uppercase text-fg-3">Mangiate</div>
          </div>
          <div>
            <div className={cn('text-2xl', left < 0 ? 'text-warning' : 'text-success')}>{left}</div>
            <div className="text-xs uppercase text-fg-3">{left < 0 ? 'Oltre' : 'Restano'}</div>
          </div>
        </div>
        <MacroBar label="Proteine" value={totals.protein} target={target.protein} unit="g" color="#EC4899" />
        <MacroBar label="Carboidrati" value={totals.carbs} target={target.carbs} unit="g" color="#14B8A6" />
        <MacroBar label="Grassi" value={totals.fat} target={target.fat} unit="g" color="#EAB308" />
      </Card>

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
            <button type="button" onClick={() => setAdding(meal.key)} className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent-400">
              <Plus className="h-4 w-4" /> Aggiungi alimento
            </button>
          </Card>
        );
      })}

      <FoodPicker
        open={adding != null}
        onClose={() => setAdding(null)}
        title={`Aggiungi a ${MEALS.find((m) => m.key === adding)?.label.toLowerCase() ?? ''}`}
        recipes={data?.recipes}
        onPickFood={(food, grams) => {
          if (!adding) return;
          void add([{ id: uid(), meal: adding, name: food.name, brand: food.brand, unit: 'g', qty: grams, per: food.per100, foodId: food.id, createdAt: Date.now() }]);
          setAdding(null);
          toast.success(`${food.name} aggiunto`);
        }}
        onPickRecipe={pickRecipe}
      />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.name}>
        {editing && (
          <div className="space-y-3">
            <Input
              label={editing.unit === 'g' ? 'Quantità (grammi)' : 'Porzioni'}
              inputMode="decimal"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
            />
            {(() => {
              const q = Number(editQty.replace(',', '.'));
              const m = entryMacros({ ...editing, qty: Number.isFinite(q) ? q : 0 });
              return (
                <p className="text-sm text-fg-2">
                  {m.kcal} kcal · P {fmtNum(m.protein)} · C {fmtNum(m.carbs)} · G {fmtNum(m.fat)}
                </p>
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
                disabled={!(Number(editQty.replace(',', '.')) > 0)}
                onClick={() => {
                  void update({ ...editing, qty: Number(editQty.replace(',', '.')) });
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
