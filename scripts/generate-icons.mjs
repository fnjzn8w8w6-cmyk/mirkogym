// Genera le icone PWA (192/512, maskable, apple-touch-icon, favicon.ico) con sharp.
// Uso: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const BG = '#0A0A0B';
const ACCENT = '#F97316';
const ACCENT_DARK = '#EA580C';

/**
 * Manubrio stilizzato arancione su sfondo scuro.
 * `padding` è la frazione di lato riservata alla safe-area (maskable = 0.2).
 */
function svg(size, { padding = 0.12, rounded = true } = {}) {
  const inner = size * (1 - padding * 2);
  const o = size * padding;
  const u = inner / 100; // unità di disegno su griglia 100x100
  const r = (x) => (o + x * u).toFixed(2);
  const s = (x) => (x * u).toFixed(2);
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FB923C"/>
      <stop offset="1" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.46}" fill="url(#glow)"/>
  <g transform="rotate(-30 ${size / 2} ${size / 2})" fill="url(#g)">
    <rect x="${r(22)}" y="${r(46)}" width="${s(56)}" height="${s(8)}" rx="${s(3)}"/>
    <rect x="${r(4)}" y="${r(36)}" width="${s(8)}" height="${s(28)}" rx="${s(3)}"/>
    <rect x="${r(12)}" y="${r(24)}" width="${s(11)}" height="${s(52)}" rx="${s(4)}"/>
    <rect x="${r(77)}" y="${r(24)}" width="${s(11)}" height="${s(52)}" rx="${s(4)}"/>
    <rect x="${r(88)}" y="${r(36)}" width="${s(8)}" height="${s(28)}" rx="${s(3)}"/>
  </g>
</svg>`;
}

const png = (size, opts) => sharp(Buffer.from(svg(size, opts))).png().toBuffer();

/** Crea un .ico multi-size contenente PNG (supportato da tutti i browser moderni). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const b = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, b);
    dir.writeUInt8(size >= 256 ? 0 : size, b + 1);
    dir.writeUInt8(0, b + 2);
    dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

async function main() {
  await mkdir(resolve(pub, 'icons'), { recursive: true });
  const out = async (file, buf) => {
    await writeFile(resolve(pub, file), buf);
    console.log('✓', file);
  };
  await out('icons/icon-192.png', await png(192));
  await out('icons/icon-512.png', await png(512));
  // Maskable: sfondo pieno (niente angoli arrotondati) + 20% di padding safe-area
  await out('icons/icon-maskable-192.png', await png(192, { padding: 0.2, rounded: false }));
  await out('icons/icon-maskable-512.png', await png(512, { padding: 0.2, rounded: false }));
  // iOS applica già la sua maschera: sfondo pieno
  await out('apple-touch-icon.png', await png(180, { padding: 0.14, rounded: false }));
  const sizes = [16, 32, 48];
  const favs = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size, { padding: 0.04 }) })));
  await out('favicon.ico', ico(favs));
  await writeFile(resolve(pub, 'icons/icon.svg'), svg(512));
  console.log('✓ icons/icon.svg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
