import type { BodyLog, Session } from '@/types';
import { callAI, callAIJson, num, oneOf, str, strArr, type AIOptions } from './ai';
import { GOALS, EXPERIENCE, type Goal, type Nutrition, type UserProfile } from './metabolism';
import { PRIORITY_KEYS, SLOT_IDS, SLOT_LABEL, type CoachPrefs } from './program-generator';
import { NAME_IT } from './exercise-library';
import { sessionTonnage } from './analytics';

/* =====================================================================
 * PERSONAL TRAINER — richiesta in linguaggio naturale → preferenze strutturate
 * ===================================================================== */

export async function interpretTrainingRequest(request: string, profile: UserProfile, opts: AIOptions = {}): Promise<CoachPrefs> {
  const exerciseList = Object.entries(NAME_IT)
    .map(([id, name]) => `${id} = ${name}`)
    .join('\n');
  const prompt = `Sei un personal trainer esperto. Un utente descrive cosa vuole dal suo allenamento. Traduci la richiesta in impostazioni per un generatore di schede.
Profilo: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}, ${profile.daysPerWeek} giorni/settimana.

RICHIESTA DELL'UTENTE: """${request.slice(0, 1200)}"""

Valori ammessi:
- priorities (muscoli da enfatizzare): ${PRIORITY_KEYS.join(', ')}
- avoidSlots (movimenti da evitare, es. per dolori/infortuni o perché non piacciono):
${SLOT_IDS.map((s) => `  ${s} = ${SLOT_LABEL[s]}`).join('\n')}
- avoidExercises: id di esercizi specifici da evitare, SOLO da questo elenco:
${exerciseList}

Regole: con dolore al ginocchio evita squat e lunge (ed eventualmente kneeExt); con dolore lombare evita hinge e squat; con dolore alla spalla evita vpush (ed eventualmente hpush). Non inventare valori fuori elenco. maxMinutes solo se l'utente indica un tempo (numero tra 20 e 150).
Rispondi SOLO con JSON:
{"priorities": [...], "avoidSlots": [...], "avoidExercises": [...], "maxMinutes": numero o null, "injuries": ["breve descrizione in italiano"], "summary": "1-2 frasi in italiano, seconda persona, su cosa hai capito e cosa cambierai"}`;

  return callAIJson(
    prompt,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const priorities = (Array.isArray(r.priorities) ? r.priorities : [])
        .map((x) => oneOf(x, PRIORITY_KEYS))
        .filter((x): x is (typeof PRIORITY_KEYS)[number] => !!x);
      const avoidSlots = (Array.isArray(r.avoidSlots) ? r.avoidSlots : [])
        .map((x) => oneOf(x, SLOT_IDS))
        .filter((x): x is (typeof SLOT_IDS)[number] => !!x);
      const avoidExercises = strArr(r.avoidExercises, 20).filter((id) => id in NAME_IT);
      const summary = str(r.summary, 400);
      if (!summary) throw new Error("Il coach non ha capito la richiesta: prova a riformularla");
      return {
        request: request.trim(),
        summary,
        priorities: [...new Set(priorities)].slice(0, 4),
        avoidSlots: [...new Set(avoidSlots)],
        avoidExercises,
        maxMinutes: num(r.maxMinutes, 20, 150),
        injuries: strArr(r.injuries, 5),
      };
    },
    { temperature: 0.2, label: 'Il coach sta leggendo la tua richiesta…', ...opts },
  );
}

/* =====================================================================
 * DIETOLOGO — piano alimentare su misura (numeri calcolati dall'app)
 * ===================================================================== */

export type Diet = 'onnivora' | 'vegetariana' | 'vegana' | 'pescetariana';
export const DIETS: { value: Diet; label: string; emoji: string }[] = [
  { value: 'onnivora', label: 'Onnivora', emoji: '🍗' },
  { value: 'pescetariana', label: 'Pescetariana', emoji: '🐟' },
  { value: 'vegetariana', label: 'Vegetariana', emoji: '🥚' },
  { value: 'vegana', label: 'Vegana', emoji: '🌱' },
];

