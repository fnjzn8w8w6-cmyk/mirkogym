/**
 * Importazioni con l'AI (Gemini legge foto e PDF):
 * - scheda del personal trainer → giorni ed esercizi collegati alla libreria;
 * - dieta del nutrizionista → piano settimanale con macro dal database alimenti;
 * - foto del piatto → alimenti e grammi stimati.
 * I macro li calcola l'app dal database alimenti; l'AI stima solo cosa c'è e quanto.
 */
import type { Day, Exercise } from '@/types';
import { callAIJson, num, oneOf, str, type AIOptions, type Part } from './ai';
import { NAME_IT, loadLibrary } from './exercise-library';
import { loadBaseFoods, macrosFor, normalize, searchLocal, sumMacros, type Food, type Macros } from './foods';
import type { PlannedMeal, SlotKey, WeekPlan } from './recipes';

/* ---------- File → parte per Gemini ---------- */

const readBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('File non leggibile'));
    r.readAsDataURL(blob);
  });

/** Le foto vengono ridotte (max 1600 px, JPEG): meno dati da inviare, stessa leggibilità. */
async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

export async function fileToPart(file: File): Promise<Part> {
  if (file.type === 'application/pdf') {
    if (file.size > 15 * 1024 * 1024) throw new Error('PDF troppo grande (max 15 MB)');
    return { inlineData: { mimeType: 'application/pdf', data: await readBase64(file) } };
  }
  if (!file.type.startsWith('image/')) throw new Error('Carica una foto o un PDF');
  const blob = await shrinkImage(file);
  return { inlineData: { mimeType: blob.type || 'image/jpeg', data: await readBase64(blob) } };
}

/* ---------- Alimenti: nome → database ---------- */

type BaseFood = Food & { kw: string };

/** Cerca l'alimento nel database: prima il nome intero, poi parole via via più corte. */
function matchFood(base: BaseFood[], name: string): BaseFood | undefined {
  const words = normalize(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['con', 'del', 'della', 'alla', 'allo', 'crudo', 'cotto', 'cotta', 'fresco', 'fresca'].includes(w));
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const hit = searchLocal(base, words.slice(0, n).join(' '), 1)[0];
    if (hit) return hit;
  }
  return undefined;
}

export interface FoodGuess {
  name: string;
  grams: number;
  per100: Macros;
  /** trovato nel database (altrimenti valori stimati dall'AI) */
  matched: boolean;
  foodId?: string;
}

const parsePer100 = (o: Record<string, unknown>): Macros => {
  const protein = num(o.p, 0, 100) ?? 0;
  const carbs = num(o.c, 0, 100) ?? 0;
  const fat = num(o.f, 0, 100) ?? 0;
  return { kcal: Math.round(protein * 4 + carbs * 4 + fat * 9), protein, carbs, fat };
};

async function resolveFoods(items: { name: string; grams: number; est: Macros }[]): Promise<FoodGuess[]> {
  const base = await loadBaseFoods().catch(() => [] as BaseFood[]);
  return items.map((it) => {
    const hit = matchFood(base, it.name);
    return hit
      ? { name: it.name, grams: it.grams, per100: hit.per100, matched: true, foodId: hit.id }
      : { name: it.name, grams: it.grams, per100: it.est, matched: false };
  });
}

const parseItems = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { name: str(o.food ?? o.name, 60), grams: Math.round(num(o.grams ?? o.g, 1, 2000) ?? 0), est: parsePer100(o) };
    })
    .filter((x) => x.name && x.grams > 0)
    .slice(0, 15);

const ITEM_SPEC =
  '{"food": nome semplice in italiano dell\'alimento CRUDO/base (es. "pasta di semola", "petto di pollo", "olio extravergine di oliva"), "grams": grammi, "p","c","f": proteine, carboidrati, grassi per 100 g}';

/* ---------- Foto del piatto ---------- */

