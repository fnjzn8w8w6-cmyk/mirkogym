import type { Nutrition } from './metabolism';
import type { UserRecipe } from '@/types';

/**
 * Ricettario italiano (dispensa-dati: ricette originali FrigoDispensa + Wikibooks "Libro di cucina",
 * CC BY-SA 4.0) con calorie e macro per porzione calcolati dagli ingredienti (USDA FoodData Central),
 * foto verificate da Wikimedia Commons, più le ricette create dall'utente.
 * Il piano settimanale è calcolato dall'app (nessuna quota AI).
 */

export interface Recipe {
  id: string;
  /** titolo */
  t: string;
  cat: string;
  /** pasto del piano: colazione, piatto principale (pranzo/cena), spuntino; null = solo galleria */
  slot: 'colazione' | 'main' | 'spuntino' | null;
  min: number;
  df: number;
  sv: number;
  d: string[];
  tg: string[];
  /** kcal, proteine, carboidrati, grassi per porzione (null = non calcolabili con affidabilità) */
  k: [number, number, number, number] | null;
  /** [nome, quantità, id alimento, grammi totali] */
  i: [string, string, string | null, number | null][];
  st: string[];
  src: [string, string] | null;
  /** [file, autore, licenza, pagina sorgente] */
  ph: [string, string, string, string] | null;
  /** foto dell'utente (data URL) */
  photo?: string;
  user?: boolean;
}

export interface RecipeData {
  license: string;
  attribution: string;
  foods: Record<string, string>;
  recipes: Recipe[];
}

let cache: Promise<RecipeData> | null = null;
export function loadRecipes(): Promise<RecipeData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}ricette.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Ricette non disponibili');
      return r.json() as Promise<RecipeData>;
    })
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

/* ---------- Ricette dell'utente ---------- */

const USER_SLOT: Record<UserRecipe['kind'], Recipe['slot']> = { colazione: 'colazione', spuntino: 'spuntino', principale: 'main' };

export function userRecipeMacros(u: Pick<UserRecipe, 'ingredients' | 'servings'>): [number, number, number, number] {
  const sv = Math.max(1, u.servings || 1);
  const t = u.ingredients.reduce(
    (a, i) => {
      const k = i.grams / 100;
      return [a[0] + i.per100.kcal * k, a[1] + i.per100.protein * k, a[2] + i.per100.carbs * k, a[3] + i.per100.fat * k];
    },
    [0, 0, 0, 0],
  );
  return [Math.round(t[0] / sv), Math.round(t[1] / sv), Math.round(t[2] / sv), Math.round(t[3] / sv)];
}

export function userToRecipe(u: UserRecipe): Recipe {
  const k = userRecipeMacros(u);
  return {
    id: `u:${u.id}`,
    t: u.name,
    cat: 'mie',
    slot: USER_SLOT[u.kind],
    min: u.minutes ?? 0,
    df: 1,
    sv: Math.max(1, u.servings || 1),
    d: [],
    tg: [],
    k: k[0] > 0 ? k : null,
    i: u.ingredients.map((i) => [i.name, `${i.grams} g`, i.foodId, i.grams]),
    st: u.steps
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean),
    src: null,
    ph: null,
    photo: u.photo,
    user: true,
  };
}

/** Ricettario + ricette dell'utente (queste per prime). */
export function withUserRecipes(data: RecipeData, user: UserRecipe[]): RecipeData {
  return { ...data, recipes: [...user.map(userToRecipe), ...data.recipes] };
}

export const photoUrl = (r: Recipe): string | null => r.photo ?? (r.ph ? `${import.meta.env.BASE_URL}${r.ph[0]}` : null);

export const CATEGORY_IT: Record<string, string> = {
  mie: 'Le mie ricette',
  colazione: 'Colazioni',
  primi: 'Primi',
  secondi: 'Secondi',
  'piatti-unici': 'Piatti unici',
  zuppe: 'Zuppe e minestre',
  antipasti: 'Antipasti',
  contorni: 'Contorni',
  salse: 'Salse e sughi',
  dolci: 'Dolci',
};
export const CATEGORY_EMOJI: Record<string, string> = {
  mie: '⭐',
  colazione: '🥐',
  primi: '🍝',
  secondi: '🍗',
  'piatti-unici': '🥘',
  zuppe: '🥣',
  antipasti: '🧀',
  contorni: '🥗',
  salse: '🫙',
  dolci: '🍰',
};

/* ---------- Allergie e gusti (parole in italiano sugli ingredienti) ---------- */