export interface NutritionPrefs {
  diet: Diet;
  meals: 3 | 4 | 5;
  allergies: string;
  dislikes: string;
  likes: string;
  cooking: 'poco' | 'medio' | 'molto';
}

export interface FoodItem {
  food: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  name: string;
  time: string;
  items: FoodItem[];
  prep: string;
}

export interface MealPlan {
  createdAt: number;
  targetKcal: number;
  meals: Meal[];
  tips: string[];
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const sumItems = (items: FoodItem[]): Macros =>
  items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
export const mealTotals = (m: Meal): Macros => sumItems(m.items);
export const planTotals = (p: MealPlan): Macros => sumItems(p.meals.flatMap((m) => m.items));

function parseItem(raw: unknown): FoodItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const food = str(r.food, 80);
  const grams = num(r.grams, 1, 2000);
  const protein = num(r.protein, 0, 300) ?? 0;
  const carbs = num(r.carbs, 0, 500) ?? 0;
  const fat = num(r.fat, 0, 250) ?? 0;
  // Calorie ricalcolate dai macro (4/4/9): più coerenti delle kcal dichiarate dal modello
  const kcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
  if (!food || grams == null) return null;
  return { food, grams: Math.round(grams), kcal, protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
}

function parseMeal(raw: unknown): Meal | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(r.items) ? r.items : []).map(parseItem).filter((x): x is FoodItem => !!x);
  const name = str(r.name, 40);
  if (!name || items.length === 0) return null;
  return { name, time: str(r.time, 10), items: items.slice(0, 10), prep: str(r.prep, 300) };
}

/**
 * Riscala le porzioni perché le calorie centrino l'obiettivo (l'AI sceglie gli alimenti,
 * i numeri li garantisce l'app). Fattore limitato a 0,6–1,6 per porzioni realistiche.
 */
function scaleItems(items: FoodItem[], targetKcal: number): FoodItem[] {
  const total = sumItems(items).kcal;
  if (!total || Math.abs(total - targetKcal) / targetKcal <= 0.05) return items;
  const f = Math.min(1.6, Math.max(0.6, targetKcal / total));
  return items.map((i) => {
    const grams = Math.max(5, Math.round((i.grams * f) / 5) * 5);
    const k = grams / i.grams;
    const protein = Math.round(i.protein * k);
    const carbs = Math.round(i.carbs * k);
    const fat = Math.round(i.fat * k);
    return { ...i, grams, protein, carbs, fat, kcal: Math.round(protein * 4 + carbs * 4 + fat * 9) };
  });
}

function scalePlan(meals: Meal[], targetKcal: number): Meal[] {
  const total = sumItems(meals.flatMap((m) => m.items)).kcal;
  if (!total || Math.abs(total - targetKcal) / targetKcal <= 0.05) return meals;
  // Ogni pasto viene scalato in proporzione al suo peso sul totale
  return meals.map((m) => ({ ...m, items: scaleItems(m.items, (sumItems(m.items).kcal / total) * targetKcal) }));
}

const prefsText = (p: NutritionPrefs) =>
  `Dieta: ${p.diet}. Pasti al giorno: ${p.meals}. Tempo per cucinare: ${p.cooking}.` +
  (p.allergies.trim() ? ` ALLERGIE/INTOLLERANZE (da escludere assolutamente): ${p.allergies.trim().slice(0, 200)}.` : '') +
  (p.dislikes.trim() ? ` Cibi non graditi (evitare): ${p.dislikes.trim().slice(0, 200)}.` : '') +
  (p.likes.trim() ? ` Cibi preferiti (usarli quando possibile): ${p.likes.trim().slice(0, 200)}.` : '');

const ITEM_FORMAT = `{"food": "nome alimento in italiano", "grams": numero (peso crudo se da cuocere), "protein": g, "carbs": g, "fat": g}`;

