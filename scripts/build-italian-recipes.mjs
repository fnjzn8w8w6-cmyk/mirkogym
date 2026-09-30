/**
 * Genera public/ricette.json dal ricettario italiano "dispensa-dati" (CC BY-SA 4.0: ricette originali
 * FrigoDispensa + Wikibooks "Libro di cucina"), calcolando calorie e macro per porzione dagli
 * ingredienti con la tabella alimenti dell'app (public/foods.json, USDA FoodData Central).
 *   node scripts/build-italian-recipes.mjs
 *   RICETTE_JSON=path/ricette.json node scripts/build-italian-recipes.mjs
 * Le foto (se verificate) sono in scripts/recipe-photos.json: { id: { file, author, license, source } }.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = 'https://github.com/GenPocoto/dispensa-dati/releases/latest/download/ricette.json';
const data = process.env.RICETTE_JSON
  ? JSON.parse(readFileSync(process.env.RICETTE_JSON, 'utf8'))
  : await (await fetch(SRC)).json();
const { foods } = JSON.parse(readFileSync(new URL('../public/foods.json', import.meta.url), 'utf8'));
const photosPath = new URL('./recipe-photos.json', import.meta.url);
const photos = existsSync(photosPath) ? JSON.parse(readFileSync(photosPath, 'utf8')) : {};

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'");

/* ---------- Abbinamento ingrediente → alimento ---------- */

// Parole chiave per alimento: nome (senza parentesi) + parole extra. Le più lunghe vincono.
// Parole troppo generiche da sole
const WEAK = new Set(['olio', 'latte', 'pasta', 'farina', 'semi', 'succo', 'verdure', 'formaggio', 'crema', 'salsa', 'bianco', 'rosso', 'secchi', 'fresca', 'fresco', 'intero', 'magro', 'light', 'scatola', 'cotta', 'cotto', 'cruda', 'crudo', 'uovo', 'uova', 'cucina', 'carne', 'fette', 'pan']);
const keys = [];
for (const f of foods) {
  const base = norm(f.n.replace(/\(.*?\)/g, '')).trim();
  // nome completo, primo termine del nome (es. "farina", "olio") e parole chiave ("_" = frase)
  const first = base.split(/\s+/)[0];
  const words = new Set([base, ...base.split('/').map((x) => x.trim()), ...(WEAK.has(first) ? [] : [first]), ...norm(f.kw).split(/\s+/).map((w) => w.replace(/_/g, ' '))]);
  for (const w of words) if (w.length >= 3) keys.push([w, f, keyRegex(w)]);
}
/** Parola intera; se finisce per vocale accetta singolare/plurale (pomodoro/pomodori, cipolla/cipolle). */
function keyRegex(w) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stem = /[aeio]$/.test(w) && w.length >= 7 ? `${esc(w.slice(0, -1))}[aeio]` : esc(w);
  return new RegExp(`(^|[^a-z])${stem}(?![a-z])`);
}
const SKIP = /^(sale|pepe|acqua|ghiaccio|peperoncino|noce moscata|cannella|chiodi di garofano|vaniglia|vanillina|origano|timo|rosmarino|salvia|alloro|lauro|menta|maggiorana|erba cipollina|aneto|curry|paprika|paprica|zafferano|cumino|curcuma|zenzero|spezie|erbe|lievito di birra|bicarbonato|colla di pesce|gelatina|scorza|buccia|chiodi|garofano|semi di anice|fiori d|canditi|confettini|aromi|wasabi|coriandolo)/;

