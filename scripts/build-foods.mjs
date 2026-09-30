/**
 * Genera public/foods.json: alimenti base in italiano con valori per 100 g da USDA FoodData Central
 * (SR Legacy / Foundation, pubblico dominio), letti dal database "starter" di CodeJetNet/food-data.
 *   node scripts/build-foods.mjs            (scarica il database)
 *   FOODS_DB=path/foods-starter.db node scripts/build-foods.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FOODS_IT } from './foods-it.mjs';

let dbPath = process.env.FOODS_DB;
if (!dbPath) {
  const dir = join(tmpdir(), 'mirkogym-foods');
  mkdirSync(dir, { recursive: true });
  const manifest = await (await fetch('https://github.com/CodeJetNet/food-data/releases/latest/download/manifest.json')).json();
  const file = manifest.files.find((f) => f.country === 'starter');
  const zip = join(dir, 'starter.zip');
  writeFileSync(zip, Buffer.from(await (await fetch(file.url)).arrayBuffer()));
  execFileSync('unzip', ['-o', zip, '-d', dir]);
  dbPath = join(dir, 'foods-starter.db');
}
if (!existsSync(dbPath)) throw new Error(`Database non trovato: ${dbPath}`);
const db = new DatabaseSync(dbPath);
const q = db.prepare(
  "select name, source, source_id, n1008 k, n1003 p, n1005 c, n1004 f, n1079 fib from foods where name like ? and source like 'usda%' order by case source when 'usda_sr' then 0 when 'usda_foundation' then 1 else 2 end, length(name) limit 1",
);
const r1 = (v) => Math.round(v * 10) / 10;
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const foods = [];
for (const [name, ref, cat, unit, kw] of FOODS_IT) {
  let v;
  let src;
  if (typeof ref === 'string') {
    const row = q.get(`${ref}%`);
    if (!row) throw new Error(`Voce USDA non trovata per ${name}: ${ref}`);
    v = { kcal: row.k, p: row.p, c: row.c, f: row.f, fib: row.fib ?? 0 };
    src = `USDA ${row.source_id}`;
  } else {
    v = { ...ref, fib: 0 };
    src = 'valori medi';
  }
  const calc = v.p * 4 + v.c * 4 + v.f * 9;
  if (v.kcal > 40 && Math.abs(calc - v.kcal) / v.kcal > 0.2 && !/Vino|Birra/.test(name)) console.warn(`⚠ kcal incoerenti per ${name}: ${v.kcal} vs ${Math.round(calc)}`);
  foods.push({ id: slug(name), n: name, cat, k: Math.round(v.kcal), p: r1(v.p), c: r1(v.c), f: r1(v.f), fb: r1(v.fib), u: unit || 0, kw: kw || '', src });
}
writeFileSync(
  new URL('../public/foods.json', import.meta.url),
  JSON.stringify({
    license: 'Public domain (USDA FoodData Central)',
    attribution: 'USDA FoodData Central (pubblico dominio) — via CodeJetNet/food-data',
    foods,
  }),
);
console.log(`foods.json: ${foods.length} alimenti`);