const GLUTEN = /farin|pane|pan |pasta|spaghett|penne|fusill|rigaton|maccheron|bucatin|linguin|tagliatell|lasagn|gnocch|pangrattat|biscott|savoiard|amarett|couscous|cuscus|orzo|farro|semol|crackers|grissin|fette biscottate|piadin|sfoglia|brisee|brisée|frolla|birra|seitan|bulgur|tortellin|ravioli/i;
const ALLERGENS: [RegExp, RegExp][] = [
  [/lattosio|latte|latticin|formagg/i, /latte|formagg|burro|panna|yogurt|parmigian|grana|pecorino|mozzarell|ricotta|mascarpone|besciamella|scamorza|provol|fontina|stracchino|gorgonzola|caciocavallo|taleggio|asiago|emmental|feta|sottilette|crescenza|squacquerone|fiocchi di latte|castelmagno|raschera|montasio|toma\b/i],
  [/glutine|celiac/i, GLUTEN],
  [/uov/i, /uov|tuorl|album|maionese|chiar[ae] d/i],
  [/frutta secca|noci|nocciol|mandorl|pistacch|anacard|pinol/i, /\bnoci\b|gherigl|nocciol|mandorl|pistacch|anacard|pinoli|amarett|nutella/i],
  [/arachid/i, /arachid|noccioline/i],
  [/pesce/i, /pesce|salmone|tonno|merluzz|baccal|acciug|alici|sardin|sarde|sgombr|orata|branzin|spigola|trota|stoccafiss|nasello|cefal|pescespada|coda di rospo/i],
  [/crostace|frutti di mare|mollusch|gamber/i, /gamber|scampi|mazzancoll|cozze|vongol|calamar|seppi|polpo|moscardin|aragost|granchi|ostric|canestrell|telline/i],
  [/soia/i, /soia|tofu|tempeh|edamame|shoyu|tamari|miso/i],
  [/sesamo/i, /sesamo|tahin/i],
  [/maiale|suin/i, /maiale|pancetta|guanciale|salsicc|salame|salamin|prosciutt|speck|mortadella|lardo|strutto|sugna|wurstel|lonza|arista|cotechino|nduja|zampone/i],
  [/manzo|carne rossa|vitello/i, /manzo|vitell|bovin|\bbue\b|macinat|bresaola|brasato|spezzatino/i],
  [/pollo/i, /pollo/i],
  [/piccant/i, /peperoncin|nduja|piccant/i],
  [/cipoll/i, /cipoll|scalogn|porri|porro|cipollott/i],
  [/aglio/i, /aglio/i],
  [/funghi/i, /funghi|porcin|champignon|chiodini/i],
];

/** Parole da escludere: allergie e cibi non graditi, tradotti in pattern sugli ingredienti italiani. */
export function exclusionPatterns(text: string): RegExp[] {
  const words = text
    .toLowerCase()
    .split(/[,;/\n]| e /)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
  const out: RegExp[] = [];
  for (const w of words) {
    const hit = ALLERGENS.find(([it]) => it.test(w));
    if (hit) out.push(hit[1]);
    else out.push(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[aeio]$/, '[aeio]'), 'i'));
  }
  return out;
}

/* ---------- Alimenti per pasti semplici e integrazioni (valori per 100 g, USDA) ---------- */

type Per100 = [p: number, c: number, f: number];
const FOODS: Record<string, { per100: Per100; tags: ('vegan' | 'vegetarian' | 'pescatarian')[] }> = {
  'Yogurt greco 0%': { per100: [10.3, 3.6, 0.4], tags: ['vegetarian'] },
  "Fiocchi d'avena": { per100: [13.2, 67.7, 6.5], tags: ['vegan'] },
  'Frutti di bosco': { per100: [0.7, 14.5, 0.3], tags: ['vegan'] },
  Miele: { per100: [0.3, 82.4, 0], tags: ['vegetarian'] },
  'Pane integrale': { per100: [12.5, 43.1, 3.5], tags: ['vegan'] },
  'Uovo intero': { per100: [12.6, 0.7, 9.5], tags: ['vegetarian'] },
  'Latte parzialmente scremato': { per100: [3.3, 4.8, 2], tags: ['vegetarian'] },
  'Ricotta vaccina': { per100: [11.3, 3, 13], tags: ['vegetarian'] },
  Banana: { per100: [1.1, 22.8, 0.3], tags: ['vegan'] },
  "Burro d'arachidi": { per100: [22.2, 22.3, 51.4], tags: ['vegan'] },
  Mandorle: { per100: [21.2, 21.6, 49.9], tags: ['vegan'] },
  Bresaola: { per100: [29.1, 2.8, 5.4], tags: [] },
  Crackers: { per100: [9.2, 61.3, 22.7], tags: ['vegan'] },
  Hummus: { per100: [7.9, 14.3, 9.6], tags: ['vegan'] },
  Carote: { per100: [0.9, 9.6, 0.2], tags: ['vegan'] },
  'Proteine whey': { per100: [78, 8, 6], tags: ['vegetarian'] },
  Mela: { per100: [0.3, 13.8, 0.2], tags: ['vegan'] },
  'Fette biscottate': { per100: [13.5, 72.3, 7.2], tags: ['vegan'] },
  Marmellata: { per100: [0.4, 68.9, 0.1], tags: ['vegan'] },
  Tofu: { per100: [15.8, 1.9, 8.7], tags: ['vegan'] },
  'Latte di soia': { per100: [3.3, 3.5, 2], tags: ['vegan'] },
  Pomodori: { per100: [0.9, 3.9, 0.2], tags: ['vegan'] },
  Kiwi: { per100: [1.1, 14.7, 0.5], tags: ['vegan'] },
  'Parmigiano Reggiano': { per100: [35.8, 3.2, 25.8], tags: ['vegetarian'] },
  'Petto di pollo': { per100: [22.5, 0, 2.6], tags: [] },
  'Tonno al naturale': { per100: [19.4, 0, 1], tags: ['pescatarian'] },
  Albume: { per100: [10.9, 0.7, 0.2], tags: ['vegetarian'] },
  'Riso bianco (crudo)': { per100: [6.6, 80, 0.6], tags: ['vegan'] },
  "Olio extravergine d'oliva": { per100: [0, 0, 100], tags: ['vegan'] },
  'Verdure miste': { per100: [3.3, 13.5, 0.5], tags: ['vegan'] },
};

