import type { BodyLog, Session } from '@/types';
import { callAI, callAIJson, num, oneOf, str, strArr, type AIOptions } from './ai';
import { GOALS, EXPERIENCE, MACRO_STYLE_LABEL, nutrition, type Goal, type MacroStyle, type Nutrition, type UserProfile } from './metabolism';
import { PRIORITY_KEYS, SLOT_IDS, SLOT_LABEL, type CoachPrefs } from './program-generator';
import { NAME_IT } from './exercise-library';
import { planRate, type GoalPlan } from './goal-plan';
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
  /** distribuzione dei macro scelta con il coach */
  style?: MacroStyle;
  /** ultima richiesta al dietologo e cosa ha capito */
  request?: string;
  summary?: string;
}

/** Obiettivi dell'utente: calorie con la correzione del check-in e stile dei macro scelto con il coach. */
export const userNutrition = (
  p: UserProfile,
  s: { kcalAdjust?: number; nutritionPrefs?: NutritionPrefs; goalPlan?: GoalPlan | null; metabolism?: MetabolismState | null },
): Nutrition => {
  // Obiettivo a fasi: la fase in corso decide tipo di obiettivo e ritmo (calorie)
  const phase = s.goalPlan?.phases[s.goalPlan.current];
  const prof = phase ? { ...p, goal: phase.type } : p;
  // Con il metabolismo reale le correzioni dei check-in non servono più (lo misura già)
  const real = s.metabolism?.tdee ?? null;
  return nutrition(prof, real ? 0 : (s.kcalAdjust ?? 0), s.nutritionPrefs?.style ?? 'standard', phase ? planRate(s.goalPlan, [], p.weightKg) : null, real);
};

/** Metabolismo reale salvato (aggiornato una volta al giorno, ±50 kcal). */
export interface MetabolismState {
  tdee: number;
  date: string;
  days: number;
  sd: number;
}

export const DEFAULT_NUTRITION: NutritionPrefs = { diet: 'onnivora', meals: 4, allergies: '', dislikes: '', likes: '', cooking: 'medio' };

/* =====================================================================
 * DIETOLOGO — richiesta in linguaggio naturale → modifiche alla dieta
 * ===================================================================== */

const MACRO_STYLES = ['standard', 'high-protein', 'low-carb', 'high-carb'] as const;
const DIET_VALUES = ['onnivora', 'vegetariana', 'vegana', 'pescetariana'] as const;
const COOKING = ['poco', 'medio', 'molto'] as const;

export const WEEKDAYS_IT = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const;
export const MEAL_SLOTS = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'] as const;

