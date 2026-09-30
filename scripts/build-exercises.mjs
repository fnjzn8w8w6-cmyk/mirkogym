// Scarica free-exercise-db (pubblico dominio, Unlicense) e genera public/exercises.json compatto.
// Uso: npm run exercises
// Fonte: https://github.com/yuhonas/free-exercise-db
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'exercises.json');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`Download fallito: ${res.status}`);
const data = await res.json();

// Formato compatto: chiavi corte per ridurre il peso del file
const compact = data.map((e) => ({
  id: e.id,
  n: e.name,
  p: e.primaryMuscles,
  s: e.secondaryMuscles,
  e: e.equipment ?? 'other',
  c: e.category,
  l: e.level,
  k: e.mechanic ?? undefined,
  f: e.force ?? undefined,
  i: e.instructions,
  g: e.images.length,
}));

await writeFile(out, JSON.stringify(compact));
console.log(`✓ ${compact.length} esercizi → public/exercises.json`);
