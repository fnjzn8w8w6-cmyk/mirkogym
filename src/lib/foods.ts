/**
 * Alimenti: tabella base in italiano (USDA FoodData Central, valori per 100 g) + prodotti confezionati
 * da Open Food Facts (ricerca e codice a barre, database aperto e gratuito, ODbL).
 */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type FoodSource = 'base' | 'off' | 'custom';

export interface Food {
  id: string;
  name: string;
  brand?: string;
  /** valori per 100 g (o 100 ml) */
  per100: Macros;
  /** porzione tipica (es. 1 uovo = 55 g, 1 vasetto = 125 g) */
  unitGrams?: number;
  unitLabel?: string;
  source: FoodSource;
  barcode?: string;
  image?: string;
  category?: string;
}

interface BaseFoodRow {
  id: string;
  n: string;
  cat: string;
  k: number;
  p: number;
  c: number;
  f: number;
  u: number;
  kw: string;
}

export const FOOD_CATEGORY: Record<string, string> = {
  cereali: 'Cereali, pane e pasta',
  carne: 'Carne e salumi',
  pesce: 'Pesce',
  'uova-latticini': 'Uova e latticini',
  legumi: 'Legumi e soia',
  verdura: 'Verdura',
  frutta: 'Frutta',
  'frutta-secca': 'Frutta secca e semi',
  grassi: 'Grassi e condimenti',
  condimenti: 'Salse e condimenti',
  dolci: 'Dolci e zuccheri',
  bevande: 'Bevande',
  integratori: 'Integratori',
};

let baseCache: Promise<(Food & { kw: string })[]> | null = null;
export function loadBaseFoods(): Promise<(Food & { kw: string })[]> {
  baseCache ??= fetch(`${import.meta.env.BASE_URL}foods.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Tabella alimenti non disponibile');
      return r.json() as Promise<{ foods: BaseFoodRow[] }>;
    })
    .then((d) =>
      d.foods.map((f) => ({
        id: `base:${f.id}`,
        name: f.n,
        per100: { kcal: f.k, protein: f.p, carbs: f.c, fat: f.f },
        unitGrams: f.u || undefined,
        source: 'base' as const,
        category: f.cat,
        kw: `${f.n} ${f.kw}`.toLowerCase().replace(/_/g, ' '),
      })),
    )
    .catch((e: unknown) => {
      baseCache = null;
      throw e;
    });
  return baseCache;
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Ricerca locale: tutte le parole devono comparire; prima i nomi che iniziano con la ricerca. */
export function searchLocal<T extends { name: string; brand?: string; kw?: string }>(list: T[], query: string, limit = 30): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { f: T; s: number }[] = [];
  for (const f of list) {
    const name = normalize(f.name);
    const text = `${name} ${normalize(f.brand ?? '')} ${normalize(f.kw ?? '')}`;
    if (!words.every((w) => text.includes(w))) continue;
    scored.push({ f, s: (name.startsWith(words[0]) ? 2 : 0) + (name.includes(words.join(' ')) ? 1 : 0) - name.length / 100 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

/* ---------- Calcoli ---------- */

export const round1 = (v: number) => Math.round(v * 10) / 10;

export function macrosFor(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return { kcal: Math.round(per100.kcal * k), protein: round1(per100.protein * k), carbs: round1(per100.carbs * k), fat: round1(per100.fat * k) };
}

export const sumMacros = (list: Macros[]): Macros =>
  list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: round1(a.protein + m.protein), carbs: round1(a.carbs + m.carbs), fat: round1(a.fat + m.fat) }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

/* ---------- Open Food Facts ---------- */

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_it,generic_name_it,brands,nutriments,serving_quantity,serving_size,quantity,image_front_small_url';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_it?: string;
  generic_name_it?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  image_front_small_url?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

/** Converte un prodotto Open Food Facts; null se mancano i valori nutrizionali. */
export function fromOff(p: OffProduct): Food | null {
  const nu = p.nutriments ?? {};
  const kj = n(nu['energy_100g']);
  const kcal = n(nu['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : null);
  const protein = n(nu['proteins_100g']);
  const carbs = n(nu['carbohydrates_100g']);
  const fat = n(nu['fat_100g']);
  if (kcal == null || protein == null || carbs == null || fat == null) return null;
  const name = (p.product_name_it || p.product_name || p.generic_name_it || '').trim();
  if (!name) return null;
  const serving = n(p.serving_quantity);
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    per100: { kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) },
    unitGrams: serving && serving > 0 && serving < 2000 ? serving : undefined,
    unitLabel: serving ? `porzione (${p.serving_size ?? `${serving} g`})` : undefined,
    source: 'off',
    barcode: p.code,
    image: p.image_front_small_url,
  };
}

async function offFetch(url: string, ms = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Open Food Facts non risponde (${r.status})`);
    return await r.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Open Food Facts non risponde: riprova');
    if (e instanceof TypeError) throw new Error('Connessione assente: la ricerca dei prodotti richiede internet');
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

/** Prodotto dal codice a barre (EAN/UPC). null se non è nel database o non ha i valori nutrizionali. */
export async function lookupBarcode(code: string): Promise<{ food: Food | null; found: boolean; name?: string }> {
  const j = (await offFetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`)) as {
    status?: number;
    product?: OffProduct;
  } | null;
  if (!j || j.status === 0 || !j.product) return { food: null, found: false };
  const food = fromOff({ ...j.product, code: j.product.code ?? code });
  return { food, found: true, name: j.product.product_name_it || j.product.product_name };
}

const searchCache = new Map<string, Food[]>();
/** Ricerca testuale dei prodotti venduti in Italia. */
export async function searchOff(query: string): Promise<Food[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const hit = searchCache.get(q);
  if (hit) return hit;
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&lc=it&cc=it&fields=${OFF_FIELDS}`;
  const j = (await offFetch(url, 15000)) as { products?: OffProduct[] } | null;
  const list = (j?.products ?? []).map(fromOff).filter((f): f is Food => f != null);
  searchCache.set(q, list);
  return list;
}