function matchFood(ing) {
  const text = norm(ing.name);
  let best = null;
  let bestScore = -Infinity;
  for (const [w, f, re] of keys) {
    const m = re.exec(text);
    if (!m) continue;
    // parola più lunga = più specifica; bonus se è il primo termine (il "nome" dell'ingrediente)
    const score = w.length + (WEAK.has(w) ? -10 : 0) + (m.index === 0 ? 2 : 0);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

/* ---------- Quantità → grammi ---------- */

function num(s) {
  s = s.replace(',', '.').trim();
  const range = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = s.match(/^\d+(?:\.\d+)?/);
  return n ? Number(n[0]) : null;
}

const SPOON = (f) => (f?.cat === 'grassi' ? 10 : f?.id === 'zucchero' || f?.id === 'miele' ? 12 : f?.cat === 'uova-latticini' ? 8 : 10);

/** grammi totali dell'ingrediente nella ricetta; null = sconosciuto; 0 = trascurabile */
function grams(qtyRaw, f, servings) {
  const qty = norm(String(qtyRaw ?? '')).trim();
  const paren = qty.match(/\((?:circa\s*)?(\d+(?:[.,]\d+)?)\s*(g|ml)\)/);
  if (paren) return Number(paren[1].replace(',', '.'));
  if (/q\.?\s*b|abbondante|a piacere|quanto basta/.test(qty) || !qty) {
    if (!f) return 0;
    if (f.cat === 'grassi') return 8 * servings; // olio per condire/cuocere
    if (f.id === 'parmigiano-reggiano' || f.id === 'pecorino') return 5 * servings;
    return 0;
  }
  // somme tipo "150 g + 250" o "2 + 4"
  if (/\+/.test(qty)) return qty.split('+').reduce((a, part) => a + (grams(part.trim(), f, servings) ?? 0), 0);
  const n = num(qty) ?? (/^(un|una|uno)\b/.test(qty) ? 1 : null);
  const unit = qty.replace(/^[\d.,/\s-]+/, '').replace(/^(un|una|uno)\s+/, '').trim();
  if (n == null) return /foglie|ciuffo|rametto|mazzetto|pizzico|scorza/.test(qty) ? 0 : null;
  if (/^g\b|^gr\b/.test(unit)) return n;
  if (/^kg\b/.test(unit)) return n * 1000;
  if (/^ml\b/.test(unit)) return n * (f?.cat === 'grassi' ? 0.92 : 1);
  if (/^cl\b/.test(unit)) return n * 10;
  if (/^dl\b/.test(unit)) return n * 100;
  if (/^l\b|^litr/.test(unit)) return n * 1000;
  if (/^cucchiain/.test(unit)) return n * SPOON(f) * 0.4;
  if (/^cucchiai|^cucchiaio/.test(unit)) return n * SPOON(f);
  if (/^pizzic|^foglie|^foglia|^fogliolin|^ciuff|^rametti|^rametto|^mazzett|^chiod|^cm\b/.test(unit)) return 0;
  if (/^bicchier/.test(unit)) return n * 125;
  if (/^tazz/.test(unit)) return n * 200;
  if (/^mestol/.test(unit)) return n * 60;
  if (/^manciat/.test(unit)) return n * 30;
  if (/^noc/.test(unit)) return n * 10;
  if (/^bustin|^bust/.test(unit)) return n * (f?.id === 'lievito-per-dolci' ? 16 : 10);
  if (/^vasett/.test(unit)) return n * 125;
  if (/^scatol|^barattol|^latta/.test(unit)) return n * (f?.cat === 'pesce' ? 80 : 400);
  if (/^rotol/.test(unit)) return n * 230;
  if (/^panett/.test(unit)) return n * (f?.cat === 'grassi' ? 250 : 25);
  if (/^spicch/.test(unit)) return n * 3;
  if (/^cost|^gamb/.test(unit)) return n * 40;
  if (/^fett/.test(unit)) return n * (f?.cat === 'cereali' ? 30 : f?.cat === 'carne' ? (f.id.startsWith('prosciutto') || f.id === 'bresaola' || f.id === 'salame' || f.id === 'mortadella' || f.id === 'pancetta' ? 15 : 100) : 25);
  if (/^filett/.test(unit)) return n * (f?.id?.startsWith('acciughe') || f?.id?.startsWith('alici') ? 4 : 150);
  if (/^tuorl/.test(unit)) return n * 18;
  if (/^album/.test(unit)) return n * 33;
  if (!f) return null;
  // numero di pezzi (con eventuale grandezza)
  const size = /grand/.test(unit) ? 1.3 : /piccol/.test(unit) ? 0.7 : 1;
  if (!unit || /^(grand|medi|piccol|intero|interi|sod|fresch|matur|frutto|pezz)/.test(unit)) return f.u ? n * f.u * size : null;
  return f.u ? n * f.u : null;
}

/* ---------- Conversione ---------- */

const CAT_SLOT = { colazione: 'colazione', primi: 'main', 'piatti-unici': 'main', zuppe: 'main', secondi: 'main' };
const r0 = (v) => Math.round(v);
const stats = { ok: 0, ko: 0, unmatched: new Map() };
const recipes = [];

for (const r of data.recipes) {
  const sv = Math.max(1, r.servings || 1);
  let k = 0, p = 0, c = 0, fat = 0, known = 0, unknown = 0;
  let meat = false, fish = false, animal = false;
  const ing = [];
  const steps = norm((r.steps ?? []).join(' '));
  for (const i of r.ingredients) {
    const nm = norm(i.name);
    const skip = SKIP.test(nm);
    const f = skip ? null : matchFood(i);
    let g = skip ? 0 : grams(i.qty, f, sv);
    // Farina per infarinare e olio per friggere: se ne assorbe solo una parte
    if (g && f?.id === 'farina-di-grano-tenero-00' && /infarin/.test(steps) && g / sv > 60) g = g * 0.15;
    if (g && f?.cat === 'grassi' && (/friggere|frittura/.test(nm) || /friggi|frigge|frittura/.test(steps)) && g / sv > 25) g = Math.max(12 * sv, g * 0.12);
    if (f) {
      if (f.cat === 'carne') meat = true;
      if (f.cat === 'pesce') fish = true;
      if (f.cat === 'uova-latticini' || f.id === 'miele' || f.id === 'burro') animal = true;
    }
    if (f && g != null) {
      k += (f.k * g) / 100;
      p += (f.p * g) / 100;
      c += (f.c * g) / 100;
      fat += (f.f * g) / 100;
      known += g;
    } else if (!skip && !i.optional) {
      // ingrediente con peso esplicito ma senza alimento, o alimento senza peso: incertezza
      const guess = grams(i.qty, { cat: 'x', u: 100, id: '' }, sv);
      if (guess) unknown += guess;
      else if (!f && !/q\.?\s*b/i.test(i.qty ?? '')) unknown += 30;
      if (!f) stats.unmatched.set(nm, (stats.unmatched.get(nm) ?? 0) + 1);
    }
    ing.push([i.name, i.qty ?? '', f?.id ?? null, g == null ? null : Math.round(g)]);
  }
  // Affidabile se il peso non attribuito è ≤ 12% del totale e la porzione ha valori plausibili
  const perK = k / sv;
  const ok = known > 0 && unknown / (known + unknown) <= 0.12 && perK >= 60 && perK <= 1300;
  ok ? stats.ok++ : stats.ko++;
  const tags = new Set(r.tags ?? []);
  const vegan = !meat && !fish && !animal && tags.has('vegano');
  const vegetarian = !meat && !fish && (tags.has('vegetariano') || vegan);
  const ph = photos[r.id];
  recipes.push({
    id: r.id,
    t: r.title,
    cat: r.category,
    slot: CAT_SLOT[r.category] ?? null,
    min: r.minutes ?? 0,
    df: r.difficulty ?? 1,
    sv,
    d: [vegan && 'vegan', vegetarian && 'vegetarian', !meat && (vegetarian || fish) && 'pescatarian', tags.has('senza-glutine') && 'gluten-free'].filter(Boolean),
    tg: [...tags].filter((x) => ['veloce', 'economico', 'forno', 'senza-cottura', 'svuotafrigo'].includes(x)),
    k: ok ? [r0(perK), r0(p / sv), r0(c / sv), r0(fat / sv)] : null,
    i: ing,
    st: r.steps,
    src: r.source ? [r.source.title, r.source.url] : null,
    ph: ph ? [ph.file, ph.author, ph.license, ph.source] : null,
  });
}

writeFileSync(
  new URL('../public/ricette.json', import.meta.url),
  JSON.stringify({
    license: 'CC BY-SA 4.0',
    attribution:
      'Ricette: FrigoDispensa (dispensa-dati) e Wikibooks "Libro di cucina", CC BY-SA 4.0. Valori nutrizionali calcolati da USDA FoodData Central.',
    recipes,
  }),
);
console.log(`ricette.json: ${recipes.length} ricette · valori affidabili: ${stats.ok} · non calcolabili: ${stats.ko} · foto: ${Object.keys(photos).length}`);
if (process.env.VERBOSE)
  console.log(
    [...stats.unmatched.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120)
      .map(([n, c]) => `${c}× ${n}`)
      .join('\n'),
  );