export interface FoodPortion {
  food: string;
  grams: number;
  protein: number;
  carbs: number;
  fat: number;
  kcal: number;
}

export function portion(food: string, grams: number): FoodPortion {
  const [p, c, f] = FOODS[food]?.per100 ?? [0, 0, 0];
  const k = grams / 100;
  return { food, grams, protein: Math.round(p * k), carbs: Math.round(c * k), fat: Math.round(f * k), kcal: Math.round(p * k * 4 + c * k * 4 + f * k * 9) };
}
/** Valori per 100 g di un alimento dei pasti semplici (per il diario). */
export const simpleFoodPer100 = (food: string) => {
  const [p, c, f] = FOODS[food]?.per100 ?? [0, 0, 0];
  return { kcal: Math.round(p * 4 + c * 4 + f * 9), protein: p, carbs: c, fat: f };
};

export interface SimpleMeal {
  id: string;
  name: string;
  emoji: string;
  slot: 'breakfast' | 'snack';
  items: [string, number][];
  prep: string;
}

export const SIMPLE_MEALS: SimpleMeal[] = [
  { id: 's-yogurt-avena', name: 'Yogurt greco, avena e frutti di bosco', emoji: '🥣', slot: 'breakfast', items: [['Yogurt greco 0%', 200], ["Fiocchi d'avena", 50], ['Frutti di bosco', 100], ['Miele', 10]], prep: 'Mescola yogurt e avena, aggiungi frutti di bosco e miele.' },
  { id: 's-uova-pane', name: 'Uova strapazzate e pane integrale', emoji: '🍳', slot: 'breakfast', items: [['Uovo intero', 110], ['Pane integrale', 70], ['Kiwi', 100]], prep: 'Strapazza 2 uova in padella antiaderente, servi con il pane tostato e un kiwi.' },
  { id: 's-porridge', name: 'Porridge proteico alla banana', emoji: '🥛', slot: 'breakfast', items: [["Fiocchi d'avena", 60], ['Latte parzialmente scremato', 250], ['Proteine whey', 20], ['Banana', 100]], prep: "Cuoci l'avena nel latte 4 minuti, fuori dal fuoco aggiungi le proteine e la banana a fette." },
  { id: 's-toast-ricotta', name: 'Toast con ricotta e miele', emoji: '🍞', slot: 'breakfast', items: [['Pane integrale', 80], ['Ricotta vaccina', 100], ['Miele', 15], ['Mela', 150]], prep: 'Tosta il pane, spalma la ricotta e completa con un filo di miele. Mela a parte.' },
  { id: 's-fette-latte', name: 'Fette biscottate, marmellata e yogurt', emoji: '☕', slot: 'breakfast', items: [['Fette biscottate', 40], ['Marmellata', 25], ['Yogurt greco 0%', 170], ['Latte parzialmente scremato', 150]], prep: 'Fette con marmellata, yogurt greco e un caffè macchiato.' },
  { id: 's-porridge-vegan', name: 'Porridge vegano con burro di arachidi', emoji: '🥜', slot: 'breakfast', items: [["Fiocchi d'avena", 60], ['Latte di soia', 250], ["Burro d'arachidi", 15], ['Banana', 100]], prep: "Cuoci l'avena nel latte di soia, completa con burro d'arachidi e banana." },
  { id: 's-tofu-strapazzato', name: 'Tofu strapazzato su pane', emoji: '🌱', slot: 'breakfast', items: [['Tofu', 150], ['Pane integrale', 70], ['Pomodori', 100]], prep: 'Sbriciola il tofu in padella con curcuma e sale, servi sul pane con i pomodori.' },
  { id: 's-yogurt-frutta', name: 'Yogurt greco e mela', emoji: '🍎', slot: 'snack', items: [['Yogurt greco 0%', 170], ['Mela', 150]], prep: '' },
  { id: 's-mandorle-banana', name: 'Mandorle e banana', emoji: '🍌', slot: 'snack', items: [['Mandorle', 25], ['Banana', 100]], prep: '' },
  { id: 's-cracker-bresaola', name: 'Crackers e bresaola', emoji: '🥩', slot: 'snack', items: [['Crackers', 30], ['Bresaola', 60]], prep: '' },
  { id: 's-hummus-carote', name: 'Hummus e carote', emoji: '🥕', slot: 'snack', items: [['Hummus', 80], ['Carote', 150]], prep: '' },
  { id: 's-shake', name: 'Shake proteico e banana', emoji: '🥤', slot: 'snack', items: [['Proteine whey', 30], ['Banana', 120]], prep: 'Proteine in 300 ml di acqua o latte.' },
  { id: 's-pane-arachidi', name: "Pane e burro d'arachidi", emoji: '🥪', slot: 'snack', items: [['Pane integrale', 50], ["Burro d'arachidi", 20]], prep: '' },
  { id: 's-parmigiano-mela', name: 'Parmigiano e mela', emoji: '🧀', slot: 'snack', items: [['Parmigiano Reggiano', 30], ['Mela', 150]], prep: '' },
];

/* ---------- Dieta ---------- */

export type DietKey = 'onnivora' | 'vegetariana' | 'vegana' | 'pescetariana';

