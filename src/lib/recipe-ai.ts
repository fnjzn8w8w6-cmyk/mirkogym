import { callAIJson, str, strArr, type AIOptions } from './ai';
import { ingredientIt, type Recipe } from './recipes';

/**
 * Traduzione in italiano di una ricetta (nome, descrizione, ingredienti, passaggi) con Gemini Lite.
 * Una sola richiesta per ricetta: il risultato resta salvato sul dispositivo.
 */

export interface RecipeIt {
  name: string;
  summary: string;
  ingredients: string[];
  steps: string[];
}

const KEY = 'mirkogym.recipeIt';

function readCache(): Record<string, RecipeIt> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, RecipeIt>;
  } catch {
    return {};
  }
}

export const cachedTranslation = (id: string): RecipeIt | null => readCache()[id] ?? null;

function save(id: string, t: RecipeIt): void {
  const map = readCache();
  map[id] = t;
  // al massimo 80 ricette tradotte in memoria (le più vecchie vengono scartate)
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete map[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignorato */
  }
}

export async function translateRecipe(r: Recipe, opts: AIOptions = {}): Promise<RecipeIt> {
  const hit = cachedTranslation(r.id);
  if (hit) return hit;
  const ingredients = r.i.map(([, name, q, unit, , note]) => `${q ?? ''} ${unit === 'toTaste' ? 'to taste' : unit} ${name}${note ? ` (${note})` : ''}`.trim());
  const prompt = `Traduci in italiano questa ricetta, in modo naturale e chiaro per un italiano che cucina a casa. Mantieni quantità e unità (converti "tbsp" in "cucchiai", "tsp" in "cucchiaini", "piece" in "pz", "to taste" in "q.b."). Non aggiungere né togliere passaggi o ingredienti.
Nome: ${r.n}
Descrizione: ${r.s}
Ingredienti:
${ingredients.map((x) => `- ${x}`).join('\n')}
Passaggi:
${r.st.map(([t], i) => `${i + 1}. ${t}`).join('\n')}

Rispondi SOLO con JSON: {"name": "...", "summary": "...", "ingredients": ["..."], "steps": ["..."]} con lo stesso numero di ingredienti (${r.i.length}) e passaggi (${r.st.length}).`;

  const t = await callAIJson(
    prompt,
    (raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const steps = strArr(o.steps, 40, 1200);
      const ings = strArr(o.ingredients, 60, 200);
      if (steps.length < Math.max(1, r.st.length - 1)) throw new Error('Traduzione incompleta, riprova');
      return {
        name: str(o.name, 120) || r.n,
        summary: str(o.summary, 600),
        ingredients: ings.length >= r.i.length - 1 ? ings : r.i.map((x) => ingredientIt(x[1])),
        steps,
      };
    },
    { temperature: 0.2, label: 'Traduco la ricetta…', prefer: 'lite', ...opts },
  );
  save(r.id, t);
  return t;
}
