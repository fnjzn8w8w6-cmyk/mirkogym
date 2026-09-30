// Scarica "UniTools World Recipes" (CC BY-SA 4.0, credit: UniTools — theunitools.com)
// e genera public/recipes.json compatto (solo inglese, per il peso).
// Uso: npm run recipes
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = [
  'https://theunitools.com/data/unitools-recipes-v1.json',
  'https://raw.githubusercontent.com/farcrak/unitools-recipes/main/unitools-recipes-v1.json',
];
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'recipes.json');

let data = null;
for (const url of SOURCES) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      data = await res.json();
      break;
    }
  } catch {
    /* prova la fonte successiva */
  }
}
if (!data) throw new Error('Download del dataset ricette non riuscito');

const en = (o) => (o && typeof o === 'object' ? (o.en ?? '') : (o ?? ''));
const recipes = data.recipes
  .filter((r) => r.nutritionPerServing?.calories > 0)
  .map((r) => ({
    id: r.slug,
    n: en(r.name),
    nn: r.nativeName ?? undefined,
    s: en(r.summary),
    co: r.country,
    c: r.category,
    d: r.diets,
    df: r.difficulty,
    sv: r.baseServings,
    t: (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
    k: [r.nutritionPerServing.calories, r.nutritionPerServing.protein, r.nutritionPerServing.carbs, r.nutritionPerServing.fat],
    i: r.ingredients.map((x) => [x.id, en(x.name), x.quantity ?? null, x.unit ?? '', x.scaling ?? 'linear', en(x.note) || undefined]),
    st: r.steps.map((x) => [en(x.text), x.minutes ?? 0]),
    ph: r.photo ? [r.photo.url, r.photo.author ?? '', r.photo.license ?? ''] : null,
  }));

await writeFile(
  out,
  JSON.stringify({ license: data.license, attribution: data.attribution, source: data.landingPage, version: data.version, recipes }),
);
console.log(`✓ ${recipes.length} ricette → public/recipes.json`);
