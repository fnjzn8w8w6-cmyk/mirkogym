import type { Nutrition } from './metabolism';

/**
 * Ricette: dataset "UniTools World Recipes" (501 ricette, CC BY-SA 4.0 — credit "UniTools — theunitools.com")
 * con valori nutrizionali per porzione e foto, più colazioni/spuntini all'italiana curati nell'app.
 * Il piano settimanale è calcolato dall'app (nessuna quota AI): varietà, dieta, allergie, porzioni
 * calibrate sulle calorie di ogni pasto e integrazione proteica quando serve.
 */

export interface Recipe {
  id: string;
  n: string;
  nn?: string;
  s: string;
  co: string;
  c: string;
  d: string[];
  df: string;
  sv: number;
  t: number;
  /** kcal, proteine, carboidrati, grassi per porzione */
  k: [number, number, number, number];
  /** [id, nome, quantità, unità, scaling, nota] */
  i: [string, string, number | null, string, string, string?][];
  st: [string, number][];
  ph: [string, string, string] | null;
}

export interface RecipeData {
  license: string;
  attribution: string;
  source: string;
  recipes: Recipe[];
}

let cache: Promise<RecipeData> | null = null;
export function loadRecipes(): Promise<RecipeData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}recipes.json`)
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

/** Nome da mostrare: quello italiano per le ricette italiane, altrimenti il nome internazionale. */
export const recipeName = (r: Recipe): string => (r.co === 'IT' && r.nn ? r.nn : r.n);
/** Nome originale (se diverso e in alfabeto latino), mostrato come sottotitolo. */
export const recipeNative = (r: Recipe): string | null =>
  r.nn && r.nn !== recipeName(r) && /^[\p{Script=Latin}\s\d'’.,&()-]+$/u.test(r.nn) ? r.nn : null;
/** Bandiera del paese d'origine (codice ISO a 2 lettere). */
export const flag = (co: string): string =>
  /^[A-Z]{2}$/.test(co) ? String.fromCodePoint(...[...co].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌍';

export const CATEGORY_IT: Record<string, string> = {
  main: 'Piatti unici',
  soup: 'Zuppe',
  salad: 'Insalate',
  breakfast: 'Colazioni',
  snack: 'Spuntini',
  dessert: 'Dolci',
  bread: 'Pane e lievitati',
  side: 'Contorni',
  sauce: 'Salse',
  drink: 'Bevande',
};

/* ---------- Dizionario ingredienti (per ingredienti e lista spesa in italiano) ---------- */

const ING_IT: Record<string, string> = {
  salt: 'Sale', 'salt and pepper': 'Sale e pepe', garlic: 'Aglio', onion: 'Cipolla', onions: 'Cipolle', 'red onion': 'Cipolla rossa',
  butter: 'Burro', 'vegetable oil': 'Olio di semi', 'neutral oil': 'Olio di semi', 'oil for frying': 'Olio per friggere', 'olive oil': 'Olio EVO',
  flour: 'Farina', 'plain flour': 'Farina 00', sugar: 'Zucchero', potatoes: 'Patate', tomatoes: 'Pomodori', tomato: 'Pomodoro',
  eggs: 'Uova', egg: 'Uovo', milk: 'Latte', 'warm milk': 'Latte tiepido', ginger: 'Zenzero', rice: 'Riso', 'basmati rice': 'Riso basmati',
  'cooked rice': 'Riso cotto', 'long-grain rice': 'Riso a chicco lungo', 'short-grain rice': 'Riso a chicco corto', coriander: 'Coriandolo',
  'ground coriander': 'Coriandolo in polvere', parsley: 'Prezzemolo', water: 'Acqua', 'warm water': 'Acqua tiepida', 'iced water': 'Acqua ghiacciata',
  'tomato paste': 'Concentrato di pomodoro', lemon: 'Limone', lemons: 'Limoni', 'lemon zest': 'Scorza di limone', turmeric: 'Curcuma',
  carrots: 'Carote', carrot: 'Carota', chicken: 'Pollo', 'ground cumin': 'Cumino in polvere', 'cumin seed': 'Semi di cumino',
  'dry yeast': 'Lievito secco', limes: 'Lime', lime: 'Lime', lamb: 'Agnello', 'lamb on the bone': 'Agnello con osso', ghee: 'Burro chiarificato',
  beef: 'Manzo', 'minced beef': 'Macinato di manzo', 'coconut milk': 'Latte di cocco', vanilla: 'Vaniglia', 'cinnamon stick': 'Stecca di cannella',
  cinnamon: 'Cannella', 'bay leaves': 'Alloro', 'bay leaf': 'Alloro', 'soured cream': 'Panna acida', cream: 'Panna', 'double cream': 'Panna fresca',
  raisins: 'Uvetta', dill: 'Aneto', saffron: 'Zafferano', cabbage: 'Cavolo', 'bell peppers': 'Peperoni', 'bell pepper': 'Peperone',
  thyme: 'Timo', 'fish sauce': 'Salsa di pesce', 'spring onions': 'Cipollotti', 'spring onion': 'Cipollotto', prawns: 'Gamberi',
  'egg yolks': 'Tuorli', 'icing sugar': 'Zucchero a velo', paprika: 'Paprika', 'sweet paprika': 'Paprika dolce', vinegar: 'Aceto',
  'wine vinegar': 'Aceto di vino', honey: 'Miele', chilli: 'Peperoncino', 'dried oregano': 'Origano secco', oregano: 'Origano',
  chickpeas: 'Ceci', aubergines: 'Melanzane', 'minced pork': 'Macinato di maiale', walnuts: 'Noci', shallots: 'Scalogni',
  'dry white wine': 'Vino bianco secco', 'beef stock': 'Brodo di manzo', 'chicken stock': 'Brodo di pollo', 'soy sauce': 'Salsa di soia',
  breadcrumbs: 'Pangrattato', 'smoked bacon': 'Pancetta affumicata', 'pork belly': 'Pancia di maiale', mustard: 'Senape',
  cornflour: 'Amido di mais', 'sesame seeds': 'Semi di sesamo', 'dried mint': 'Menta secca', mint: 'Menta', nutmeg: 'Noce moscata',
  olives: 'Olive', almonds: 'Mandorle', 'ground cardamom': 'Cardamomo in polvere', 'cardamom pods': 'Baccelli di cardamomo',
  lemongrass: 'Citronella', pork: 'Maiale', 'pork shoulder': 'Spalla di maiale', 'bicarbonate of soda': 'Bicarbonato',
  'baking powder': 'Lievito per dolci', capers: 'Capperi', lard: 'Strutto', 'pine nuts': 'Pinoli', 'tamarind paste': 'Pasta di tamarindo',
  'palm sugar': 'Zucchero di palma', spinach: 'Spinaci', peas: 'Piselli', 'curry powder': 'Curry', pumpkin: 'Zucca',
  'black pepper': 'Pepe nero', cucumber: 'Cetriolo', cucumbers: 'Cetrioli', peanuts: 'Arachidi', 'roasted peanuts': 'Arachidi tostate',
  'sesame oil': 'Olio di sesamo', celery: 'Sedano', 'white bread': 'Pane bianco', spaghetti: 'Spaghetti', 'pecorino romano': 'Pecorino romano',
  guanciale: 'Guanciale', 'whole egg': 'Uovo intero', parmesan: 'Parmigiano', mozzarella: 'Mozzarella', basil: 'Basilico',
  salmon: 'Salmone', tuna: 'Tonno', cod: 'Merluzzo', lentils: 'Lenticchie', beans: 'Fagioli', 'black beans': 'Fagioli neri',
  'kidney beans': 'Fagioli rossi', yogurt: 'Yogurt', 'greek yogurt': 'Yogurt greco', feta: 'Feta', courgettes: 'Zucchine',
  mushrooms: 'Funghi', 'chicken thighs': 'Cosce di pollo', 'chicken breast': 'Petto di pollo', pasta: 'Pasta', noodles: 'Noodles',
  tofu: 'Tofu', avocado: 'Avocado', bread: 'Pane', 'brown sugar': 'Zucchero di canna', 'cider vinegar': 'Aceto di mele',
};
export const ingredientIt = (name: string): string => ING_IT[name.trim().toLowerCase()] ?? name;

/* ---------- Allergie e gusti (parole italiane → ingredienti in inglese) ---------- */

const ALLERGENS: [RegExp, RegExp][] = [
  [/lattosio|latte|latticin|formagg/i, /milk|cheese|cream|butter|yogh?urt|parmesan|mozzarella|ricotta|feta|pecorino|ghee|skyr|paneer|curd|kefir|halloumi|labneh|queso|burrata|mascarpone|gouda|cheddar|brie|gruy[eè]re|emmental|kashar|syrniki|tvorog|quark|dairy/i],
  [/glutine|celiac/i, /flour|bread|pasta|spaghetti|noodle|couscous|bulgur|semolina|wheat|barley|rye|breadcrumb|tortilla|pita|dough/i],
  [/uov/i, /\begg|yolk|mayonnaise/i],
  [/frutta secca|noci|nocciol|mandorl|pistacch|anacard/i, /nut|almond|walnut|hazelnut|pistachio|cashew|pecan|pine nut/i],
  [/arachid/i, /peanut/i],
  [/pesce/i, /fish|salmon|tuna|cod|anchov|sardine|mackerel|trout|herring|saltfish/i],
  [/crostace|frutti di mare|molluschi|gamber/i, /shrimp|prawn|crab|lobster|mussel|clam|squid|octopus|oyster|scallop/i],
  [/soia|soya/i, /\bsoy|tofu|edamame|miso|tempeh/i],
  [/sesamo/i, /sesame|tahini/i],
  [/maiale|suin/i, /pork|bacon|guanciale|pancetta|ham|sausage|chorizo|lard|prosciutto/i],
  [/manzo|carne rossa/i, /beef|veal/i],
  [/pollo/i, /chicken/i],
  [/piccant/i, /chil+i|scotch bonnet|cayenne|jalape/i],
  [/cipoll/i, /onion|shallot/i],
  [/aglio/i, /garlic/i],
  [/funghi/i, /mushroom/i],
  [/cocco/i, /coconut/i],
];

/** Parole da escludere: allergie e cibi non graditi, tradotti in pattern sugli ingredienti. */
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
    else out.push(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  return out;
}

/* ---------- Alimenti base (per 100 g) e pasti semplici all'italiana ---------- */

type Per100 = [p: number, c: number, f: number];
const FOODS: Record<string, { per100: Per100; tags: ('vegan' | 'vegetarian' | 'pescatarian')[]; en: string }> = {
  'Yogurt greco 0%': { per100: [10, 4, 0], tags: ['vegetarian'], en: 'yogurt milk' },
  "Fiocchi d'avena": { per100: [13, 60, 7], tags: ['vegan'], en: 'oats' },
  'Frutti di bosco': { per100: [1, 10, 0.3], tags: ['vegan'], en: 'berries' },
  Miele: { per100: [0.3, 82, 0], tags: ['vegetarian'], en: 'honey' },
  'Pane integrale': { per100: [9, 41, 3], tags: ['vegan'], en: 'bread wheat' },
  Uova: { per100: [13, 1, 10], tags: ['vegetarian'], en: 'egg' },
  'Latte parz. scremato': { per100: [3.3, 5, 1.6], tags: ['vegetarian'], en: 'milk' },
  'Ricotta vaccina': { per100: [9, 3.5, 11], tags: ['vegetarian'], en: 'ricotta cheese milk' },
  Banana: { per100: [1, 20, 0.3], tags: ['vegan'], en: 'banana' },
  "Burro d'arachidi": { per100: [25, 12, 50], tags: ['vegan'], en: 'peanut' },
  Mandorle: { per100: [22, 5, 52], tags: ['vegan'], en: 'almond nut' },
  Bresaola: { per100: [32, 0.5, 2.6], tags: [], en: 'beef' },
  'Cracker integrali': { per100: [10, 68, 10], tags: ['vegan'], en: 'wheat flour' },
  Hummus: { per100: [8, 14, 10], tags: ['vegan'], en: 'chickpeas sesame tahini' },
  Carote: { per100: [1, 8, 0.2], tags: ['vegan'], en: 'carrot' },
  'Proteine whey': { per100: [78, 8, 6], tags: ['vegetarian'], en: 'whey milk' },
  Mela: { per100: [0.3, 12, 0.1], tags: ['vegan'], en: 'apple' },
  'Fette biscottate integrali': { per100: [12, 70, 6], tags: ['vegan'], en: 'wheat bread' },
  Marmellata: { per100: [0.4, 50, 0], tags: ['vegan'], en: 'jam' },
  Tofu: { per100: [13, 2, 8], tags: ['vegan'], en: 'tofu soy' },
  'Latte di soia': { per100: [3.3, 1, 1.8], tags: ['vegan'], en: 'soy milk' },
  Pomodorini: { per100: [1, 4, 0.2], tags: ['vegan'], en: 'tomato' },
  Kiwi: { per100: [1, 9, 0.5], tags: ['vegan'], en: 'kiwi' },
  'Parmigiano Reggiano': { per100: [33, 0, 28], tags: ['vegetarian'], en: 'parmesan cheese milk' },
  'Petto di pollo': { per100: [23, 0, 1.5], tags: [], en: 'chicken' },
  'Tonno al naturale': { per100: [25, 0, 1], tags: ['pescatarian'], en: 'tuna fish' },
  Albumi: { per100: [11, 0.7, 0.2], tags: ['vegetarian'], en: 'egg' },
  'Riso basmati': { per100: [7, 78, 0.6], tags: ['vegan'], en: 'rice' },
  'Olio EVO': { per100: [0, 0, 100], tags: ['vegan'], en: 'olive oil' },
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
  const protein = Math.round(p * k);
  const carbs = Math.round(c * k);
  const fat = Math.round(f * k);
  return { food, grams, protein, carbs, fat, kcal: Math.round(p * k * 4 + c * k * 4 + f * k * 9) };
}

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
  { id: 's-uova-pane', name: 'Uova strapazzate e pane integrale', emoji: '🍳', slot: 'breakfast', items: [['Uova', 120], ['Pane integrale', 70], ['Kiwi', 100]], prep: 'Strapazza 2 uova in padella antiaderente, servi con il pane tostato e un kiwi.' },
  { id: 's-porridge', name: 'Porridge proteico alla banana', emoji: '🥛', slot: 'breakfast', items: [["Fiocchi d'avena", 60], ['Latte parz. scremato', 250], ['Proteine whey', 20], ['Banana', 100]], prep: "Cuoci l'avena nel latte 4 minuti, fuori dal fuoco aggiungi le proteine e la banana a fette." },
  { id: 's-toast-ricotta', name: 'Toast con ricotta e miele', emoji: '🍞', slot: 'breakfast', items: [['Pane integrale', 80], ['Ricotta vaccina', 100], ['Miele', 15], ['Mela', 150]], prep: 'Tosta il pane, spalma la ricotta e completa con un filo di miele. Mela a parte.' },
  { id: 's-fette-latte', name: 'Fette biscottate, marmellata e yogurt', emoji: '☕', slot: 'breakfast', items: [['Fette biscottate integrali', 40], ['Marmellata', 25], ['Yogurt greco 0%', 170], ['Latte parz. scremato', 150]], prep: 'Fette con marmellata, yogurt greco e un caffè macchiato.' },
  { id: 's-porridge-vegan', name: 'Porridge vegano con burro di arachidi', emoji: '🥜', slot: 'breakfast', items: [["Fiocchi d'avena", 60], ['Latte di soia', 250], ["Burro d'arachidi", 15], ['Banana', 100]], prep: "Cuoci l'avena nel latte di soia, completa con burro d'arachidi e banana." },
  { id: 's-tofu-strapazzato', name: 'Tofu strapazzato su pane', emoji: '🌱', slot: 'breakfast', items: [['Tofu', 150], ['Pane integrale', 70], ['Pomodorini', 100]], prep: 'Sbriciola il tofu in padella con curcuma e sale, servi sul pane con i pomodorini.' },
  { id: 's-yogurt-frutta', name: 'Yogurt greco e mela', emoji: '🍎', slot: 'snack', items: [['Yogurt greco 0%', 170], ['Mela', 150]], prep: '' },
  { id: 's-mandorle-banana', name: 'Mandorle e banana', emoji: '🍌', slot: 'snack', items: [['Mandorle', 25], ['Banana', 100]], prep: '' },
  { id: 's-cracker-bresaola', name: 'Cracker integrali e bresaola', emoji: '🥩', slot: 'snack', items: [['Cracker integrali', 30], ['Bresaola', 60]], prep: '' },
  { id: 's-hummus-carote', name: 'Hummus e carote', emoji: '🥕', slot: 'snack', items: [['Hummus', 80], ['Carote', 150]], prep: '' },
  { id: 's-shake', name: 'Shake proteico e banana', emoji: '🥤', slot: 'snack', items: [['Proteine whey', 30], ['Banana', 120]], prep: 'Proteine in 300 ml di acqua o latte.' },
  { id: 's-pane-arachidi', name: "Pane e burro d'arachidi", emoji: '🥪', slot: 'snack', items: [['Pane integrale', 50], ["Burro d'arachidi", 20]], prep: '' },
  { id: 's-parmigiano-mela', name: 'Parmigiano e mela', emoji: '🧀', slot: 'snack', items: [['Parmigiano Reggiano', 30], ['Mela', 150]], prep: '' },
];

/* ---------- Dieta ---------- */

export type DietKey = 'onnivora' | 'vegetariana' | 'vegana' | 'pescetariana';

function recipeAllowed(r: Recipe, diet: DietKey): boolean {
  if (diet === 'onnivora') return true;
  if (diet === 'vegana') return r.d.includes('vegan');
  if (diet === 'vegetariana') return r.d.includes('vegetarian') || r.d.includes('vegan');
  return r.d.includes('pescatarian') || r.d.includes('vegetarian') || r.d.includes('vegan');
}
function foodAllowed(food: string, diet: DietKey): boolean {
  const tags = FOODS[food]?.tags ?? [];
  if (diet === 'onnivora') return true;
  if (diet === 'vegana') return tags.includes('vegan');
  if (diet === 'vegetariana') return tags.includes('vegan') || tags.includes('vegetarian');
  return tags.length > 0;
}
const recipeText = (r: Recipe) => `${r.n} ${r.nn ?? ''} ${r.i.map((x) => x[1]).join(' ')}`;
const simpleText = (m: SimpleMeal) => m.items.map(([f]) => `${f} ${FOODS[f]?.en ?? ''}`).join(' ');

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
  kind: 'recipe' | 'simple';
  refId: string;
  /** porzioni della ricetta (kind=recipe) */
  servings: number;
  /** alimenti già porzionati (kind=simple) */
  items: FoodPortion[];
  /** integrazioni aggiunte dall'app per centrare i macro */
  extras: FoodPortion[];
  macros: Macros;
}

export interface WeekPlan {
  createdAt: number;
  seed: number;
  targetKcal: number;
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

function recipeMacros(r: Recipe, servings: number): Macros {
  return { kcal: Math.round(r.k[0] * servings), protein: Math.round(r.k[1] * servings), carbs: Math.round(r.k[2] * servings), fat: Math.round(r.k[3] * servings) };
}

function withMacros(m: Omit<PlannedMeal, 'macros'>, recipes: Map<string, Recipe>): PlannedMeal {
  const base =
    m.kind === 'recipe' ? recipeMacros(recipes.get(m.refId) as Recipe, m.servings) : sumMacros(m.items.map(portionMacros));
  return { ...m, macros: sumMacros([base, ...m.extras.map(portionMacros)]) };
}

/** Porzione della ricetta per avvicinarsi alle calorie del pasto (a passi di ¼). */
const servingsFor = (r: Recipe, kcal: number) => Math.min(2.5, Math.max(0.5, Math.round((kcal / r.k[0]) * 4) / 4));

function simpleFor(m: SimpleMeal, kcal: number): FoodPortion[] {
  const base = m.items.map(([f, g]) => portion(f, g));
  const tot = base.reduce((a, p) => a + p.kcal, 0) || 1;
  const f = Math.min(1.8, Math.max(0.6, kcal / tot));
  return m.items.map(([food, g]) => portion(food, Math.max(5, Math.round((g * f) / 5) * 5)));
}

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

export function mealCandidates(data: RecipeData, prefs: PlanPrefs, slot: SlotKey) {
  const excl = exclusionPatterns(`${prefs.allergies},${prefs.dislikes}`);
  const ok = (text: string) => !excl.some((re) => re.test(text));
  const maxTime = prefs.cooking === 'poco' ? 30 : prefs.cooking === 'medio' ? 60 : 999;
  const isMain = slot === 'pranzo' || slot === 'cena';
  const cats = SLOT_CATEGORIES(slot);
  const base = data.recipes.filter((r) => cats.includes(r.c) && recipeAllowed(r, prefs.diet) && ok(recipeText(r)));
  const quick = base.filter((r) => r.t <= (isMain ? maxTime : Math.min(maxTime, 30)));
  // Con diete molto restrittive si allarga il limite di tempo per garantire varietà
  const recipes = quick.length >= 10 ? quick : base;
  const simple = isMain
    ? []
    : SIMPLE_MEALS.filter(
        (m) => m.slot === (slot === 'colazione' ? 'breakfast' : 'snack') && m.items.every(([f]) => foodAllowed(f, prefs.diet)) && ok(simpleText(m)),
      );
  return { recipes, simple };
}

/** Cucine più familiari per un utente italiano (leggera preferenza, non esclusiva). */
const MEDITERRANEAN = new Set(['ES', 'FR', 'GR', 'PT', 'TR', 'HR', 'MT', 'CY', 'LB', 'MA', 'TN', 'DE', 'AT', 'CH', 'GB', 'IE', 'US', 'MX']);

/** Crea un piano di 7 giorni vario, calibrato su calorie e proteine. */
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
  // Vicinanza dei macro della ricetta a quelli dell'obiettivo (1 = identici, 0 = molto lontani)
  const macroFit = (r: Recipe) => {
    const k = r.k[1] * 4 + r.k[2] * 4 + r.k[3] * 9 || 1;
    const dist = Math.abs((r.k[1] * 4) / k - proteinShare) + Math.abs((r.k[2] * 4) / k - carbShare) + Math.abs((r.k[3] * 9) / k - fatShare);
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
      const { recipes, simple } = mealCandidates(data, prefs, slot);
      const isMain = slot === 'pranzo' || slot === 'cena';
      // Colazioni/spuntini: soprattutto pasti semplici all'italiana, ogni tanto una ricetta
      const simpleFresh = simple.filter((x) => x.id !== lastSimple.get(slot));
      const useSimple = !isMain && simple.length > 0 && (recipes.length === 0 || (simpleFresh.length > 0 && rand() < 0.75));
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
        return (
          (prefs.favorites.includes(x.id) ? 1.5 : 0) +
          liked(recipeText(x)) +
          macroFit(x) * 1.6 +
          (x.ph ? 0.3 : 0) +
          (x.co === 'IT' ? 0.35 : MEDITERRANEAN.has(x.co) ? 0.15 : 0) -
          // porzioni realistiche: penalizza ricette troppo leggere o troppo pesanti per il pasto
          (Math.abs(servingsFor(x, kcal) * x.k[0] - kcal) / kcal) * 2 -
          (servingsFor(x, kcal) >= 2.25 ? 0.4 : 0)
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

/** Aggiunge integrazioni per proteine/calorie mancanti o riduce le porzioni in eccesso. */
function balanceDay(day: PlannedMeal[], target: Nutrition, diet: DietKey, excl: RegExp[], byId: Map<string, Recipe>): PlannedMeal[] {
  let meals = day.map((m) => ({ ...m, extras: [] as FoodPortion[] }));
  const recompute = () => (meals = meals.map((m) => withMacros(m, byId)));
  recompute();
  const allowed = (food: string) => foodAllowed(food, diet) && !excl.some((re) => re.test(`${food} ${FOODS[food]?.en ?? ''}`));

  // 1) proteine mancanti → integrazione proteica sul pasto principale più povero di proteine
  let tot = dayTotals(meals);
  const usedSources = new Set<string>();
  for (let round = 0; round < 2; round++) {
    tot = dayTotals(meals);
    const gap = target.protein - tot.protein;
    if (gap <= 12) break;
    const source = ['Yogurt greco 0%', 'Petto di pollo', 'Tonno al naturale', 'Tofu', 'Albumi', 'Proteine whey'].find((f) => allowed(f) && !usedSources.has(f));
    if (!source) break;
    usedSources.add(source);
    const [p] = FOODS[source].per100;
    const maxG = source === 'Proteine whey' ? 40 : source === 'Yogurt greco 0%' ? 300 : 200;
    const grams = Math.min(maxG, Math.round(((gap / p) * 100) / 10) * 10);
    const idx = meals.reduce((best, m, i) => (m.slot !== 'colazione' && m.macros.protein < meals[best].macros.protein ? i : best), meals.length - 1);
    meals[idx] = { ...meals[idx], extras: [...meals[idx].extras, portion(source, grams)] };
    recompute();
  }
  // 2) calorie basse → carboidrati semplici (pane/riso/frutta) al pranzo
  tot = dayTotals(meals);
  const kcalGap = target.target - tot.kcal;
  if (kcalGap > target.target * 0.07) {
    const source = ['Pane integrale', 'Riso basmati', 'Banana'].find(allowed);
    if (source) {
      const [p, c, f] = FOODS[source].per100;
      const per100 = p * 4 + c * 4 + f * 9;
      const grams = Math.min(150, Math.round(((kcalGap / per100) * 100) / 10) * 10);
      const idx = Math.max(0, meals.findIndex((m) => m.slot === 'pranzo'));
      meals[idx] = { ...meals[idx], extras: [...meals[idx].extras, portion(source, grams)] };
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
    if (!r) return null;
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
      day.meals.map((m) => buildMeal(m.slot, { kind: m.kind, id: m.refId }, slotKcal(prefs.meals, m.slot, target.target), byId) ?? m),
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
  if (m.kind === 'recipe') {
    const r = byId.get(m.refId);
    return { name: r ? recipeName(r) : 'Ricetta', recipe: r };
  }
  const sm = SIMPLE_MEALS.find((x) => x.id === m.refId);
  return { name: sm?.name ?? 'Pasto', simple: sm };
}

/** Categorie di ricette adatte a un pasto. */
export const SLOT_CATEGORIES = (slot: SlotKey): string[] =>
  slot === 'pranzo' || slot === 'cena' ? ['main', 'soup', 'salad'] : slot === 'colazione' ? ['breakfast'] : ['snack'];

/* ---------- Lista della spesa settimanale ---------- */

const UNIT_IT: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', piece: 'pz', tbsp: 'cucch.', tsp: 'cucchiaini', clove: 'spicchi', slice: 'fette', sprig: 'rametti', pinch: 'pizzichi' };

export interface ShoppingItem {
  name: string;
  qty: number | null;
  unit: string;
}

const COUNTABLE = new Set(['piece', 'clove', 'slice', 'sprig']);
function roundQty(q: number, unit: string): number {
  if (unit === 'g' || unit === 'ml') return Math.max(10, Math.round(q / 10) * 10);
  if (COUNTABLE.has(unit)) return Math.max(1, Math.ceil(q - 0.15));
  return Math.max(0.5, Math.round(q * 2) / 2);
}

export function weeklyShopping(plan: WeekPlan, data: RecipeData): ShoppingItem[] {
  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const map = new Map<string, ShoppingItem>();
  const add = (name: string, qty: number | null, unit: string) => {
    const key = `${name.toLowerCase()}|${unit}`;
    const cur = map.get(key) ?? { name, qty: qty == null ? null : 0, unit };
    if (qty != null && cur.qty != null) cur.qty += qty;
    map.set(key, cur);
  };
  for (const m of plan.days.flatMap((d) => d.meals)) {
    if (m.kind === 'recipe') {
      const r = byId.get(m.refId);
      if (!r) continue;
      const f = m.servings / (r.sv || 1);
      for (const [, name, q, unit, scaling] of r.i) {
        if (unit === 'toTaste' || q == null) {
          add(ingredientIt(name), null, 'q.b.');
          continue;
        }
        const k = scaling === 'fixed' ? 1 : scaling === 'damped' ? f ** 0.8 : f;
        let qty = q * k;
        let u = unit;
        if (u === 'kg') [qty, u] = [qty * 1000, 'g'];
        if (u === 'l') [qty, u] = [qty * 1000, 'ml'];
        add(ingredientIt(name), qty, u);
      }
    } else {
      for (const p of m.items) add(p.food, p.grams, 'g');
    }
    for (const p of m.extras) add(p.food, p.grams, 'g');
  }
  return [...map.values()]
    .map((i) => ({ ...i, qty: i.qty == null ? null : roundQty(i.qty, i.unit) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const formatQty = (i: ShoppingItem): string => {
  if (i.qty == null) return 'q.b.';
  if (i.unit === 'g' && i.qty >= 1000) return `${(i.qty / 1000).toFixed(1).replace('.', ',')} kg`;
  if (i.unit === 'ml' && i.qty >= 1000) return `${(i.qty / 1000).toFixed(1).replace('.', ',')} l`;
  return `${String(i.qty).replace('.', ',')} ${UNIT_IT[i.unit] ?? i.unit}`;
};
