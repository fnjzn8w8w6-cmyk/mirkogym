/**
 * "Cosa mangio per chiudere la giornata?": pasti che chiudono calorie e macro rimanenti.
 * Le idee arrivano, in quest'ordine di preferenza, da:
 *  1) il tuo storico (pasti che hai già mangiato in quel momento della giornata),
 *  2) il piano settimanale di oggi,
 *  3) abbinamenti semplici e ricette del catalogo compatibili con dieta, allergie e gusti.
 * Le quantità vengono ottimizzate sul telefono (nessuna richiesta AI).
 */
import type { DiaryEntry, DiaryMeal, FoodLog } from '@/types';
import type { Macros } from './foods';
import { exclusionPatterns, mealCandidates, simpleFoodPer100, type PlanPrefs, type PlannedMeal, type RecipeData, type SlotKey } from './recipes';
import { isCountable, pieceGrams } from './food-units';

export interface SuggestItem {
  name: string;
  unit: 'g' | 'porzione';
  /** grammi (unit g) o porzioni (unit porzione) */
  qty: number;
  /** valori per 100 g (g) o per porzione */
  per: Macros;
  pieces?: number;
  pieceGrams?: number;
  foodId?: string;
  recipeId?: string;
  /** limiti della quantità durante l'ottimizzazione */
  min: number;
  max: number;
}

export interface Suggestion {
  key: string;
  title: string;
  emoji: string;
  source: 'storico' | 'piano' | 'abbinamento' | 'ricetta';
  /** quante volte l'hai già mangiato */
  times: number;
  items: SuggestItem[];
  macros: Macros;
  error: number;
}

export interface MealFeedback {
  liked: string[];
  skipped: string[];
}

const SLOT: Record<DiaryMeal, SlotKey> = { colazione: 'colazione', pranzo: 'pranzo', cena: 'cena', spuntini: 'spuntino' };

const itemMacros = (it: SuggestItem): Macros => {
  const k = it.unit === 'g' ? it.qty / 100 : it.qty;
  return { kcal: it.per.kcal * k, protein: it.per.protein * k, carbs: it.per.carbs * k, fat: it.per.fat * k };
};
const sum = (items: SuggestItem[]): Macros =>
  items.map(itemMacros).reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** Distanza tra i macro del pasto e quelli rimanenti (proteine e calorie pesano di più, sforare i grassi pesa). */
export function macroError(m: Macros, rem: Macros): number {
  const t = { kcal: Math.max(80, rem.kcal), protein: Math.max(0, rem.protein), carbs: Math.max(0, rem.carbs), fat: Math.max(0, rem.fat) };
  const rel = (v: number, target: number, floor: number) => (v - target) / Math.max(target, floor);
  const fatOver = Math.max(0, m.fat - t.fat);
  return 2 * rel(m.kcal, t.kcal, 150) ** 2 + 3 * rel(m.protein, t.protein, 15) ** 2 + 1 * rel(m.carbs, t.carbs, 20) ** 2 + 1 * rel(m.fat, t.fat, 8) ** 2 + 0.02 * fatOver ** 2;
}