export async function generateMealPlan(target: Nutrition, profile: UserProfile, prefs: NutritionPrefs, opts: AIOptions = {}): Promise<MealPlan> {
  const prompt = `Sei un dietologo sportivo. Crea UNA giornata tipo di alimentazione per un ${profile.sex === 'm' ? 'uomo' : 'donna'} di ${profile.age} anni, ${profile.weightKg} kg, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}.
OBIETTIVI GIORNALIERI (rispettali con tolleranza ±5%): ${target.target} kcal, proteine ${target.protein} g, carboidrati ${target.carbs} g, grassi ${target.fat} g.
${prefsText(prefs)}
Usa alimenti comuni nei supermercati italiani, porzioni realistiche in grammi, valori nutrizionali coerenti con le tabelle CREA/USDA. Distribuisci le proteine su tutti i pasti. Includi verdura e frutta.
Rispondi SOLO con JSON:
{"meals": [{"name": "Colazione", "time": "07:30", "items": [${ITEM_FORMAT}], "prep": "preparazione in 1 frase"}], "tips": ["3 consigli pratici brevi in italiano"]}`;

  return callAIJson(
    prompt,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const meals = (Array.isArray(r.meals) ? r.meals : []).map(parseMeal).filter((x): x is Meal => !!x);
      if (meals.length < 2) throw new Error('Piano alimentare incompleto, riprova');
      return { createdAt: Date.now(), targetKcal: target.target, meals: scalePlan(meals.slice(0, 7), target.target), tips: strArr(r.tips, 5, 200) };
    },
    { temperature: 0.7, label: 'Il dietologo sta preparando il tuo piano…', ...opts },
  );
}

/** Sostituisce un pasto con un'alternativa equivalente (stesse calorie e macro circa). */
export async function regenerateMeal(meal: Meal, prefs: NutritionPrefs, opts: AIOptions = {}): Promise<Meal> {
  const t = mealTotals(meal);
  const prompt = `Sei un dietologo sportivo. Proponi un'ALTERNATIVA diversa al pasto "${meal.name}" (attuale: ${meal.items.map((i) => i.food).join(', ')}).
Deve avere circa ${t.kcal} kcal, ${t.protein} g proteine, ${t.carbs} g carboidrati, ${t.fat} g grassi (±10%).
${prefsText(prefs)}
Rispondi SOLO con JSON: {"name": "${meal.name}", "time": "${meal.time}", "items": [${ITEM_FORMAT}], "prep": "preparazione in 1 frase"}`;
  return callAIJson(
    prompt,
    (raw) => {
      const m = parseMeal(raw);
      if (!m) throw new Error('Alternativa non valida, riprova');
      return { ...m, name: meal.name, time: meal.time || m.time, items: scaleItems(m.items, t.kcal) };
    },
    { temperature: 0.9, label: 'Cerco un’alternativa…', ...opts },
  );
}

/** Lista della spesa per N giorni (somma dei grammi per alimento). */
export function shoppingList(plan: MealPlan, days = 7): { food: string; grams: number }[] {
  const map = new Map<string, { food: string; grams: number }>();
  for (const i of plan.meals.flatMap((m) => m.items)) {
    const k = i.food.trim().toLowerCase();
    const cur = map.get(k) ?? { food: i.food, grams: 0 };
    cur.grams += i.grams * days;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.grams - a.grams);
}

/* =====================================================================
 * CALORIE ADATTIVE — confronto tra andamento reale del peso e atteso (stile MacroFactor)
 * ===================================================================== */

/** Variazione di peso attesa a settimana (frazione del peso corporeo). */
const EXPECTED_RATE: Record<Goal, number> = { cut: -0.005, bulk: 0.0025, strength: 0.001, maintain: 0 };

export interface Adaptive {
  /** kg/settimana misurati (regressione lineare sulle pesate) */
  actual: number;
  expected: number;
  /** correzione suggerita in kcal/giorno (arrotondata a 50) */
  suggestion: number;
  days: number;
  points: number;
  message: string;
}