function recipeAllowed(r: Recipe, diet: DietKey): boolean {
  if (r.user || diet === 'onnivora') return true;
  if (diet === 'vegana') return r.d.includes('vegan');
  if (diet === 'vegetariana') return r.d.includes('vegetarian');
  return r.d.includes('pescatarian');
}
function foodAllowed(food: string, diet: DietKey): boolean {
  const tags = FOODS[food]?.tags ?? [];
  if (diet === 'onnivora') return true;
  if (diet === 'vegana') return tags.includes('vegan');
  if (diet === 'vegetariana') return tags.includes('vegan') || tags.includes('vegetarian');
  return tags.length > 0;
}
const recipeText = (r: Recipe) => `${r.t} ${r.i.map((x) => x[0]).join(' ')}`;
const simpleText = (m: SimpleMeal) => m.items.map(([f]) => f).join(' ');

/* ---------- Piano settimanale ---------- */

export type SlotKey = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena';
export const SLOT_LABEL: Record<SlotKey, string> = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  pranzo: 'Pranzo',
  merenda: 'Merenda',
  cena: 'Cena',
};

/** Ripartizione delle calorie nei pasti. */
const SPLITS: Record<number, [SlotKey, number][]> = {
  3: [['colazione', 0.25], ['pranzo', 0.4], ['cena', 0.35]],
  4: [['colazione', 0.25], ['pranzo', 0.35], ['merenda', 0.1], ['cena', 0.3]],
  5: [['colazione', 0.2], ['spuntino', 0.1], ['pranzo', 0.3], ['merenda', 0.1], ['cena', 0.3]],
};

/** Calorie previste per un pasto in base al numero di pasti e all'obiettivo giornaliero. */
export function slotKcal(meals: number, slot: SlotKey, target: number): number {
  const share = (SPLITS[meals] ?? SPLITS[4]).find(([s]) => s === slot)?.[1] ?? 0.25;
  return target * share;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PlannedMeal {
  slot: SlotKey;
  /** recipe = ricetta, simple = pasto semplice, custom = pasto libero scelto dall'utente (es. pizza fuori) */
  kind: 'recipe' | 'simple' | 'custom';
  /** nome e valori fissi del pasto libero */
  name?: string;
  fixed?: Macros;
  refId: string;
  /** porzioni della ricetta (kind=recipe) */
  servings: number;
  /** alimenti già porzionati (kind=simple) */
  items: FoodPortion[];
  /** integrazioni aggiunte dall'app per centrare i macro (contorno, pane, proteine) */
  extras: FoodPortion[];
  macros: Macros;
}

export interface WeekPlan {
  createdAt: number;
  seed: number;
  targetKcal: number;
  /** 'nutrizionista' = dieta importata: porzioni fisse, niente ricalcolo automatico */
  source?: 'nutrizionista';
  /** 7 giorni (lunedì → domenica). Oggetti e non array annidati: Firestore non li supporta. */
  days: { meals: PlannedMeal[] }[];
}

const sumMacros = (list: Macros[]): Macros =>
  list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
const portionMacros = (p: FoodPortion): Macros => ({ kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat });

export const dayTotals = (day: PlannedMeal[]): Macros => sumMacros(day.map((m) => m.macros));

const K = (r: Recipe) => r.k ?? [0, 0, 0, 0];

function recipeMacros(r: Recipe | undefined, servings: number): Macros {
  if (!r) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const k = K(r);
  return { kcal: Math.round(k[0] * servings), protein: Math.round(k[1] * servings), carbs: Math.round(k[2] * servings), fat: Math.round(k[3] * servings) };
}

function withMacros(m: Omit<PlannedMeal, 'macros'>, recipes: Map<string, Recipe>): PlannedMeal {
  const base =
    m.kind === 'custom'
      ? (m.fixed ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 })
      : m.kind === 'recipe'
        ? recipeMacros(recipes.get(m.refId), m.servings)
        : sumMacros(m.items.map(portionMacros));
  return { ...m, macros: sumMacros([base, ...m.extras.map(portionMacros)]) };
}

/** Porzione della ricetta per avvicinarsi alle calorie del pasto (a passi di ¼). */
const servingsFor = (r: Recipe, kcal: number) => Math.min(2.5, Math.max(0.5, Math.round((kcal / (K(r)[0] || kcal)) * 4) / 4));

function simpleFor(m: SimpleMeal, kcal: number): FoodPortion[] {
  const base = m.items.map(([f, g]) => portion(f, g));
  const tot = base.reduce((a, p) => a + p.kcal, 0) || 1;
  const f = Math.min(1.8, Math.max(0.6, kcal / tot));
  return m.items.map(([food, g]) => portion(food, Math.max(5, Math.round((g * f) / 5) * 5)));
}

/** Contorno di verdure per i secondi piatti (il pane lo aggiunge il bilanciamento se servono calorie). */
const sideFor = (r: Recipe | undefined): FoodPortion[] => (r?.cat === 'secondi' ? [portion('Verdure miste', 200)] : []);

/** Generatore pseudo-casuale riproducibile (per rigenerare piani diversi). */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export interface PlanPrefs {
  diet: DietKey;
  meals: 3 | 4 | 5;
  allergies: string;
  dislikes: string;
  cooking: 'poco' | 'medio' | 'molto';
  favorites: string[];
  /** Cibi amati: le ricette che li contengono sono preferite. */
  likes?: string;
}

const glutenFree = (prefs: PlanPrefs) => /glutine|celiac/i.test(prefs.allergies);