/** Ottimizza le quantità degli ingredienti (ricerca per coordinate), poi arrotonda pezzi e grammi. */
function fit(items: SuggestItem[], rem: Macros): SuggestItem[] {
  let cur = items.map((i) => ({ ...i }));
  let best = macroError(sum(cur), rem);
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (let j = 0; j < cur.length; j++) {
      const it = cur[j];
      const step = it.unit === 'g' ? Math.max(5, it.qty * 0.1) : 0.25;
      for (const dir of [1, -1]) {
        const q = Math.min(it.max, Math.max(it.min, it.qty + dir * step));
        if (q === it.qty) continue;
        const trial = cur.map((x, k) => (k === j ? { ...x, qty: q } : x));
        const e = macroError(sum(trial), rem);
        if (e < best - 1e-6) {
          cur = trial;
          best = e;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  // arrotondamenti "da cucina": pezzi interi (mezzi per frutta grande), grammi a 5, porzioni a 0,25
  return cur.map((it) => {
    if (it.unit === 'porzione') return { ...it, qty: Math.max(0.5, Math.round(it.qty * 4) / 4) };
    if (it.pieceGrams) {
      const n = Math.max(0.5, Math.round((it.qty / it.pieceGrams) * 2) / 2);
      const whole = /uov|tuorl|albume|yogurt|vasett|fett|cracker|grissin/i.test(it.name) ? Math.max(1, Math.round(n)) : n;
      return { ...it, pieces: whole, qty: Math.round(whole * it.pieceGrams) };
    }
    return { ...it, qty: Math.max(5, Math.round(it.qty / 5) * 5) };
  });
}

const gItem = (name: string, grams: number, per: Macros, unitGrams?: number, foodId?: string): SuggestItem => {
  const pg = isCountable(name) ? pieceGrams(name, unitGrams) : undefined;
  return { name, unit: 'g', qty: grams, per, min: Math.max(5, grams * 0.4), max: grams * 2.2, ...(pg ? { pieceGrams: pg } : {}), ...(foodId ? { foodId } : {}) };
};
const keyOf = (items: { name: string }[]) =>
  items
    .map((i) => i.name.toLowerCase())
    .sort()
    .join('+');

/* ---------- Storico ---------- */

export interface MealHabit {
  name: string;
  count: number;
}

/** Cosa mangi di solito in un pasto (dal diario): alimenti più frequenti. */
export function habitsFor(foodLogs: FoodLog[], meal: DiaryMeal): MealHabit[] {
  const m = new Map<string, number>();
  for (const l of foodLogs) for (const e of l.entries) if (e.meal === meal) m.set(e.name, (m.get(e.name) ?? 0) + 1);
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/** Pasti già mangiati in quel momento della giornata (stessa combinazione di alimenti), con quante volte. */
function historyMeals(foodLogs: FoodLog[], meal: DiaryMeal): { entries: DiaryEntry[]; times: number }[] {
  const m = new Map<string, { entries: DiaryEntry[]; times: number }>();
  for (const l of foodLogs) {
    const es = l.entries.filter((e) => e.meal === meal);
    if (!es.length || es.length > 5) continue;
    const k = keyOf(es);
    const cur = m.get(k);
    m.set(k, { entries: cur?.entries ?? es, times: (cur?.times ?? 0) + 1 });
  }
  return [...m.values()].sort((a, b) => b.times - a.times).slice(0, 12);
}

/* ---------- Generazione ---------- */

export function suggestMeals(input: {
  remaining: Macros;
  meal: DiaryMeal;
  foodLogs: FoodLog[];
  data: RecipeData | null;
  prefs: PlanPrefs;
  planMeal?: PlannedMeal | null;
  feedback?: MealFeedback | null;
  exclude?: string[];
  count?: number;
}): Suggestion[] {
  const { remaining: rem, meal } = input;
  const excl = exclusionPatterns(`${input.prefs.allergies},${input.prefs.dislikes}`);
  const ok = (text: string) => !excl.some((re) => re.test(text));
  const out: Suggestion[] = [];
  const push = (title: string, emoji: string, source: Suggestion['source'], times: number, items: SuggestItem[]) => {
    if (!items.length || !ok(items.map((i) => i.name).join(' '))) return;
    const fitted = fit(items, rem);
    const macros = sum(fitted);
    const key = keyOf(fitted);
    if (out.some((o) => o.key === key)) return;
    const fb = input.feedback;
    // lo storico e i "mi piace" contano; le idee scartate di recente vengono proposte meno
    const bonus = Math.log1p(times) * 0.25 + (fb?.liked.includes(key) ? 0.25 : 0) - (fb?.skipped.filter((k) => k === key).length ?? 0) * 0.15;
    out.push({ key, title, emoji, source, times, items: fitted, macros, error: macroError(macros, rem) - bonus });
  };

  // 1) Storico
  for (const h of historyMeals(input.foodLogs, meal)) {
    const items = h.entries.map((e): SuggestItem =>
      e.unit === 'g'
        ? { ...gItem(e.name, e.qty, e.per, e.pieceGrams, e.foodId) }
        : { name: e.name, unit: 'porzione', qty: e.qty, per: e.per, min: 0.5, max: 2, ...(e.recipeId ? { recipeId: e.recipeId } : {}) },
    );
    push(h.entries.map((e) => e.name).join(' + '), '🕘', 'storico', h.times, items);
  }

  // 2) Piano di oggi
  const pm = input.planMeal;
  if (pm && input.data) {
    if (pm.kind === 'recipe') {
      const r = input.data.recipes.find((x) => x.id === pm.refId);
      if (r?.k) push(r.t, '📅', 'piano', 0, [{ name: r.t, unit: 'porzione', qty: pm.servings, per: { kcal: r.k[0], protein: r.k[1], carbs: r.k[2], fat: r.k[3] }, min: 0.5, max: 2, recipeId: r.id }]);
    } else if (pm.kind === 'simple' && pm.items.length) {
      push(pm.items.map((i) => i.food).join(' + '), '📅', 'piano', 0, pm.items.map((i) => gItem(i.food, i.grams, simpleFoodPer100(i.food))));
    }
  }

  // 3) Abbinamenti semplici e ricette compatibili
  if (input.data) {
    const slot = SLOT[meal];
    const c = mealCandidates(input.data, input.prefs, slot);
    for (const sm of c.simple) push(sm.name, sm.emoji, 'abbinamento', 0, sm.items.map(([f, g]) => gItem(f, g, simpleFoodPer100(f))));
    // ricette: solo quelle con macro vicini a ciò che manca (pre-filtro sul rapporto proteine/calorie)
    const want = rem.kcal > 0 ? rem.protein / rem.kcal : 0;
    const recs = [...c.recipes]
      .filter((r) => r.k)
      .sort((a, b) => Math.abs(a.k![1] / a.k![0] - want) - Math.abs(b.k![1] / b.k![0] - want))
      .slice(0, 25);
    for (const r of recs) push(r.t, '🍽️', 'ricetta', 0, [{ name: r.t, unit: 'porzione', qty: 1, per: { kcal: r.k![0], protein: r.k![1], carbs: r.k![2], fat: r.k![3] }, min: 0.5, max: 2, recipeId: r.id }]);
  }

  const exclude = new Set(input.exclude ?? []);
  const ranked = out.filter((s) => !exclude.has(s.key)).sort((a, b) => a.error - b.error);
  // varietà: al massimo 2 proposte dalla stessa fonte nelle prime posizioni
  const picked: Suggestion[] = [];
  for (const s of ranked) {
    if (picked.length >= (input.count ?? 3)) break;
    if (picked.filter((p) => p.source === s.source).length >= 2) continue;
    picked.push(s);
  }
  for (const s of ranked) if (picked.length < (input.count ?? 3) && !picked.includes(s)) picked.push(s);
  return picked;
}

/** Il pasto vuoto più adatto all'ora (colazione al mattino, poi pranzo, cena, altrimenti spuntino). */
export function emptyMeals(entries: DiaryEntry[]): DiaryMeal[] {
  return (['colazione', 'pranzo', 'cena', 'spuntini'] as DiaryMeal[]).filter((m) => m === 'spuntini' || !entries.some((e) => e.meal === m));
}