export function adaptiveCalories(logs: BodyLog[], profile: UserProfile): Adaptive | null {
  const since = Date.now() - 28 * 86400000;
  const pts = logs
    .filter((l) => l.weight != null && new Date(l.date).getTime() >= since)
    .map((l) => ({ x: new Date(l.date).getTime() / 86400000, y: l.weight as number }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 4) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  if (span < 10) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0); // kg/giorno
  const actual = slope * 7;
  const expected = EXPECTED_RATE[profile.goal] * my;
  // 1 kg di tessuto ≈ 7700 kcal
  const raw = ((expected - actual) * 7700) / 7;
  const suggestion = Math.max(-300, Math.min(300, Math.round(raw / 50) * 50));
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} kg/sett.`;
  const message =
    Math.abs(suggestion) < 100
      ? `Stai andando come previsto (${fmt(actual)}, atteso ${fmt(expected)}): nessuna modifica.`
      : suggestion > 0
        ? `Il peso ${actual < expected ? 'scende più del previsto' : 'sale meno del previsto'} (${fmt(actual)} vs ${fmt(expected)}): consiglio +${suggestion} kcal al giorno.`
        : `Il peso ${actual > expected ? 'sale più del previsto' : 'scende meno del previsto'} (${fmt(actual)} vs ${fmt(expected)}): consiglio ${suggestion} kcal al giorno.`;
  return { actual, expected, suggestion: Math.abs(suggestion) < 100 ? 0 : suggestion, days: Math.round(span), points: pts.length, message };
}

/* =====================================================================
 * CHAT — domande libere al coach, con il contesto dell'utente
 * ===================================================================== */

export interface ChatMessage {
  role: 'user' | 'coach';
  text: string;
}

export function coachContext(profile: UserProfile | undefined, target: Nutrition | null, sessions: Session[], bodyLogs: BodyLog[]): string {
  const last = sessions.slice(0, 5).map((s) => `${new Date(s.date).toLocaleDateString('it-IT')}: ${s.logs.length} esercizi, ${Math.round(sessionTonnage(s))} kg di volume`);
  const w = bodyLogs.filter((b) => b.weight != null).slice(0, 5).map((b) => `${b.date}: ${b.weight} kg${b.bodyFat ? `, BF ${b.bodyFat}%` : ''}`);
  return [
    profile
      ? `Utente: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, ${profile.heightCm} cm, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}, ${profile.daysPerWeek} allenamenti/settimana.`
      : '',
    target ? `Obiettivi nutrizionali: ${target.target} kcal, P ${target.protein} g, C ${target.carbs} g, G ${target.fat} g.` : '',
    last.length ? `Ultimi allenamenti: ${last.join('; ')}.` : 'Nessun allenamento registrato.',
    w.length ? `Ultime pesate: ${w.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function askCoach(question: string, history: ChatMessage[], context: string, opts: AIOptions = {}): Promise<string> {
  const convo = history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Utente' : 'Coach'}: ${m.text}`)
    .join('\n');
  const prompt = `Sei il coach di MirkoGym: personal trainer e nutrizionista sportivo. Rispondi in italiano, in modo pratico e motivante, massimo 150 parole, con elenchi brevi se utile. Basati sulle evidenze scientifiche. Se la domanda riguarda dolori, patologie, farmaci o disturbi alimentari, dai indicazioni generali e consiglia di rivolgersi a un medico o professionista. Non proporre diete sotto 1200 kcal né pratiche pericolose.
CONTESTO UTENTE:
${context}
${convo ? `CONVERSAZIONE:\n${convo}\n` : ''}Utente: ${question.slice(0, 1000)}
Coach:`;
  const text = await callAI([{ text: prompt }], { temperature: 0.6, label: 'Il coach sta scrivendo…', ...opts });
  return text.trim().slice(0, 2500);
}
