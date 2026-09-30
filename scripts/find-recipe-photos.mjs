/**
 * Cerca foto COERENTI per le ricette italiane (eseguito da GitHub Actions: serve internet).
 *  1. Ricette da Wikibooks: l'immagine della pagina stessa della ricetta.
 *  2. Altre ricette: l'immagine principale della voce di Wikipedia con lo stesso titolo,
 *     accettata solo se la voce descrive un piatto/alimento.
 * Solo immagini con licenza libera (CC / pubblico dominio) da Wikimedia Commons.
 * Scarica le miniature in public/recipe-img/<id>.jpg, scrive scripts/recipe-photos.json e
 * fogli di controllo (review/photos-N.jpg) da verificare a occhio. Le foto scartate dopo il
 * controllo vanno in scripts/recipe-photos-reject.json e non vengono più proposte.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const UA = 'MirkoGym/1.0 (https://github.com/fnjzn8w8w6-cmyk/mirkogym; recipe photo finder)';
const root = new URL('../', import.meta.url);
const { recipes } = JSON.parse(readFileSync(new URL('public/ricette.json', root), 'utf8'));
const rejectPath = new URL('scripts/recipe-photos-reject.json', root);
const reject = new Set(existsSync(rejectPath) ? JSON.parse(readFileSync(rejectPath, 'utf8')) : []);
const outPath = new URL('scripts/recipe-photos.json', root);
const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
const imgDir = new URL('public/recipe-img/', root);
mkdirSync(imgDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch {
      /* riprova */
    }
    await sleep(1000 * (i + 1));
  }
  return null;
}

const FOOD = /piatt|ricett|dolc|past[ae]|zupp|minestr|cucina|pietanz|salsa|sugo|tort[ae]|biscott|formaggi|pane|specialit|gastronom|antipast|contorn|risott|focacc|preparazion|condiment|frittat|polpett|dessert|alimento|cibo|vivand|insalat|crema|budin|brodo|stufat/i;
const FREE = /^(cc|public domain|pd|cc0)/i;

/** Metadati dell'immagine (i wiki vedono anche i file di Commons): URL miniatura, autore, licenza. */
async function commonsInfo(file, host = 'commons.wikimedia.org') {
  const j = await getJson(
    `https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480&titles=${encodeURIComponent(`File:${file}`)}`,
  );
  const page = j && Object.values(j.query?.pages ?? {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  const license = m.LicenseShortName?.value ?? '';
  if (!FREE.test(license)) return null;
  const author = (m.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 80) || 'Wikimedia Commons';
  return { thumb: ii.thumburl, author, license, source: ii.descriptionurl };
}

async function wikibooksImage(r) {
  if (!r.src?.[1]?.includes('wikibooks.org')) return null;
  const title = decodeURIComponent(r.src[1].split('/wiki/')[1] ?? '');
  if (!title) return null;
  const j = await getJson(`https://it.wikibooks.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`);
  const name = j && Object.values(j.query?.pages ?? {})[0]?.pageimage;
  return name ? { file: name, via: 'wikibooks', host: 'it.wikibooks.org' } : null;
}

/** Wikipedia: pagina con lo stesso titolo della ricetta (anche tramite redirect), a blocchi di 50 titoli. */
const wikiCache = new Map();
const why = { nopage: 0, noimage: 0, notfood: 0, nolicense: 0 };
async function prefetchWikipedia(list) {
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const j = await getJson(
      `https://it.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages|description|extracts&piprop=name&exintro=1&explaintext=1&exchars=400&exlimit=50&titles=${encodeURIComponent(chunk.map((r) => r.t).join('|'))}`,
    );
    if (!j) {
      console.log('Wikipedia: richiesta fallita per il blocco', i);
      continue;
    }
    const norm = new Map((j.query?.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((j.query?.redirects ?? []).map((n) => [n.from, n.to]));
    const pages = new Map((j.query?.pages ?? []).map((p) => [p.title, p]));
    for (const r of chunk) {
      let t = norm.get(r.t) ?? r.t;
      t = redir.get(t) ?? t;
      wikiCache.set(r.id, pages.get(t) ?? null);
    }
    await sleep(200);
  }
}
async function wikipediaImage(r) {
  const p = wikiCache.get(r.id);
  if (!p || p.missing || p.invalid) {
    why.nopage++;
    return null;
  }
  if (!p.pageimage) {
    why.noimage++;
    return null;
  }
  const text = `${p.description ?? ''} ${p.extract ?? ''}`;
  if (!FOOD.test(text)) {
    why.notfood++;
    if (why.notfood <= 15) console.log(`  scartata (non è un piatto): ${r.t} → ${p.title}: ${text.slice(0, 90)}`);
    return null;
  }
  return { file: p.pageimage, via: 'wikipedia', host: 'it.wikipedia.org', page: `https://it.wikipedia.org/wiki/${encodeURIComponent(p.title)}` };
}

await prefetchWikipedia(recipes.filter((r) => !reject.has(r.id)));
console.log(`Wikipedia: ${[...wikiCache.values()].filter(Boolean).length} pagine con lo stesso titolo`);
const found = {};
let n = 0;
for (const r of recipes) {
  n++;
  if (reject.has(r.id)) continue;
  if (previous[r.id] && existsSync(new URL(`${r.id}.jpg`, imgDir))) {
    found[r.id] = previous[r.id];
    continue;
  }
  const cand = (await wikibooksImage(r)) ?? (await wikipediaImage(r));
  if (!cand) continue;
  const info = await commonsInfo(cand.file, cand.host);
  if (!info?.thumb) {
    why.nolicense++;
    continue;
  }
  const img = await fetch(info.thumb, { headers: { 'User-Agent': UA } });
  if (!img.ok) continue;
  writeFileSync(new URL(`${r.id}.jpg`, imgDir), Buffer.from(await img.arrayBuffer()));
  found[r.id] = { file: `recipe-img/${r.id}.jpg`, author: info.author, license: info.license, source: info.source, via: cand.via };
  if (n % 50 === 0) console.log(`${n}/${recipes.length} · foto ${Object.keys(found).length}`);
  await sleep(150);
}
// rimuove immagini non più usate
for (const id of Object.keys(previous)) if (!found[id]) rmSync(new URL(`${id}.jpg`, imgDir), { force: true });
writeFileSync(outPath, `${JSON.stringify(found, null, 1)}\n`);
console.log(`Foto trovate: ${Object.keys(found).length} su ${recipes.length}`, why);

// Fogli di controllo: 30 foto per foglio con titolo e id
const reviewDir = new URL('review/', root);
rmSync(reviewDir, { recursive: true, force: true });
mkdirSync(reviewDir, { recursive: true });
const ids = Object.keys(found);
const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
for (let i = 0; i < ids.length; i += 30) {
  const args = [];
  for (const id of ids.slice(i, i + 30)) args.push('-label', `${id}\n${byId[id].t.slice(0, 34)}`, new URL(`${id}.jpg`, imgDir).pathname);
  execFileSync('montage', [...args, '-tile', '5x', '-geometry', '220x165+4+4', '-pointsize', '13', '-background', '#ffffff', new URL(`photos-${String(i / 30 + 1).padStart(2, '0')}.jpg`, reviewDir).pathname]);
}
console.log(`Fogli di controllo: ${Math.ceil(ids.length / 30)}`);
