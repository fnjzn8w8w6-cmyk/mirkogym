/**
 * Corpo nelle foto, riconosciuto sul telefono (MediaPipe, gratis, le foto non escono dal telefono):
 * - posizione di spalle e anche → stessa grandezza e posizione del corpo in tutte le foto;
 * - sagoma del corpo → sfondo neutro al posto della stanza.
 * I modelli (~30 MB) si scaricano solo la prima volta che servono, poi restano sul telefono.
 */
import type { BodyPoints } from '@/types';
import { loadImage } from './share-card';

const VERSION = '0.10.14';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';

export type PhotoBackground = 'orig' | 'dark' | 'light' | 'blur';

/** Versione del ritaglio: le foto analizzate con una versione più vecchia si rianalizzano. */
export const MASK_VERSION = 2;

export interface BodyResult {
  body: BodyPoints | null;
  /** sagoma (PNG) o niente se il corpo non si vede */
  mask?: string;
}

type Tools = { pose: import('@mediapipe/tasks-vision').PoseLandmarker; seg: import('@mediapipe/tasks-vision').ImageSegmenter };
let tools: Promise<Tools> | null = null;

function loadTools(): Promise<Tools> {
  if (!tools) {
    tools = (async () => {
      const mp = await import('@mediapipe/tasks-vision');
      const files = await mp.FilesetResolver.forVisionTasks(WASM);
      const [pose, seg] = await Promise.all([
        mp.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1 }),
        mp.ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ]);
      return { pose, seg };
    })();
    // se non riesce (es. senza connessione) la prossima volta si riprova
    tools.catch(() => (tools = null));
  }
  return tools;
}

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// una foto alla volta: i modelli non sono rientranti
let queue: Promise<unknown> = Promise.resolve();

/** Media su un quadrato (2r+1)² per ogni punto, con l'immagine integrale (veloce anche a 1000 px). */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * Filtro guidato (He et al.): la sagoma grezza del modello (bassa risoluzione) segue i contorni veri della foto,
 * così il bordo non "sborda" sullo sfondo (niente alone chiaro intorno al corpo).
 */