/** Modifica puntuale di un pasto del piano (es. "domani a cena mangio una pizza"). */
export interface MealEdit {
  /** 0 = lunedì … 6 = domenica */
  day: number;
  slot: (typeof MEAL_SLOTS)[number];
  /** free = pasto libero con valori stimati (pizza fuori, cena al ristorante); recipe = scegli una ricetta del ricettario */
  kind: 'free' | 'recipe';
  name: string;
  /** parole chiave per scegliere la ricetta (kind=recipe) */
  query?: string;
  /** stima per il pasto intero (kind=free) */
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** Pasto già mangiato da segnare nel diario (es. "oggi a pranzo ho mangiato 2 piadine col prosciutto"). */
export interface EatenMeal {
  /** 0 = oggi, 1 = ieri, … */
  daysAgo: number;
  slot: (typeof MEAL_SLOTS)[number];
  /** alimenti con quantità e valori stimati per quella quantità */
  items: { name: string; grams: number; pieces?: number; kcal: number; protein: number; carbs: number; fat: number }[];
}

export interface DietChange {
  /** meals = solo pasti puntuali; preferences = preferenze permanenti; both; rebuild = rifare il piano da zero */
  scope: 'meals' | 'preferences' | 'both' | 'rebuild';
  mealEdits: MealEdit[];
  eaten: EatenMeal[];
  diet?: Diet;
  meals?: 3 | 4 | 5;
  cooking?: NutritionPrefs['cooking'];
  style?: MacroStyle;
  addAllergies: string[];
  addDislikes: string[];
  addLikes: string[];
  /** cibi da togliere dai "non graditi" (es. "ora mi piacciono i funghi") */
  removeDislikes: string[];
  /** correzione calorica richiesta (kcal/giorno), già limitata */
  kcalDelta: number;
  summary: string;
  warnings: string[];
}

export async function interpretDietRequest(
  request: string,
  profile: UserProfile,
  prefs: NutritionPrefs,
  target: Nutrition,
  kcalAdjust: number,
  planSummary: string,
  opts: AIOptions = {},
  memory = '',
  diarySummary = '',
): Promise<DietChange> {
  const today = (new Date().getDay() + 6) % 7;
  const prompt = `Sei un dietologo sportivo. Un utente ti chiede una modifica alla sua alimentazione. Fai SOLO ciò che chiede.
Oggi è ${WEEKDAYS_IT[today]} (domani è ${WEEKDAYS_IT[(today + 1) % 7]}).
PIANO DELLA SETTIMANA:
${planSummary || '(nessun piano ancora)'}
${diarySummary ? `DIARIO (quello che l'utente ha mangiato o ha già segnato: conta più del piano):\n${diarySummary}\n` : ''}
Profilo: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, ${profile.weightKg} kg, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}.
Impostazioni attuali: dieta ${prefs.diet}, ${prefs.meals} pasti, tempo per cucinare ${prefs.cooking}, stile macro ${prefs.style ?? 'standard'}, allergie "${prefs.allergies}", non graditi "${prefs.dislikes}", preferiti "${prefs.likes}".
Obiettivo attuale: ${target.target} kcal, proteine ${target.protein} g, carboidrati ${target.carbs} g, grassi ${target.fat} g (correzione già applicata ${kcalAdjust} kcal).
${memory ? `Storico dell'atleta (contesto, non fare modifiche non richieste):\n${memory.slice(0, 1200)}\n` : ''}
RICHIESTA DELL'UTENTE: """${request.slice(0, 1200)}"""

Distingui:
- MODIFICA DI UN PASTO PRECISO (es. "domani a cena mangio una pizza", "sabato pranzo al ristorante", "giovedì a pranzo vorrei qualcosa col pollo"): usa mealEdits e NON cambiare le preferenze.
  · kind "free" se l'utente mangerà qualcosa fuori dal piano: stima realisticamente kcal/proteine/carboidrati/grassi del pasto intero (es. pizza margherita intera ≈ 800-900 kcal).
  · kind "recipe" se vuole un piatto diverso dal piano: metti in query 1-3 parole chiave (es. "pollo", "pesce", "risotto").
  · Le modifiche ai pasti di oggi e dei prossimi giorni vengono scritte sia nel piano sia nel diario dell'utente.
- PASTO GIÀ MANGIATO da segnare (es. "oggi a pranzo ho mangiato 2 piadine col prosciutto", "ieri sera ho preso un gelato"): usa eaten, NON mealEdits. Scomponi negli alimenti con grammi realistici (pieces = numero di pezzi se l'utente li conta) e stima kcal/proteine/carboidrati/grassi di ciascuno per quella quantità. daysAgo: 0 oggi, 1 ieri, 2 l'altro ieri.
- PREFERENZE PERMANENTI (intolleranze, cibi che non ama, dieta, pasti al giorno, tempo, calorie, macro): usa i campi qui sotto.
- scope: "meals", "preferences", "both" oppure "rebuild" SOLO se chiede esplicitamente un piano completamente nuovo.

Valori ammessi (usa null o liste vuote per ciò che l'utente NON chiede di cambiare):
- diet: ${DIET_VALUES.join(', ')}
- meals: 3, 4 o 5 pasti al giorno
- cooking: poco (≤30 min), medio (≤1 ora), molto
- style: standard, high-protein (più proteine), low-carb (pochi carboidrati), high-carb (più carboidrati, es. sport di resistenza)
- addAllergies / addDislikes / addLikes / removeDislikes: alimenti in italiano, una o due parole ciascuno (es. "lattosio", "funghi", "salmone")
- kcalDelta: correzione calorica giornaliera tra -400 e 400 SOLO se l'utente chiede di mangiare di più/meno o di andare più veloce/lento; per dimagrire più in fretta al massimo -250, per aumentare di massa più in fretta al massimo +250.
Regole di sicurezza: niente diete estreme; se l'utente parla di patologie (diabete, reni, disturbi alimentari, gravidanza) aggiungi un avviso in warnings e non ridurre le calorie.
Rispondi SOLO con JSON:
{"scope": "...", "mealEdits": [{"day": "lunedì…domenica", "slot": "colazione|spuntino|pranzo|merenda|cena", "kind": "free|recipe", "name": "nome del pasto in italiano", "query": "...", "kcal": n, "protein": n, "carbs": n, "fat": n}], "eaten": [{"daysAgo": 0, "slot": "colazione|spuntino|pranzo|merenda|cena", "items": [{"name": "alimento", "grams": n, "pieces": n o null, "kcal": n, "protein": n, "carbs": n, "fat": n}]}], "diet": ... o null, "meals": ... o null, "cooking": ... o null, "style": ... o null, "addAllergies": [], "addDislikes": [], "addLikes": [], "removeDislikes": [], "kcalDelta": numero, "warnings": ["..."], "summary": "1-2 frasi in italiano, seconda persona, su cosa cambierai"}`;

  return callAIJson(
    prompt,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const summary = str(r.summary, 400);
      if (!summary) throw new Error('Il dietologo non ha capito la richiesta: prova a riformularla');
      const mealsN = num(r.meals, 3, 5);
      const words = (v: unknown) => strArr(v, 8, 40).map((w) => w.toLowerCase());
      const warnings = strArr(r.warnings, 3, 200);
      let kcalDelta = Math.round(Math.max(-400, Math.min(400, num(r.kcalDelta, -5000, 5000) ?? 0)) / 50) * 50;
      if (warnings.length && kcalDelta < 0) kcalDelta = 0;
      // la correzione totale resta entro ±600 kcal
      kcalDelta = Math.max(-600 - kcalAdjust, Math.min(600 - kcalAdjust, kcalDelta));
      const mealEdits: MealEdit[] = [];
      for (const e of Array.isArray(r.mealEdits) ? r.mealEdits : []) {
        const o = (e ?? {}) as Record<string, unknown>;
        const dayName = str(o.day, 20).toLowerCase().replace('ì', 'i');
        const day = WEEKDAYS_IT.findIndex((w) => w.replace('ì', 'i') === dayName);
        const slot = oneOf(o.slot, MEAL_SLOTS);
        const name = str(o.name, 60);
        if (day < 0 || !slot || !name) continue;
        if (o.kind === 'recipe') {
          mealEdits.push({ day, slot, kind: 'recipe', name, query: str(o.query, 60) || name });
          continue;
        }
        const kcal = num(o.kcal, 50, 3000);
        if (!kcal) continue;
        const p = num(o.protein, 0, 250) ?? Math.round((kcal * 0.15) / 4);
        const f = num(o.fat, 0, 250) ?? Math.round((kcal * 0.35) / 9);
        const c = num(o.carbs, 0, 500) ?? Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
        mealEdits.push({ day, slot, kind: 'free', name, kcal: Math.round(kcal), protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f) });
      }
      const eaten: EatenMeal[] = [];
      for (const e of Array.isArray(r.eaten) ? r.eaten : []) {
        const o = (e ?? {}) as Record<string, unknown>;
        const slot = oneOf(o.slot, MEAL_SLOTS);
        if (!slot) continue;
        const items: EatenMeal['items'] = [];
        for (const it of Array.isArray(o.items) ? o.items.slice(0, 8) : []) {
          const x = (it ?? {}) as Record<string, unknown>;
          const name = str(x.name, 60);
          const grams = num(x.grams, 1, 3000);
          const kcal = num(x.kcal, 0, 3000);
          if (!name || !grams || kcal == null) continue;
          const pieces = num(x.pieces, 0.5, 50);
          items.push({ name, grams: Math.round(grams), ...(pieces ? { pieces } : {}), kcal: Math.round(kcal), protein: num(x.protein, 0, 250) ?? 0, carbs: num(x.carbs, 0, 500) ?? 0, fat: num(x.fat, 0, 250) ?? 0 });
        }
        if (items.length) eaten.push({ daysAgo: Math.round(num(o.daysAgo, 0, 6) ?? 0), slot, items });
      }
      const scope = oneOf(r.scope, ['meals', 'preferences', 'both', 'rebuild'] as const) ?? (mealEdits.length || eaten.length ? 'meals' : 'preferences');
      return {
        scope,
        mealEdits,
        eaten,
        diet: oneOf(r.diet, DIET_VALUES),
        meals: mealsN ? (Math.round(mealsN) as 3 | 4 | 5) : undefined,
        cooking: oneOf(r.cooking, COOKING),
        style: oneOf(r.style, MACRO_STYLES),
        addAllergies: words(r.addAllergies),
        addDislikes: words(r.addDislikes),
        addLikes: words(r.addLikes),
        removeDislikes: words(r.removeDislikes),
        kcalDelta,
        summary,
        warnings,
      };
    },
    { temperature: 0.2, label: 'Il dietologo sta leggendo la tua richiesta…', prefer: 'lite', ...opts },
  );
}

const mergeList = (cur: string, add: string[], remove: string[] = []) => {
  const items = cur
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const drop = (x: string) => remove.some((r) => x.toLowerCase().includes(r) || r.includes(x.toLowerCase()));
  return [...new Set([...items.filter((x) => !drop(x)), ...add])].join(', ');
};

/** Applica le modifiche alle preferenze alimentari. */
export function applyDietChange(prefs: NutritionPrefs, c: DietChange, request: string): NutritionPrefs {
  return {
    ...prefs,
    diet: c.diet ?? prefs.diet,
    meals: c.meals ?? prefs.meals,
    cooking: c.cooking ?? prefs.cooking,
    style: c.style ?? prefs.style,
    allergies: mergeList(prefs.allergies, c.addAllergies),
    dislikes: mergeList(prefs.dislikes, c.addDislikes, [...c.addLikes, ...c.removeDislikes]),
    likes: mergeList(prefs.likes, c.addLikes, c.addDislikes),
    request: request.trim(),
    summary: c.summary,
  };
}

/** Descrizione breve delle modifiche (per l'anteprima). */
export function describeDietChange(c: DietChange): string[] {
  const out: string[] = [];
  if (c.diet) out.push(`Dieta ${c.diet}`);
  if (c.meals) out.push(`${c.meals} pasti al giorno`);
  if (c.cooking) out.push(c.cooking === 'poco' ? 'Ricette veloci (≤30 min)' : c.cooking === 'medio' ? 'Ricette entro 1 ora' : 'Anche ricette lunghe');
  if (c.style) out.push(`Macro: ${MACRO_STYLE_LABEL[c.style].toLowerCase()}`);
  if (c.kcalDelta) out.push(`${c.kcalDelta > 0 ? '+' : ''}${c.kcalDelta} kcal al giorno`);
  for (const a of c.addAllergies) out.push(`🚫 ${a}`);
  for (const d of c.addDislikes) out.push(`✕ ${d}`);
  for (const l of c.addLikes) out.push(`❤ ${l}`);
  for (const r of c.removeDislikes) out.push(`↺ di nuovo ok: ${r}`);
  return out;
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

export function adaptiveCalories(logs: BodyLog[], profile: UserProfile, expectedRate: number | null = null): Adaptive | null {
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
  const expected = expectedRate ?? EXPECTED_RATE[profile.goal] * my;
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
  const last = sessions.slice(0, 5).map(
    (s) =>
      `${new Date(s.date).toLocaleDateString('it-IT')}: ${s.logs.length} esercizi, ${Math.round(sessionTonnage(s))} kg di volume` +
      (s.recap
        ? ` (voto ${s.recap.rating}/5, energia ${s.recap.energy}/5${s.recap.pain.length ? `, dolori: ${s.recap.pain.join(', ')}` : ''}${s.recap.note ? `, nota: "${s.recap.note.slice(0, 120)}"` : ''})`
        : ''),
  );
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
  const prompt = `Sei il coach di HowToGym: personal trainer e nutrizionista sportivo. Rispondi in italiano, in modo pratico e motivante, massimo 150 parole, con elenchi brevi se utile. Basati sulle evidenze scientifiche. Usa la MEMORIA DEL COACH: rispondi in base allo storico di questa persona (dolori segnalati, stalli, giorni saltati, note, dieta) e citalo quando è pertinente. Se la domanda riguarda dolori, patologie, farmaci o disturbi alimentari, dai indicazioni generali e consiglia di rivolgersi a un medico o professionista. Non proporre diete sotto 1200 kcal né pratiche pericolose.
CONTESTO UTENTE:
${context}
${convo ? `CONVERSAZIONE:\n${convo}\n` : ''}Utente: ${question.slice(0, 1000)}
Coach:`;
  const text = await callAI([{ text: prompt }], { temperature: 0.6, label: 'Il coach sta scrivendo…', ...opts });
  return text.trim().slice(0, 2500);
}

/** Analisi completa del coach su tutto lo storico (tab Analisi). */
export async function analyzeAthlete(memory: string, profile: UserProfile, opts: AIOptions = {}): Promise<string> {
  const prompt = `Sei il personal trainer e nutrizionista di questa persona e la segui da tempo. Analizza TUTTO il suo storico qui sotto e scrivi un resoconto personale, concreto, con numeri e nomi di esercizi presi dai dati. Niente consigli generici: ogni frase deve riferirsi a qualcosa che c'è nei dati. In italiano, seconda persona, senza markdown (niente asterischi o #).
Usa ESATTAMENTE queste 4 sezioni, ognuna con il titolo su una riga e 2-4 righe brevi che iniziano con "• ":
✅ COSA STA ANDANDO BENE
⚠️ COSA MIGLIORARE
🩹 DOLORI E RECUPERO (se non ci sono fastidi segnalati scrivi che è tutto ok e come prevenirli)
🎯 3 AZIONI PER LA PROSSIMA SETTIMANA
Se ci sono pochi dati dillo in una riga e dai comunque indicazioni sulla base di quelli disponibili.
Profilo: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}.
STORICO:
${memory}`;
  const text = await callAI([{ text: prompt }], { temperature: 0.4, label: 'Il coach analizza il tuo storico…', ...opts });
  const clean = text.replace(/[*#`]/g, '').trim();
  if (clean.length < 80) throw new Error('Analisi troppo breve, riprova');
  return clean.slice(0, 3000);
}