export function mealCandidates(data: RecipeData, prefs: PlanPrefs, slot: SlotKey) {
  const excl = exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`);
  const ok = (text: string) => !excl.some((re) => re.test(text));
  const maxTime = prefs.cooking === 'poco' ? 30 : prefs.cooking === 'medio' ? 60 : 999;
  const isMain = slot === 'pranzo' || slot === 'cena';
  const want: Recipe['slot'] = isMain ? 'main' : slot === 'colazione' ? 'colazione' : 'spuntino';
  const gf = glutenFree(prefs);
  const base = data.recipes.filter(
    (r) =>
      r.k &&
      r.slot === want &&
      recipeAllowed(r, prefs.diet) &&
      ok(recipeText(r)) &&
      (!gf || r.d.includes('gluten-free') || (r.user && !GLUTEN.test(recipeText(r)))),
  );
  const quick = base.filter((r) => r.user || r.min <= (isMain ? maxTime : Math.min(maxTime, 30)));
  // Con diete molto restrittive si allarga il limite di tempo per garantire varietà
  const recipes = quick.length >= 10 ? quick : base;
  const simple = isMain
    ? []
    : SIMPLE_MEALS.filter(
        (m) =>
          m.slot === (slot === 'colazione' ? 'breakfast' : 'snack') &&
          m.items.every(([f]) => foodAllowed(f, prefs.diet)) &&
          ok(simpleText(m)) &&
          (!gf || !GLUTEN.test(simpleText(m))),
      );
  return { recipes, simple };
}

/** Crea un piano di 7 giorni vario, calibrato su calorie e macro. */
export function planWeek(data: RecipeData, target: Nutrition, prefs: PlanPrefs, seed = Date.now()): WeekPlan {
  const rand = rng(seed);
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const split = SPLITS[prefs.meals] ?? SPLITS[4];
  const excl = exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`);
  const usedCount = new Map<string, number>();
  const usedOn = new Map<string, number>();
  const lastSimple = new Map<SlotKey, string>();
  const simpleCount = new Map<string, number>();
  const proteinShare = (target.protein * 4) / target.target;
  const carbShare = (target.carbs * 4) / target.target;
  const fatShare = (target.fat * 9) / target.target;
  // Vicinanza dei macro della ricetta (con l'eventuale contorno) a quelli dell'obiettivo
  const macroFit = (r: Recipe) => {
    const [, p, c, f] = K(r);
    const side = r.cat === 'secondi' ? [6.6, 27, 1] : [0, 0, 0];
    const kc = (p + side[0]) * 4 + (c + side[1]) * 4 + (f + side[2]) * 9 || 1;
    const dist =
      Math.abs(((p + side[0]) * 4) / kc - proteinShare) + Math.abs(((c + side[1]) * 4) / kc - carbShare) + Math.abs(((f + side[2]) * 9) / kc - fatShare);
    return Math.max(0, 1 - dist * 1.5);
  };
  const likes = prefs.likes ? exclusionPatterns(prefs.likes) : [];
  const liked = (text: string) => (likes.some((re) => re.test(text)) ? 0.8 : 0);

  const pick = <T,>(list: T[], score: (x: T) => number): T | undefined =>
    [...list].map((x) => ({ x, s: score(x) + rand() * 0.6 })).sort((a, b) => b.s - a.s)[0]?.x;

  const days: { meals: PlannedMeal[] }[] = [];
  for (let d = 0; d < 7; d++) {
    const day: PlannedMeal[] = [];
    for (const [slot, share] of split) {
      const kcal = target.target * share;
      const cands = mealCandidates(data, prefs, slot);
      const isMain = slot === 'pranzo' || slot === 'cena';
      const { simple } = cands;
      // colazione e spuntini: solo ricette con una porzione realistica (niente 2,5 porzioni di dolce)
      const recipes = isMain ? cands.recipes : cands.recipes.filter((r) => servingsFor(r, kcal) <= 1.5);
      // Colazioni/spuntini: soprattutto pasti semplici, ogni tanto una ricetta (più spesso se è tua)
      const simpleFresh = simple.filter((x) => x.id !== lastSimple.get(slot));
      const hasUser = recipes.some((r) => r.user);
      const useSimple = !isMain && simple.length > 0 && (recipes.length === 0 || (simpleFresh.length > 0 && rand() < (hasUser ? 0.5 : 0.7)));
      if (useSimple) {
        const m =
          pick(simpleFresh, (x) => (prefs.favorites.includes(x.id) ? 1 : 0) + liked(simpleText(x)) - (simpleCount.get(x.id) ?? 0) * 0.5) ?? simple[0];
        lastSimple.set(slot, m.id);
        simpleCount.set(m.id, (simpleCount.get(m.id) ?? 0) + 1);
        day.push(withMacros({ slot, kind: 'simple', refId: m.id, servings: 1, items: simpleFor(m, kcal), extras: [] }, byId));
        continue;
      }
      // Varietà: prima le ricette mai usate, poi le meno usate, mai lo stesso giorno o quello prima
      const fresh = recipes.filter((r) => (usedOn.get(r.id) ?? -9) < d - 1);
      const minUse = Math.min(...fresh.map((r) => usedCount.get(r.id) ?? 0));
      const pool = fresh.filter((r) => (usedCount.get(r.id) ?? 0) === minUse);
      const r = pick(pool.length ? pool : recipes, (x) => {
        const sv = servingsFor(x, kcal);
        return (
          (prefs.favorites.includes(x.id) ? 1.5 : 0) +
          (x.user ? 1.2 : 0) +
          liked(recipeText(x)) +
          macroFit(x) * 1.6 +
          (x.ph || x.photo ? 0.3 : 0) -
          // porzioni realistiche: penalizza ricette troppo leggere o troppo pesanti per il pasto
          (Math.abs(sv * K(x)[0] - kcal) / kcal) * 2 -
          (sv >= 2.25 ? 0.4 : 0)
        );
      });
      if (!r) continue;
      usedCount.set(r.id, (usedCount.get(r.id) ?? 0) + 1);
      usedOn.set(r.id, d);
      day.push(withMacros({ slot, kind: 'recipe', refId: r.id, servings: servingsFor(r, kcal), items: [], extras: [] }, byId));
    }
    days.push({ meals: balanceDay(day, target, prefs.diet, excl, byId) });
  }
  return { createdAt: Date.now(), seed, targetKcal: target.target, days };
}