export async function analyzeMealPhoto(file: File, note: string, opts: AIOptions = {}): Promise<FoodGuess[]> {
  const part = await fileToPart(file);
  const items = await callAIJson(
    `Sei un nutrizionista. Guarda la foto del piatto e stima gli alimenti presenti e i grammi di ciascuno.
Per pasta, riso e cereali indica il peso CRUDO equivalente. Includi condimenti probabili (olio, formaggio grattugiato) con quantità realistiche.
${note.trim() ? `Indicazioni della persona: "${note.trim().slice(0, 300)}"` : ''}
Rispondi SOLO con JSON: {"items":[${ITEM_SPEC}]}`,
    (raw) => parseItems((raw as { items?: unknown }).items),
    { prefer: 'flash', temperature: 0.2, label: 'Analizzo il piatto…', ...opts },
    [part],
  );
  if (!items.length) throw new Error('Non riesco a riconoscere il cibo nella foto, riprova con più luce');
  return resolveFoods(items);
}

/* ---------- Dieta del nutrizionista ---------- */

export interface ImportedMeal {
  slot: SlotKey;
  label: string;
  items: FoodGuess[];
  alternatives?: string;
}
export interface ImportedDiet {
  days: ImportedMeal[][];
  notes: string;
}

const SLOTS: readonly SlotKey[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

export async function importDiet(files: File[], opts: AIOptions = {}): Promise<ImportedDiet> {
  const parts = await Promise.all(files.map(fileToPart));
  const raw = await callAIJson(
    `Questa è la dieta scritta da un nutrizionista (foto o PDF). Trascrivila fedelmente, senza inventare.
- Se la dieta è uguale ogni giorno, restituisci 1 solo giorno; se varia, fino a 7 giorni (lunedì→domenica).
- Per ogni pasto: slot tra ${SLOTS.join(', ')} ("spuntino" = metà mattina, "merenda" = pomeriggio), gli alimenti con i grammi indicati (se mancano, stima una porzione standard).
- Se ci sono alternative ("oppure", "in alternativa"), usa la PRIMA opzione e scrivi le altre in "alt".
- Note generali (acqua, integratori, indicazioni) in "notes".
Rispondi SOLO con JSON: {"days":[{"meals":[{"slot":"colazione","items":[${ITEM_SPEC}],"alt":"testo"}]}],"notes":"testo"}`,
    (r) => r as { days?: unknown; notes?: unknown },
    { prefer: 'flash', temperature: 0.1, label: 'Leggo la dieta…', ...opts },
    parts,
  );
  const daysRaw = (Array.isArray(raw.days) ? raw.days : []).slice(0, 7);
  const days: ImportedMeal[][] = [];
  for (const d of daysRaw) {
    const meals: ImportedMeal[] = [];
    for (const m of Array.isArray((d as { meals?: unknown })?.meals) ? (d as { meals: unknown[] }).meals : []) {
      const o = (m ?? {}) as Record<string, unknown>;
      const slot = oneOf(o.slot, SLOTS) ?? 'spuntino';
      const items = await resolveFoods(parseItems(o.items));
      if (items.length) meals.push({ slot, label: slot, items, alternatives: str(o.alt, 200) || undefined });
    }
    if (meals.length) days.push(meals);
  }
  if (!days.length) throw new Error('Non ho trovato pasti nel file: prova con una foto più nitida o il PDF');
  return { days, notes: str(raw.notes, 600) };
}

export const guessMacros = (items: FoodGuess[]): Macros => sumMacros(items.map((i) => macrosFor(i.per100, i.grams)));

const SLOT_ORDER: Record<SlotKey, number> = { colazione: 0, spuntino: 1, pranzo: 2, merenda: 3, cena: 4 };

/** Piano settimanale "fisso" (pasti liberi con macro calcolati): il planner non lo rigenera. */
export function dietToWeekPlan(diet: ImportedDiet): WeekPlan {
  const days = Array.from({ length: 7 }, (_, i) => diet.days[i % diet.days.length]);
  const toMeal = (m: ImportedMeal): PlannedMeal => {
    const macros = guessMacros(m.items);
    const name = m.items.map((i) => `${i.name} ${i.grams} g`).join(', ') + (m.alternatives ? ` (oppure: ${m.alternatives})` : '');
    return { slot: m.slot, kind: 'custom', name, fixed: macros, refId: 'nutrizionista', servings: 1, items: [], extras: [], macros };
  };
  const plan = days.map((meals) => ({ meals: [...meals].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]).map(toMeal) }));
  const kcal = plan.map((d) => d.meals.reduce((a, m) => a + m.macros.kcal, 0));
  return { createdAt: Date.now(), seed: 0, source: 'nutrizionista', targetKcal: Math.round(kcal.reduce((a, b) => a + b, 0) / 7), days: plan };
}

