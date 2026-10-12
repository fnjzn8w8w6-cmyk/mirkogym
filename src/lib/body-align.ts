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

export type PhotoBackground = 'orig' | 'dark' | 'light';

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

/** Lato lungo della sagoma salvata: piccola (pochi KB), si ingrandisce con i bordi ammorbiditi. */
const MASK_SIDE = 480;

// una foto alla volta: i modelli non sono rientranti
let queue: Promise<unknown> = Promise.resolve();

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
      // canale 0 = sfondo: la sagoma è tutto il resto, con un passaggio morbido sui bordi
      const f = m.getAsFloat32Array();
      const full = canvas(m.width, m.height);
      const fc = full.getContext('2d')!;
      const id = fc.createImageData(m.width, m.height);
      let on = 0;
      for (let i = 0; i < f.length; i++) {
        const p = Math.min(1, Math.max(0, (1 - f[i] - 0.25) / 0.5));
        if (p > 0.5) on++;
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255;
        id.data[i * 4 + 3] = Math.round(p * 255);
      }
      fc.putImageData(id, 0, 0);
      if (on / f.length > 0.02) {
        const k = Math.min(1, MASK_SIDE / Math.max(m.width, m.height));
        const small = canvas(Math.round(m.width * k), Math.round(m.height * k));
        small.getContext('2d')!.drawImage(full, 0, 0, small.width, small.height);
        mask = small.toDataURL('image/png');
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

/** Per il confronto: il corpo più grande dei due fa da riferimento, centrato in orizzontale. */
export function pairTarget(items: { img: { width: number; height: number }; body: BodyPoints | null | undefined }[], w: number, h: number): BodyTarget | null {
  const t = items.filter((i) => i.body).map((i) => coverTorso(i.img, i.body!, w, h));
  if (t.length < 2) return null;
  const ref = t.reduce((a, b) => (b.torso > a.torso ? b : a));
  return { torso: ref.torso, x: w / 2, y: ref.y };
}

function background(ctx: CanvasRenderingContext2D, w: number, h: number, bg: 'dark' | 'light') {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.75);
  g.addColorStop(0, bg === 'dark' ? '#2b302e' : '#f1f3f2');
  g.addColorStop(1, bg === 'dark' ? '#0f1110' : '#c9cecb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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
  background(ctx, w, h, bg);
  // corpo ritagliato con la sagoma (bordi ammorbiditi)
  const layer = canvas(w, h);
  const lc = layer.getContext('2d')!;
  lc.drawImage(img, dx, dy, img.width * k, img.height * k);
  lc.globalCompositeOperation = 'destination-in';
  lc.filter = `blur(${Math.max(1, Math.round(k * 1.5))}px)`;
  lc.drawImage(info.mask!, dx, dy, img.width * k, img.height * k);
  lc.filter = 'none';
  // dove la foto taglia il corpo (di solito i piedi) sfuma invece di finire di netto
  const edge = dy + img.height * k;
  if (edge < h + 2) {
    const g = lc.createLinearGradient(0, edge - h * 0.1, 0, edge);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    lc.globalCompositeOperation = 'destination-out';
    lc.fillStyle = g;
    lc.fillRect(0, edge - h * 0.1, w, h - edge + h * 0.1);
  }
  ctx.drawImage(layer, 0, 0);
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