/** Aggiunge contorno, integrazioni per proteine/calorie mancanti o riduce le porzioni in eccesso. */
function balanceDay(day: PlannedMeal[], target: Nutrition, diet: DietKey, excl: RegExp[], byId: Map<string, Recipe>): PlannedMeal[] {
  let meals = day.map((m) => ({ ...m, extras: m.kind === 'recipe' ? sideFor(byId.get(m.refId)) : ([] as FoodPortion[]) }));
  const recompute = () => (meals = meals.map((m) => withMacros(m, byId)));
  recompute();
  const allowed = (food: string) => foodAllowed(food, diet) && !excl.some((re) => re.test(food));

  // 1) proteine mancanti → integrazione proteica sul pasto più povero di proteine
  let tot = dayTotals(meals);
  const usedSources = new Set<string>();
  for (let round = 0; round < 2; round++) {
    tot = dayTotals(meals);
    const gap = target.protein - tot.protein;
    if (gap <= 12) break;
    const source = ['Yogurt greco 0%', 'Petto di pollo', 'Tonno al naturale', 'Tofu', 'Albume', 'Proteine whey'].find((f) => allowed(f) && !usedSources.has(f));
    if (!source) break;
    usedSources.add(source);
    const [p] = FOODS[source].per100;
    const maxG = source === 'Proteine whey' ? 40 : source === 'Yogurt greco 0%' ? 300 : 200;
    const grams = Math.min(maxG, Math.round(((gap / p) * 100) / 10) * 10);
    const cands = meals.map((_, i) => i).filter((i) => meals[i].slot !== 'colazione' && meals[i].kind !== 'custom');
    if (!cands.length) break;
    const idx = cands.reduce((best, i) => (meals[i].macros.protein < meals[best].macros.protein ? i : best), cands[cands.length - 1]);
    meals[idx] = { ...meals[idx], extras: [...meals[idx].extras, portion(source, grams)] };
    recompute();
  }
  // 2) calorie basse → pane integrale (o riso, banana) al pranzo
  tot = dayTotals(meals);
  const kcalGap = target.target - tot.kcal;
  if (kcalGap > target.target * 0.07) {
    const source = ['Pane integrale', 'Riso bianco (crudo)', 'Banana'].find(allowed);
    if (source) {
      const [p, c, f] = FOODS[source].per100;
      const per100 = p * 4 + c * 4 + f * 9;
      const grams = Math.min(150, Math.round(((kcalGap / per100) * 100) / 10) * 10);
      const lunch = meals.findIndex((m) => m.slot === 'pranzo' && m.kind !== 'custom');
      const idx = lunch >= 0 ? lunch : meals.findIndex((m) => m.kind !== 'custom');
      if (idx >= 0) meals[idx] = { ...meals[idx], extras: [...meals[idx].extras, portion(source, grams)] };
      recompute();
    }
  }
  // 3) calorie alte → riduci di ¼ la porzione della ricetta più abbondante
  for (let guard = 0; guard < 6; guard++) {
    tot = dayTotals(meals);
    if (tot.kcal <= target.target * 1.07) break;
    const idx = meals.reduce((b, m, i) => (m.kind === 'recipe' && m.servings > 0.5 && m.macros.kcal > (meals[b]?.macros.kcal ?? 0) ? i : b), -1);
    if (idx < 0) break;
    meals[idx] = { ...meals[idx], servings: meals[idx].servings - 0.25 };
    recompute();
  }
  return meals;
}

function buildMeal(slot: SlotKey, choice: { kind: 'recipe' | 'simple'; id: string }, kcal: number, byId: Map<string, Recipe>): PlannedMeal | null {
  if (choice.kind === 'recipe') {
    const r = byId.get(choice.id);
    if (!r?.k) return null;
    return withMacros({ slot, kind: 'recipe', refId: r.id, servings: servingsFor(r, kcal), items: [], extras: [] }, byId);
  }
  const m = SIMPLE_MEALS.find((x) => x.id === choice.id);
  if (!m) return null;
  return withMacros({ slot, kind: 'simple', refId: m.id, servings: 1, items: simpleFor(m, kcal), extras: [] }, byId);
}