/* ---------- Scheda del personal trainer ---------- */

const GROUPS = ['Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Glutei', 'Polpacci', 'Core'] as const;

const tokens = (s: string) =>
  new Set(
    normalize(s)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !['with', 'the', 'con', 'alla', 'al', 'ai', 'di', 'a'].includes(w)),
  );

/** Candidati della libreria più simili a un nome (inglese o italiano), dal più simile. */
async function libraryRanker() {
  const lib = await loadLibrary().catch(() => []);
  const index = lib.map((ex) => ({ id: ex.id, name: NAME_IT[ex.id] ?? ex.n, en: tokens(ex.n), it: tokens(NAME_IT[ex.id] ?? '') }));
  const score = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return 0;
    let common = 0;
    a.forEach((w) => b.has(w) && common++);
    return common / Math.max(a.size, b.size);
  };
  const byId = new Map(lib.map((x) => [x.id, x]));
  return {
    byId,
    rank(it: string, en: string, n = 6) {
      const ti = tokens(it);
      const te = tokens(en);
      return index
        .map((x) => ({ id: x.id, name: x.name, s: Math.max(score(te, x.en), score(ti, x.it), score(ti, x.en) * 0.9) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, n);
    },
  };
}

/** Come è stato collegato un esercizio del PDF alla libreria. */
export interface ImportMatch {
  /** nome scritto nel PDF */
  pdf: string;
  /** ok = sicuro; dubbio = da verificare; none = non trovato (resta col nome del PDF) */
  confidence: 'ok' | 'dubbio' | 'none';
}

export async function importSchedule(files: File[], opts: AIOptions = {}): Promise<{ days: Day[]; unmatched: number; matches: Record<string, ImportMatch> }> {
  const parts = await Promise.all(files.map(fileToPart));
  const raw = await callAIJson(
    `Questa è una scheda di allenamento scritta da un personal trainer (foto o PDF). Trascrivila fedelmente, senza aggiungere o togliere esercizi.
Per ogni giorno: "name" (es. "Giorno A", "Lunedì"), "focus" (es. "Petto e tricipiti").
Per ogni esercizio: "it" = nome come scritto, "en" = nome standard inglese (es. "Barbell Bench Press"), "group" tra ${GROUPS.join(', ')},
"sets", "repMin", "repMax" (per "3x10" usa 10 e 10; per "8-12" usa 8 e 12; per tempo/cedimento stima), "rest" (es. "90 sec", "2 min"), "rir" (se indicato, altrimenti "1-2"), "notes" (tecnica, superserie, tempo di esecuzione).
Rispondi SOLO con JSON: {"days":[{"name":"","focus":"","exercises":[{"it":"","en":"","group":"","sets":3,"repMin":8,"repMax":12,"rest":"","rir":"","notes":""}]}]}`,
    (r) => r as { days?: unknown },
    { prefer: 'flash', temperature: 0.1, label: 'Leggo la scheda…', ...opts },
    parts,
  );
  const ranker = await libraryRanker();
  const rawDays = (Array.isArray(raw.days) ? raw.days : []).slice(0, 7).map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const exs = (Array.isArray(o.exercises) ? o.exercises : []).slice(0, 15).map((x, ei) => {
      const e = (x ?? {}) as Record<string, unknown>;
      const it = str(e.it, 80) || str(e.en, 80) || `Esercizio ${ei + 1}`;
      const en = str(e.en, 80);
      return { e, it, en, cands: ranker.rank(it, en) };
    });
    return { o, exs };
  });
  // 2° passaggio: l'AI sceglie l'esercizio giusto SOLO tra i candidati della libreria (non può inventare)
  const all = rawDays.flatMap((d) => d.exs);
  const unsure = all.filter((x) => x.cands.length && x.cands[0].s < 0.85);
  const chosen = new Map<(typeof all)[number], string | null>();
  if (unsure.length) {
    try {
      const pick = await callAIJson(
        `Collega ogni esercizio di una scheda di palestra all'esercizio GIUSTO della libreria, scegliendo SOLO tra le opzioni date (stesso movimento, stesso attrezzo, stessa inclinazione). Se nessuna opzione è lo stesso esercizio rispondi null.
${unsure.map((x, k) => `${k + 1}. "${x.it}"${x.en ? ` (${x.en})` : ''} → opzioni: ${x.cands.map((c) => `${c.id} = ${c.name}`).join(' | ')}`).join('\n')}
Rispondi SOLO con JSON: {"choices":[{"k":1,"id":"id scelto oppure null"}]}`,
        (r) => r as { choices?: unknown },
        { prefer: 'flash', temperature: 0, label: 'Collego gli esercizi alla libreria…', ...opts },
      );
      for (const c of Array.isArray(pick.choices) ? pick.choices : []) {
        const o = (c ?? {}) as Record<string, unknown>;
        const x = unsure[Number(o.k) - 1];
        if (!x) continue;
        const id = typeof o.id === 'string' && x.cands.some((cd) => cd.id === o.id) ? o.id : null;
        chosen.set(x, id);
      }
    } catch {
      /* senza il 2° passaggio si usa il candidato più simile, segnato come da verificare */
    }
  }
  let unmatched = 0;
  const matches: Record<string, ImportMatch> = {};
  const days: Day[] = rawDays.map(({ o, exs }, di) => {
    const exercises: Exercise[] = exs.map(({ e, it, cands }, ei, arr) => {
      const x = arr[ei];
      const best = cands[0];
      let libraryId: string | undefined;
      let confidence: ImportMatch['confidence'] = 'none';
      if (best && best.s >= 0.85) {
        libraryId = best.id;
        confidence = 'ok';
      } else if (chosen.has(x)) {
        const id = chosen.get(x);
        if (id) {
          libraryId = id;
          confidence = (cands.find((c) => c.id === id)?.s ?? 0) >= 0.4 ? 'ok' : 'dubbio';
        }
      } else if (best && best.s >= 0.5) {
        libraryId = best.id;
        confidence = 'dubbio';
      }
      if (!libraryId) unmatched++;
      const lib = libraryId ? ranker.byId.get(libraryId) : undefined;
      const id = `p${di + 1}e${ei + 1}`;
      matches[id] = { pdf: it, confidence };
      const repMin = Math.round(num(e.repMin, 1, 100) ?? 8);
      const libName = lib ? (NAME_IT[lib.id] ?? lib.n) : '';
      const pdfName = it.charAt(0).toUpperCase() + it.slice(1);
      return {
        id,
        libraryId,
        // nome della libreria (così demo, istruzioni e storico combaciano); il nome del PDF resta nelle note
        name: libName || pdfName,
        group: oneOf(e.group, GROUPS) ?? 'Core',
        sets: Math.round(num(e.sets, 1, 10) ?? 3),
        repMin,
        repMax: Math.max(repMin, Math.round(num(e.repMax, 1, 100) ?? repMin)),
        rirTarget: str(e.rir, 10) || '1-2',
        rest: str(e.rest, 20) || '90 sec',
        notes: [libName && normalize(libName) !== normalize(it) ? `Nel PDF: ${pdfName}` : '', str(e.notes, 200)].filter(Boolean).join(' · ') || undefined,
      };
    });
    return { id: `day${di + 1}`, order: di + 1, name: str(o.name, 30) || `Day ${di + 1}`, subtitle: str(o.focus, 50) || `Giorno ${di + 1}`, exercises };
  });
  const valid = days.filter((d) => d.exercises.length);
  if (!valid.length) throw new Error('Non ho trovato esercizi nel file: prova con una foto più nitida o il PDF');
  return { days: valid.map((d, i) => ({ ...d, id: `day${i + 1}`, order: i + 1 })), unmatched, matches };
}

