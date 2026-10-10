/**
 * Reel dei progressi: un video verticale (1080×1920) creato sul telefono con tutte le foto del giorno.
 * Scene: apertura → timelapse delle foto (giorno e peso) → confronto primo/ultimo giorno → numeri del percorso → logo.
 * Codifica con WebCodecs + mp4-muxer (gratis, niente server); se il telefono non la supporta si registra la tela.
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { ACCENT, DISPLAY, FONT, loadImage, roundRect } from './share-card';
import { brand, shadow } from './daily-card';
import { formatLongDate } from './date-utils';

const W = 1080;
const H = 1920;
const FPS = 30;

export interface ReelPhoto {
  date: string;
  /** giorno del percorso (1 = prima foto) */
  day: number;
  weight?: number | null;
}

export interface ReelSummary {
  days: number;
  workouts: number;
  sets: number;
  tonnage: number;
  weightFirst?: number | null;
  weightLast?: number | null;
  bfFirst?: number | null;
  bfLast?: number | null;
}

export interface ReelProgress {
  phase: 'foto' | 'video';
  /** 0…1 */
  value: number;
}

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));
const kg = (n: number) => `${n.toFixed(1).replace('.', ',').replace(',0', '')} kg`;
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1).replace('.', ',').replace(',0', '')} ${unit}`;

function coverRect(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const iw = img.width * k;
  const ih = img.height * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

/** Foto scelte per il timelapse: al massimo ~140 (sempre la prima e l'ultima), ognuna almeno 0,1 s. */
export function pickFrames<T>(list: T[], max = 140): T[] {
  if (list.length <= max) return list;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
  return out;
}

/** Durata delle scene in fotogrammi. */
function plan(n: number) {
  const per = Math.max(3, Math.min(12, Math.round((14 * FPS) / n)));
  return { intro: 2 * FPS, per, lapse: n * per, compare: Math.round(4.5 * FPS), summary: Math.round(4 * FPS), outro: Math.round(1.8 * FPS) };
}

export function reelSeconds(n: number): number {
  const p = plan(n);
  return Math.round((p.intro + p.lapse + p.compare + p.summary + p.outro) / FPS);
}

/** Codificatore: MP4 H.264 con WebCodecs se possibile, altrimenti registrazione della tela (MP4 su iPhone). */
async function pickEncoder(): Promise<{ codec: 'avc'; config: VideoEncoderConfig } | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const base = { width: W, height: H, bitrate: 6_000_000, framerate: FPS };
  // solo H.264: iPhone, Instagram e WhatsApp non leggono il VP9 dentro un MP4 (il video risulterebbe nero)
  for (const c of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
    const config: VideoEncoderConfig = { ...base, codec: c, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { codec: 'avc', config };
    } catch {
      /* prova il successivo */
    }
  }
  return null;
}

export async function renderReel(
  photos: ReelPhoto[],
  summary: ReelSummary,
  load: (date: string) => Promise<string | null>,
  onProgress: (p: ReelProgress) => void,
  isCancelled: () => boolean = () => false,
): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  await Promise.all([document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`700 40px ${FONT}`)].map((p) => p?.catch(() => undefined)));
  await document.fonts?.ready;
  const frames = pickFrames(photos);
  const P = plan(frames.length);
  const total = P.intro + P.lapse + P.compare + P.summary + P.outro;

  // foto caricate in anticipo (poche alla volta, per non riempire la memoria del telefono)
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  const get = (i: number) => {
    const f = frames[i];
    if (!f) return Promise.resolve(null);
    if (!cache.has(f.date)) cache.set(f.date, load(f.date).then((src) => (src ? loadImage(src) : null)));
    return cache.get(f.date)!;
  };
  const prefetch = (i: number) => {
    for (let k = i; k < Math.min(frames.length, i + 6); k++) void get(k);
  };
  const logo = await loadImage(`${import.meta.env.BASE_URL}icons/icon-512.png`);
  prefetch(0);
  const first = await get(0);
  const lastIdx = frames.length - 1;
  const last = await get(lastIdx);
  // la prima e l'ultima servono anche alla fine: restano in memoria
  const keep = new Set([frames[0].date, frames[lastIdx].date]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const range = `${formatLongDate(new Date(`${frames[0].date}T12:00:00`))} → ${formatLongDate(new Date(`${frames[lastIdx].date}T12:00:00`))}`;

  const black = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  };
  const veil = (a: number) => {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, W, H);
  };
  const text = (t: string, x: number, y: number, font: string, color = '#FAFAFA', align: CanvasTextAlign = 'center', spacing = 0) => {
    ctx.textAlign = align;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(t, x, y);
    ctx.letterSpacing = '0px';
  };

  // ---- scene ----
  const drawIntro = (f: number) => {
    black();
    if (first) coverRect(ctx, first, 0, 0, W, H);
    veil(0.62);
    const a = ease(f / (FPS * 0.6));
    ctx.globalAlpha = a;
    shadow(ctx, true);
    text('IL MIO PERCORSO', W / 2, 800, `800 34px ${FONT}`, ACCENT, 'center', 10);
    text(`${summary.days} ${summary.days === 1 ? 'GIORNO' : 'GIORNI'}`, W / 2, 960, `800 190px ${DISPLAY}`);
    text(range, W / 2, 1040, `600 32px ${FONT}`, 'rgba(250,250,250,0.85)');
    shadow(ctx, false);
    ctx.globalAlpha = 1;
  };

  let shown: HTMLImageElement | null = null;
  const drawLapse = (i: number, f: number) => {
    black();
    if (shown) coverRect(ctx, shown, 0, 0, W, H);
    const p = frames[i];
    // colonna a sinistra come nella foto del giorno
    const cx = 64 + 110;
    shadow(ctx, true);
    text(`GIORNO ${p.day}`, cx, 150, `800 64px ${DISPLAY}`);
    if (p.weight) {
      text('Peso', cx, 215, `600 20px ${FONT}`, 'rgba(250,250,250,0.7)');
      text(kg(p.weight), cx, 255, `700 36px ${FONT}`);
    }
    shadow(ctx, false);
    // barra di avanzamento del percorso
    const prog = (i + f / P.per) / frames.length;
    roundRect(ctx, 64, H - 110, W - 128, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
    roundRect(ctx, 64, H - 110, Math.max(8, (W - 128) * prog), 8, 4);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    brand(ctx, logo, W - 64, H - 280, 64, 'right');
  };

  const drawCompare = (f: number) => {
    black();
    const glow = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 1100);
    glow.addColorStop(0, 'rgba(61,220,132,0.16)');
    glow.addColorStop(1, 'rgba(61,220,132,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // le due foto intere, affiancate, che entrano dai lati
    const gap = 24;
    const bw = (W - 64 * 2 - gap) / 2;
    const box = (img: HTMLImageElement | null) => (img ? Math.min(1180, bw * (img.height / img.width)) : bw * 1.33);
    const bh = Math.max(box(first), box(last));
    const by = (H - bh) / 2 + 20;
    const slide = 1 - ease(f / (FPS * 0.7));
    const panel = (img: HTMLImageElement | null, x: number) => {
      ctx.save();
      roundRect(ctx, x, by, bw, bh, 28);
      ctx.clip();
      ctx.fillStyle = '#111';
      ctx.fillRect(x, by, bw, bh);
      if (img) coverRect(ctx, img, x, by, bw, bh);
      ctx.restore();
    };
    panel(first, 64 - slide * (W / 2));
    panel(last, 64 + bw + gap + slide * (W / 2));
    const a = ease((f - FPS * 0.6) / (FPS * 0.5));
    ctx.globalAlpha = a;
    const lx = 64 + bw / 2;
    const rx = 64 + bw + gap + bw / 2;
    const ty = by - 150;
    text('PRIMA', lx, ty, `800 28px ${FONT}`, ACCENT, 'center', 8);
    text(`GIORNO ${frames[0].day}`, lx, ty + 66, `800 58px ${DISPLAY}`);
    if (summary.weightFirst) text(kg(summary.weightFirst), lx, ty + 112, `700 32px ${FONT}`, 'rgba(250,250,250,0.85)');
    text('DOPO', rx, ty, `800 28px ${FONT}`, ACCENT, 'center', 8);
    text(`GIORNO ${frames[lastIdx].day}`, rx, ty + 66, `800 58px ${DISPLAY}`);
    if (summary.weightLast) text(kg(summary.weightLast), rx, ty + 112, `700 32px ${FONT}`, 'rgba(250,250,250,0.85)');
    // cambiamento del peso sotto le foto
    if (summary.weightFirst && summary.weightLast) {
      const label = signed(summary.weightLast - summary.weightFirst, 'kg');
      ctx.font = `800 64px ${DISPLAY}`;
      const tw = ctx.measureText(label).width + 80;
      const py = Math.min(H - 170, by + bh + 40);
      roundRect(ctx, (W - tw) / 2, py, tw, 104, 52);
      ctx.fillStyle = 'rgba(10,12,11,0.85)';
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3;
      ctx.stroke();
      text(label, W / 2, py + 74, `800 64px ${DISPLAY}`, ACCENT);
    }
    ctx.globalAlpha = 1;
  };

  const rows: [string, string][] = [
    ['Giorni', String(summary.days)],
    ['Allenamenti', String(summary.workouts)],
    ['Serie', summary.sets.toLocaleString('it-IT')],
    ['Kg sollevati', Math.round(summary.tonnage).toLocaleString('it-IT')],
    ...(summary.weightFirst && summary.weightLast ? ([['Peso', signed(summary.weightLast - summary.weightFirst, 'kg')]] as [string, string][]) : []),
    ...(summary.bfFirst != null && summary.bfLast != null ? ([['Massa grassa', signed(summary.bfLast - summary.bfFirst, '%')]] as [string, string][]) : []),
  ];
  const drawSummary = (f: number) => {
    black();
    if (last) coverRect(ctx, last, 0, 0, W, H);
    veil(0.82);
    text('IL PERCORSO IN NUMERI', W / 2, 380, `800 32px ${FONT}`, ACCENT, 'center', 8);
    const step = (FPS * 2.4) / rows.length;
    rows.forEach(([l, v], i) => {
      const a = ease((f - i * step) / (FPS * 0.35));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      const y = 540 + i * 178 + (1 - a) * 30;
      text(v, W / 2, y, `800 100px ${DISPLAY}`);
      text(l.toUpperCase(), W / 2, y + 50, `700 24px ${FONT}`, 'rgba(250,250,250,0.6)', 'center', 4);
    });
    ctx.globalAlpha = 1;
  };

  const drawOutro = (f: number) => {
    black();
    const a = ease(f / (FPS * 0.5));
    ctx.globalAlpha = a;
    brand(ctx, logo, W / 2, H / 2 - 150, 200, 'center');
    ctx.globalAlpha = 1;
  };

  // ---- codifica ----
  const enc = await pickEncoder();
  let draw: (n: number) => Promise<void>;
  let lapseIdx = -1;
  draw = async (n: number) => {
    if (n < P.intro) return drawIntro(n);
    n -= P.intro;
    if (n < P.lapse) {
      const i = Math.floor(n / P.per);
      if (i !== lapseIdx) {
        lapseIdx = i;
        prefetch(i + 1);
        shown = await get(i);
        // libera le foto già passate (tranne la prima e l'ultima)
        const prev = frames[i - 1];
        if (prev && !keep.has(prev.date)) cache.delete(prev.date);
      }
      return drawLapse(i, n % P.per);
    }
    n -= P.lapse;
    if (n < P.compare) return drawCompare(n);
    n -= P.compare;
    if (n < P.summary) return drawSummary(n);
    return drawOutro(n - P.summary);
  };

  if (enc) {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: enc.codec, width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
    let failure: unknown = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
    encoder.configure(enc.config);
    for (let n = 0; n < total; n++) {
      if (isCancelled()) throw new Error('Annullato');
      if (failure) throw failure;
      await draw(n);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: n % (FPS * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
      if (n % 10 === 0) onProgress({ phase: 'video', value: n / total });
    }
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    onProgress({ phase: 'video', value: 1 });
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  }

  // riserva: registrazione in tempo reale della tela
  // MP4 solo se dichiaratamente H.264 (alcuni browser mettono VP9 nell'MP4 e iPhone/Instagram lo vedono nero)
  const mime = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const t0 = performance.now();
  for (let n = 0; n < total; n++) {
    if (isCancelled()) {
      rec.stop();
      throw new Error('Annullato');
    }
    await draw(n);
    const wait = t0 + ((n + 1) * 1000) / FPS - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (n % 10 === 0) onProgress({ phase: 'video', value: n / total });
  }
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const type = mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
  return { blob: new Blob(parts, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}