/** Sostituisce un pasto del piano con una ricetta o un pasto semplice e ribilancia la giornata. */
export function replaceMeal(
  plan: WeekPlan,
  dayIdx: number,
  mealIdx: number,
  choice: { kind: 'recipe' | 'simple'; id: string },
  data: RecipeData,
  target: Nutrition,
  prefs: PlanPrefs,
): WeekPlan {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const old = plan.days[dayIdx]?.meals[mealIdx];
  if (!old) return plan;
  const next = buildMeal(old.slot, choice, slotKcal(prefs.meals, old.slot, target.target), byId);
  if (!next) return plan;
  const excl = exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`);
  const day = plan.days[dayIdx].meals.map((m, j) => (j === mealIdx ? next : m));
  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? { meals: balanceDay(day, target, prefs.diet, excl, byId) } : d)) };
}

/** Ricalcola porzioni e integrazioni con un nuovo obiettivo calorico, mantenendo le stesse ricette. */
export function rescalePlan(plan: WeekPlan, data: RecipeData, target: Nutrition, prefs: PlanPrefs): WeekPlan {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const excl = exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`);
  const days = plan.days.map((day) => ({
    meals: balanceDay(
      day.meals.map((m) => (m.kind === 'custom' ? m : (buildMeal(m.slot, { kind: m.kind, id: m.refId }, slotKcal(prefs.meals, m.slot, target.target), byId) ?? m))),
      target,
      prefs.diet,
      excl,
      byId,
    ),
  }));
  return { ...plan, targetKcal: target.target, days };
}

/** Dettaglio del pasto per la UI. */
export function mealInfo(m: PlannedMeal, byId: Map<string, Recipe>): { name: string; recipe?: Recipe; simple?: SimpleMeal } {
  if (m.kind === 'custom') return { name: m.name ?? 'Pasto libero' };
  if (m.kind === 'recipe') {
    const r = byId.get(m.refId);
    return { name: r ? r.t : 'Ricetta non più disponibile', recipe: r };
  }
  const sm = SIMPLE_MEALS.find((x) => x.id === m.refId);
  return { name: sm?.name ?? 'Pasto', simple: sm };
}

/* ---------- Modifiche mirate (coach) ---------- */

/** Pasto del giorno corrispondente a uno slot richiesto (merenda/spuntino si equivalgono). */
function mealIndexFor(day: PlannedMeal[], slot: SlotKey): number {
  const exact = day.findIndex((m) => m.slot === slot);
  if (exact >= 0) return exact;
  const snack = (s: SlotKey) => s === 'merenda' || s === 'spuntino';
  if (snack(slot)) return day.findIndex((m) => snack(m.slot));
  return -1;
}

