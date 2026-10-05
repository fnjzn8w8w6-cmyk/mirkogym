/**
 * Ponte tra piano e diario: il piano è un suggerimento, il diario è quello che conta.
 * Qui si trasformano i pasti del piano in voci del diario e si calcola la data reale di un giorno della settimana.
 */
import { addDays } from 'date-fns';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { toISODate } from './date-utils';
import { mealInfo, simpleFoodPer100, type PlannedMeal, type Recipe, type SlotKey } from './recipes';

export const SLOT_TO_MEAL: Record<SlotKey, DiaryMeal> = { colazione: 'colazione', pranzo: 'pranzo', cena: 'cena', spuntino: 'spuntini', merenda: 'spuntini' };

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Voci del diario per un pasto del piano (ricetta, pasto semplice o pasto libero). */
export function planMealEntries(m: PlannedMeal, byId: Map<string, Recipe>, meal: DiaryMeal = SLOT_TO_MEAL[m.slot]): DiaryEntry[] {
  const now = Date.now();
  const info = mealInfo(m, byId);
  const out: DiaryEntry[] = [];
  if (m.kind === 'custom') out.push({ id: uid(), meal, name: info.name, unit: 'porzione', qty: 1, per: m.fixed ?? m.macros, createdAt: now });
  if (m.kind === 'recipe' && info.recipe?.k) {
    const k = info.recipe.k;
    out.push({ id: uid(), meal, name: info.recipe.t, unit: 'porzione', qty: m.servings, per: { kcal: k[0], protein: k[1], carbs: k[2], fat: k[3] }, recipeId: info.recipe.id, createdAt: now });
  }
  for (const p of [...m.items, ...m.extras]) out.push({ id: uid(), meal, name: p.food, unit: 'g', qty: p.grams, per: simpleFoodPer100(p.food), createdAt: now });
  return out;
}

/** Pasti del piano che corrispondono a un pasto del diario (spuntini = spuntino + merenda). */
export const planMealsFor = (day: PlannedMeal[], meal: DiaryMeal) => day.filter((m) => SLOT_TO_MEAL[m.slot] === meal);

/** Data (YYYY-MM-DD) del prossimo giorno della settimana indicato (0 = lunedì), oggi compreso. */
export function nextDateOf(weekday: number, now = new Date()): string {
  const today = (now.getDay() + 6) % 7;
  return toISODate(addDays(now, (weekday - today + 7) % 7));
}