function guidedFilter(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const Ip = new Float32Array(n);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mI = boxMean(I, w, h, r);
  const mP = boxMean(p, w, h, r);
  const mIp = boxMean(Ip, w, h, r);
  const mII = boxMean(II, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (mIp[i] - mI[i] * mP[i]) / (mII[i] - mI[i] * mI[i] + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxMean(a, w, h, r);
  const mB = boxMean(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
  return q;
}

/** Riconosce il corpo in una foto (data URL). */
export function analyseBody(src: string): Promise<BodyResult> {
  const run = async (): Promise<BodyResult> => {
    const { pose, seg } = await loadTools();
    const img = await loadImage(src);
    if (!img) throw new Error('Foto non leggibile');
    const L = pose.detect(img).landmarks[0];
    let body: BodyPoints | null = null;
    // spalle (11, 12) e anche (23, 24) devono essere nella foto
    if (L && [11, 12, 23, 24].every((i) => L[i] && (L[i].visibility ?? 1) > 0.3)) {
      body = { sx: (L[11].x + L[12].x) / 2, sy: (L[11].y + L[12].y) / 2, hx: (L[23].x + L[24].x) / 2, hy: (L[23].y + L[24].y) / 2 };
      if (Math.hypot(body.sx - body.hx, body.sy - body.hy) < 0.03) body = null;
    }
    const r = seg.segment(img);
    const m = r.confidenceMasks?.[0];
    let mask: string | undefined;
    if (m) {
      // canale 0 = sfondo: probabilità del corpo = 1 − sfondo, portata alla grandezza della foto
      const f = m.getAsFloat32Array();
      const raw = canvas(m.width, m.height);
      const rc = raw.getContext('2d')!;
      const rd = rc.createImageData(m.width, m.height);
      for (let i = 0; i < f.length; i++) rd.data[i * 4 + 3] = Math.round((1 - f[i]) * 255);
      rc.putImageData(rd, 0, 0);
      const w = img.width;
      const h = img.height;
      const big = canvas(w, h);
      const bc = big.getContext('2d', { willReadFrequently: true })!;
      bc.drawImage(raw, 0, 0, w, h);
      const pd = bc.getImageData(0, 0, w, h).data;
      bc.clearRect(0, 0, w, h);
      bc.drawImage(img, 0, 0, w, h);
      const id = bc.getImageData(0, 0, w, h).data;
      const n = w * h;
      const P = new Float32Array(n);
      const G = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        P[i] = pd[i * 4 + 3] / 255;
        G[i] = (0.299 * id[i * 4] + 0.587 * id[i * 4 + 1] + 0.114 * id[i * 4 + 2]) / 255;
      }
      const q = guidedFilter(G, P, w, h, Math.max(4, Math.round(Math.max(w, h) / 160)), 4e-3);
      const out = bc.createImageData(w, h);
      let on = 0;
      for (let i = 0; i < n; i++) {
        // la rifinitura vale solo vicino al contorno: lontano dal corpo niente "peli" presi da alberi o mobili
        const v = P[i] < 0.12 ? 0 : P[i] > 0.88 ? 1 : q[i];
        // un po' più stretta della sagoma grezza: meglio perdere un filo di bordo che prendere il muro
        const a = Math.min(1, Math.max(0, (v - 0.3) / 0.5));
        if (a > 0.5) on++;
        out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255;
        out.data[i * 4 + 3] = Math.round(a * 255);
      }
      if (on / n > 0.02) {
        bc.putImageData(out, 0, 0);
        mask = big.toDataURL('image/png');
      }
    }
    r.close();
    return { body, mask };
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

/** Dove mettere il corpo nell'immagine finale (in pixel): lunghezza del busto e centro del busto. */
export interface BodyTarget {
  torso: number;
  x: number;
  y: number;
}

/** Busto della foto (pixel) se la foto fosse disegnata a tutto riquadro w×h (come object-fit: cover). */
function coverTorso(img: { width: number; height: number }, b: BodyPoints, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const ox = (w - img.width * k) / 2;
  const oy = (h - img.height * k) / 2;
  const sx = ox + b.sx * img.width * k;
  const sy = oy + b.sy * img.height * k;
  const hx = ox + b.hx * img.width * k;
  const hy = oy + b.hy * img.height * k;
  return { torso: Math.hypot(sx - hx, sy - hy), x: (sx + hx) / 2, y: (sy + hy) / 2 };
}

/**
 * Per lo sfondo originale (più foto): la foto con il corpo più grande fa da riferimento (grandezza e posizione),
 * così le foto si ingrandiscono il meno possibile e restano quasi intere.
 */
export function groupTarget(items: { img: { width: number; height: number }; body: BodyPoints | null | undefined }[], w: number, h: number): BodyTarget | null {
  const t = items.filter((i) => i.body).map((i) => coverTorso(i.img, i.body!, w, h));
  if (!t.length) return null;
  // la foto più vicina resta com'è (nessun bordo da riempire), le altre si portano su di lei
  return t.reduce((a, b) => (b.torso > a.torso ? b : a));
}

/** Per il confronto: il corpo più grande dei due fa da riferimento, centrato in orizzontale. */
export function pairTarget(items: { img: { width: number; height: number }; body: BodyPoints | null | undefined }[], w: number, h: number): BodyTarget | null {
  const t = items.filter((i) => i.body).map((i) => coverTorso(i.img, i.body!, w, h));
  if (t.length < 2) return null;
  const ref = t.reduce((a, b) => (b.torso > a.torso ? b : a));
  return { torso: ref.torso, x: w / 2, y: ref.y };
}

/**
 * Riempie i buchi di un livello semitrasparente con i colori vicini (convoluzione normalizzata):
 * sfocato e poi ridisegnato su sé stesso finché è pieno, il colore resta quello della parte visibile.
 */
function fillFrom(layer: HTMLCanvasElement, blur: number): HTMLCanvasElement {
  const c = canvas(layer.width, layer.height);
  const x = c.getContext('2d')!;
  x.filter = `blur(${blur}px)`;
  x.drawImage(layer, 0, 0);
  x.filter = 'none';
  for (let i = 0; i < 7; i++) x.drawImage(c, 0, 0);
  return c;
}

/** Colore medio di un livello (per dare allo sfondo la luce della foto). */
function meanColor(layer: HTMLCanvasElement): [number, number, number] {
  const c = canvas(1, 1);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(layer, 0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return d[3] ? [d[0], d[1], d[2]] : [40, 44, 42];
}

// grana fotografica (uguale su sfondo e corpo: lo sfondo non sembra più "disegnato")
let noise: HTMLCanvasElement | null = null;
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (!noise) {
    noise = canvas(256, 256);
    const x = noise.getContext('2d')!;
    const d = x.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 90;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.fillStyle = ctx.createPattern(noise, 'repeat')!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Sfondo da studio con la luce della foto: centro più chiaro, bordi scuri. */
function studio(ctx: CanvasRenderingContext2D, w: number, h: number, bg: 'dark' | 'light', tint: number[]) {
  const cx = w / 2;
  const cy = h * 0.4;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
  if (bg === 'dark') {
    g.addColorStop(0, rgb(mix([44, 47, 46], tint, 0.18)));
    g.addColorStop(0.55, rgb(mix([24, 26, 25], tint, 0.1)));
    g.addColorStop(1, rgb([9, 10, 10]));
  } else {
    g.addColorStop(0, rgb(mix([238, 240, 239], tint, 0.08)));
    g.addColorStop(0.6, rgb(mix([214, 218, 216], tint, 0.1)));
    g.addColorStop(1, rgb(mix([168, 173, 170], tint, 0.12)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Riquadro del corpo nella sagoma (frazioni 0…1), letto in piccolo. */
function maskBox(mask: HTMLImageElement) {
  const S = 64;
  const c = canvas(S, S);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(mask, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;
  let x0 = S;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < S; y++)
    for (let i = 0; i < S; i++)
      if (d[(y * S + i) * 4 + 3] > 128) {
        x0 = Math.min(x0, i);
        x1 = Math.max(x1, i);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x0: x0 / S, x1: (x1 + 1) / S, bottom: (y1 + 1) / S };
}

/**
 * Foto pronta w×h: corpo spostato e ingrandito su `target` (se c'è) e sfondo scelto.
 * Senza sagoma lo sfondo resta quello originale; senza corpo riconosciuto la foto non si sposta.
 */
export function composeBody(
  img: HTMLImageElement,
  info: { body?: BodyPoints | null; mask?: HTMLImageElement | null },
  opts: { w: number; h: number; bg: PhotoBackground; target?: BodyTarget | null },
): HTMLCanvasElement {
  const { w, h } = opts;
  const out = canvas(w, h);
  const ctx = out.getContext('2d')!;
  // trasformazione: allineata sul busto, altrimenti a tutto riquadro
  let k = Math.max(w / img.width, h / img.height);
  let dx = (w - img.width * k) / 2;
  let dy = (h - img.height * k) / 2;
  const aligned = !!(opts.target && info.body);
  if (aligned) {
    const b = info.body!;
    const torso = Math.hypot((b.sx - b.hx) * img.width, (b.sy - b.hy) * img.height);
    k = opts.target!.torso / torso;
    dx = opts.target!.x - k * ((b.sx + b.hx) / 2) * img.width;
    dy = opts.target!.y - k * ((b.sy + b.hy) / 2) * img.height;
  }
  const bg = opts.bg !== 'orig' && info.mask ? opts.bg : 'orig';
  if (bg === 'orig') {
    if (aligned) {
      // dove la foto spostata non arriva: la stessa foto sfocata
      ctx.filter = 'blur(28px) brightness(0.75)';
      const c = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * c) / 2 - 40, (h - img.height * c) / 2 - 40, img.width * c + 80, img.height * c + 80);
      ctx.filter = 'none';
    }
    ctx.drawImage(img, dx, dy, img.width * k, img.height * k);
    return out;
  }
  const mask = info.mask!;
  const iw = img.width;
  const ih = img.height;
  // lavoro alla risoluzione della foto, poi si sposta tutto insieme
  const person = canvas(iw, ih);
  const pc = person.getContext('2d')!;
  pc.drawImage(img, 0, 0);
  pc.globalCompositeOperation = 'destination-in';
  pc.drawImage(mask, 0, 0, iw, ih);
  // bordo pulito: i punti di confine prendono il colore del corpo vicino, non quello del muro dietro
  const core = canvas(iw, ih);
  const cc = core.getContext('2d')!;
  cc.drawImage(person, 0, 0);
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(person, 0, 0); // alfa al quadrato: solo l'interno sicuro
  cc.drawImage(person, 0, 0);
  const inside = fillFrom(core, Math.max(2, Math.round(iw / 250)));
  const clean = canvas(iw, ih);
  const kc = clean.getContext('2d')!;
  kc.drawImage(inside, 0, 0);
  kc.drawImage(core, 0, 0);
  kc.globalCompositeOperation = 'destination-in';
  kc.drawImage(mask, 0, 0, iw, ih);
  // sfondo della stanza senza il corpo (per la luce dello sfondo e per lo sfocato)
  const room = canvas(iw, ih);
  const rc = room.getContext('2d')!;
  rc.drawImage(img, 0, 0);
  rc.globalCompositeOperation = 'destination-out';
  rc.filter = `blur(${Math.max(3, Math.round(iw / 120))}px)`;
  rc.drawImage(mask, 0, 0, iw, ih);
  rc.drawImage(mask, 0, 0, iw, ih);
  rc.filter = 'none';
  const tint = meanColor(room);

  if (bg === 'blur') {
    // effetto ritratto: la stanza vera, molto sfocata e un po' più scura
    // la stanza segue il corpo (stessa posizione e grandezza); dove non arriva, la stessa stanza a tutto riquadro
    const filled = fillFrom(room, Math.max(8, Math.round(iw / 40)));
    const c = Math.max(w / iw, h / ih);
    ctx.filter = `blur(${Math.round(Math.max(w, h) / 45)}px) brightness(0.62) saturate(0.85)`;
    ctx.drawImage(filled, (w - iw * c) / 2 - 40, (h - ih * c) / 2 - 40, iw * c + 80, ih * c + 80);
    ctx.drawImage(filled, dx, dy, iw * k, ih * k);
    ctx.filter = 'none';
    const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  } else studio(ctx, w, h, bg, tint);

  // ombra morbida a terra, se i piedi sono nella foto
  const box = maskBox(mask);
  if (box && box.bottom < 0.97 && bg !== 'blur') {
    const fx = dx + ((box.x0 + box.x1) / 2) * iw * k;
    const fy = dy + box.bottom * ih * k;
    const fw = (box.x1 - box.x0) * iw * k * 0.75;
    ctx.save();
    ctx.filter = `blur(${Math.round(fw / 10)}px)`;
    ctx.fillStyle = bg === 'dark' ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(fx, fy - fw * 0.02, fw / 2, fw * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const back = canvas(w, h);
  back.getContext('2d')!.drawImage(out, 0, 0);
  // corpo
  const layer = canvas(w, h);
  const lc = layer.getContext('2d')!;
  lc.drawImage(clean, dx, dy, iw * k, ih * k);
  // dove la foto taglia il corpo (di solito i piedi) sfuma invece di finire di netto
  const edge = dy + ih * k;
  if (edge < h + 2) {
    const g = lc.createLinearGradient(0, edge - h * 0.1, 0, edge);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    lc.globalCompositeOperation = 'destination-out';
    lc.fillStyle = g;
    lc.fillRect(0, edge - h * 0.1, w, h - edge + h * 0.1);
  }
  ctx.drawImage(layer, 0, 0);
  // un filo della luce dello sfondo sui bordi del corpo (come in una foto vera) e grana su tutto
  const wrap = canvas(w, h);
  const wc = wrap.getContext('2d')!;
  const wr = Math.max(2, Math.round(w / 300));
  wc.filter = `blur(${wr * 3}px)`;
  wc.drawImage(back, 0, 0);
  wc.globalCompositeOperation = 'destination-out';
  wc.filter = `blur(${wr}px)`;
  wc.drawImage(layer, 0, 0);
  wc.filter = 'none';
  wc.globalCompositeOperation = 'destination-in';
  wc.drawImage(layer, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(wrap, 0, 0);
  ctx.globalAlpha = 1;
  grain(ctx, w, h, bg === 'light' ? 0.05 : 0.08);
  return out;
}

/** Sagoma da sovrapporre alla fotocamera: contorno chiaro e riempimento leggero. */
export async function ghostFromMask(mask: string, width: number, height: number): Promise<string> {
  const m = await loadImage(mask);
  if (!m) throw new Error('Sagoma non leggibile');
  const base = canvas(width, height);
  base.getContext('2d')!.drawImage(m, 0, 0, width, height);
  const c = canvas(width, height);
  const x = c.getContext('2d')!;
  const r = Math.max(2, Math.round(width / 170));
  for (let a = 0; a < 16; a++) x.drawImage(base, Math.cos((a / 8) * Math.PI) * r, Math.sin((a / 8) * Math.PI) * r);
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(base, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 0.16;
  x.drawImage(base, 0, 0);
  return c.toDataURL('image/png');
}