/** Ricalcola le porzioni degli altri pasti del giorno intorno ai pasti liberi (che restano fissi). */
function rebalanceAround(day: PlannedMeal[], data: RecipeData, target: Nutrition, prefs: PlanPrefs): PlannedMeal[] {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const fixed = day.filter((m) => m.kind === 'custom').reduce((a, m) => a + (m.fixed?.kcal ?? 0), 0);
  const others = day.filter((m) => m.kind !== 'custom');
  const shares = others.reduce((a, m) => a + slotKcal(prefs.meals, m.slot, 1), 0) || 1;
  const remaining = Math.max(others.length * 150, target.target - fixed);
  const rebuilt = day.map((m) =>
    m.kind === 'custom'
      ? m
      : (buildMeal(m.slot, { kind: m.kind, id: m.refId }, (remaining * slotKcal(prefs.meals, m.slot, 1)) / shares, byId) ?? m),
  );
  return balanceDay(rebuilt, target, prefs.diet, exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`), byId);
}

/** Mette un pasto libero (es. pizza fuori) in un giorno e ribilancia SOLO quel giorno. */
export function setCustomMeal(
  plan: WeekPlan,
  dayIdx: number,
  slot: SlotKey,
  name: string,
  fixed: Macros,
  data: RecipeData,
  target: Nutrition,
  prefs: PlanPrefs,
): WeekPlan {
  const day = plan.days[dayIdx]?.meals;
  if (!day) return plan;
  let idx = mealIndexFor(day, slot);
  const custom: PlannedMeal = { slot, kind: 'custom', refId: `custom:${Date.now().toString(36)}`, servings: 1, items: [], extras: [], name, fixed, macros: fixed };
  const next = [...day];
  if (idx < 0) {
    // pasto non previsto quel giorno (es. uno spuntino in più): lo aggiungo
    next.push(custom);
    idx = next.length - 1;
  } else next[idx] = { ...custom, slot: day[idx].slot };
  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? { meals: rebalanceAround(next, data, target, prefs) } : d)) };
}

/** Sceglie una ricetta del catalogo per un pasto in base a parole chiave (es. "pollo", "pesce leggero"). */
export function recipeForQuery(data: RecipeData, prefs: PlanPrefs, slot: SlotKey, query: string, avoid: string[] = []): Recipe | null {
  const words = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 2 && !['con', 'una', 'qualcosa', 'piatto', 'ricetta', 'del', 'della', 'alla', 'allo'].includes(w));
  const { recipes } = mealCandidates(data, prefs, slot);
  const scored = recipes
    .filter((r) => !avoid.includes(r.id))
    .map((r) => {
      const text = recipeText(r).toLowerCase();
      const hits = words.filter((w) => text.includes(w.replace(/[aeio]$/, ''))).length;
      return { r, s: hits * 2 + (r.t.toLowerCase().includes(words[0] ?? '#') ? 1 : 0) + Math.random() * 0.3 };
    })
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s);
  return scored[0]?.r ?? null;
}

/** Mette una ricetta scelta in un pasto e ribilancia solo quel giorno. */
export function setRecipeMeal(plan: WeekPlan, dayIdx: number, slot: SlotKey, recipeId: string, data: RecipeData, target: Nutrition, prefs: PlanPrefs): WeekPlan {
  const day = plan.days[dayIdx]?.meals;
  if (!day) return plan;
  const idx = mealIndexFor(day, slot);
  if (idx < 0) return plan;
  const next = day.map((m, i) => (i === idx ? { ...m, kind: 'recipe' as const, refId: recipeId, name: undefined, fixed: undefined, items: [] } : m));
  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? { meals: rebalanceAround(next, data, target, prefs) } : d)) };
}

/**
 * Adatta il piano a nuove preferenze cambiando SOLO i pasti che non le rispettano più
 * (dieta, allergie, cibi sgraditi, tempo); poi ricalcola le porzioni sui nuovi obiettivi.
 * Se cambia il numero di pasti al giorno il piano va rifatto.
 */
export function adaptPlanToPrefs(plan: WeekPlan, data: RecipeData, target: Nutrition, prefs: PlanPrefs): { plan: WeekPlan; rebuilt: boolean } {
  const perDay = (SPLITS[prefs.meals] ?? SPLITS[4]).length;
  if (plan.days.some((d) => d.meals.filter((m) => m.kind !== 'custom').length !== perDay && d.meals.length !== perDay))
    return { plan: planWeek(data, target, prefs, Date.now()), rebuilt: true };
  const used = new Set(plan.days.flatMap((d) => d.meals.filter((m) => m.kind === 'recipe').map((m) => m.refId)));
  const likes = prefs.likes ? exclusionPatterns(prefs.likes) : [];
  const days = plan.days.map((d) => ({
    meals: d.meals.map((m) => {
      if (m.kind === 'custom') return m;
      const { recipes, simple } = mealCandidates(data, prefs, m.slot);
      const ok = m.kind === 'recipe' ? recipes.some((r) => r.id === m.refId) : simple.some((x) => x.id === m.refId);
      if (ok) return m;
      // sostituisco con una ricetta non ancora usata, preferendo preferiti e cibi amati
      const pool = recipes.filter((r) => !used.has(r.id));
      const best = [...(pool.length ? pool : recipes)]
        .map((r) => ({ r, s: (prefs.favorites.includes(r.id) ? 2 : 0) + (likes.some((re) => re.test(recipeText(r))) ? 1 : 0) + Math.random() }))
        .sort((a, b) => b.s - a.s)[0]?.r;
      if (best && (m.kind === 'recipe' || !simple.length)) {
        used.add(best.id);
        return { ...m, kind: 'recipe' as const, refId: best.id, items: [] };
      }
      const alt = simple[Math.floor(Math.random() * simple.length)];
      return alt ? { ...m, kind: 'simple' as const, refId: alt.id } : m;
    }),
  }));
  return { plan: rescalePlan({ ...plan, days }, data, target, prefs), rebuilt: false };
}

/** Differenze tra due piani (pasti cambiati), per l'anteprima delle modifiche. */
export function planDiff(before: WeekPlan | undefined, after: WeekPlan, data: RecipeData): { day: number; slot: SlotKey; before?: string; after: string }[] {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const out: { day: number; slot: SlotKey; before?: string; after: string }[] = [];
  after.days.forEach((d, i) =>
    d.meals.forEach((m, j) => {
      const old = before?.days[i]?.meals[j];
      const a = mealInfo(m, byId).name;
      const b = old ? mealInfo(old, byId).name : undefined;
      if (a !== b) out.push({ day: i, slot: m.slot, before: b, after: a });
    }),
  );
  return out;
}

/* ---------- Lista della spesa settimanale ---------- */

export interface ShoppingItem {
  name: string;
  /** grammi; null = quantità da valutare (q.b. o unità non convertibili) */
  grams: number | null;
}

export function weeklyShopping(plan: WeekPlan, data: RecipeData): ShoppingItem[] {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const map = new Map<string, ShoppingItem>();
  const add = (name: string, grams: number | null) => {
    const key = name.toLowerCase();
    const cur = map.get(key) ?? { name, grams: null };
    if (grams) cur.grams = (cur.grams ?? 0) + grams;
    map.set(key, cur);
  };
  for (const m of plan.days.flatMap((d) => d.meals)) {
    if (m.kind === 'custom') continue;
    if (m.kind === 'recipe') {
      const r = byId.get(m.refId);
      if (!r) continue;
      const f = m.servings / (r.sv || 1);
      for (const [name, , foodId, g] of r.i) {
        if (/^(sale|pepe|acqua)\b/i.test(name)) continue;
        const label = (foodId && data.foods[foodId]) || name;
        add(label, g ? g * f : null);
      }
    } else {
      for (const p of m.items) add(p.food, p.grams);
    }
    for (const p of m.extras) add(p.food, p.grams);
  }
  return [...map.values()]
    .map((i) => ({ ...i, grams: i.grams == null ? null : Math.max(5, Math.round(i.grams / 10) * 10) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const formatQty = (i: ShoppingItem): string => {
  if (i.grams == null) return 'q.b.';
  if (i.grams >= 1000) return `${(i.grams / 1000).toFixed(1).replace('.', ',')} kg`;
  return `${i.grams} g`;
};
