import type { ExerciseLog, Session } from '@/types';
import { formatKg, formatTonnage, sessionSetCount, sessionTonnage, topSet, workingSets } from './analytics';
import { formatDuration, formatLongDate } from './date-utils';

const W = 1080;
const H = 1920;
export const FONT = '"Inter Variable", Inter, system-ui, sans-serif';
export const DISPLAY = '"Saira Condensed", "Inter Variable", sans-serif';
export const ACCENT = '#3DDC84';
const GOLD = '#E8C25A';
// coppa (Phosphor "trophy" piena, viewBox 256)
const TROPHY =
  'M232 64h-24V48a8 8 0 0 0-8-8H56a8 8 0 0 0-8 8v16H24A16 16 0 0 0 8 80v16a40 40 0 0 0 40 40h3.65A80.13 80.13 0 0 0 120 191.61V216H96a8 8 0 0 0 0 16h64a8 8 0 0 0 0-16h-24v-24.42c31.94-3.23 58.44-25.64 68.08-55.58H208a40 40 0 0 0 40-40V80a16 16 0 0 0-16-16M48 120a24 24 0 0 1-24-24V80h24v32q0 4 .39 8Zm184-24a24 24 0 0 1-24 24h-.5a82 82 0 0 0 .5-8.9V80h24Z';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trophy(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(TROPHY));
  ctx.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Taglia il testo con "…" finché sta nella larghezza. */
export function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Testo del titolo: rimpicciolisce il font finché ci sta in una riga. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, min: number) {
  let sz = size;
  for (; sz > min; sz -= 4) {
    ctx.font = `800 ${sz}px ${DISPLAY}`;
    if (ctx.measureText(text).width <= max) break;
  }
  return sz;
}

/** Disegna l'immagine riepilogativa dell'allenamento (1080×1920, formato storia Instagram). */
export async function renderShareCard(
  s: Session,
  title: string,
  _subtitle: string,
  nameOf: (l: ExerciseLog) => string,
): Promise<Blob> {
  await Promise.all([document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`700 40px ${FONT}`)].map((p) => p?.catch(() => undefined)));
  await document.fonts?.ready;
  const logo = await loadImage(`${import.meta.env.BASE_URL}icons/icon-512.png`);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  const pad = 72;

  // sfondo nero con bagliore verde dietro al logo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 560, 40, W / 2, 560, 900);
  g.addColorStop(0, 'rgba(61,220,132,0.30)');
  g.addColorStop(1, 'rgba(61,220,132,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#A7B0AB';
  ctx.font = `600 30px ${FONT}`;
  ctx.letterSpacing = '6px';
  ctx.fillText(formatLongDate(s.date).toUpperCase(), W / 2, 120);
  ctx.letterSpacing = '0px';

  // logo grande con alone
  if (logo) {
    const L = 500;
    ctx.save();
    ctx.shadowColor = 'rgba(61,220,132,0.55)';
    ctx.shadowBlur = 90;
    roundRect(ctx, (W - L) / 2, 200, L, L, L * 0.22);
    ctx.clip();
    ctx.drawImage(logo, (W - L) / 2, 200, L, L);
    ctx.restore();
  }

  // titolo + "allenamento completato"
  const t = title.toUpperCase();
  const tsz = fitFont(ctx, t, W - pad * 2, 150, 80);
  ctx.fillStyle = '#FAFAFA';
  ctx.font = `800 ${tsz}px ${DISPLAY}`;
  ctx.fillText(t, W / 2, 900);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 30px ${FONT}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('ALLENAMENTO COMPLETATO', W / 2, 970);
  ctx.letterSpacing = '0px';

  // tre riquadri: volume, durata, serie
  const tiles: [string, string][] = [
    [formatTonnage(sessionTonnage(s)).toUpperCase(), 'VOLUME'],
    [formatDuration(s.duration), 'DURATA'],
    [String(sessionSetCount(s)), 'SERIE'],
  ];
  const gap = 20;
  const tw = (W - pad * 2 - gap * 2) / 3;
  tiles.forEach(([v, l], i) => {
    const x = pad + i * (tw + gap);
    roundRect(ctx, x, 1040, tw, 200, 32);
    ctx.fillStyle = '#0D0F0E';
    ctx.fill();
    ctx.strokeStyle = '#222724';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FAFAFA';
    fitFont(ctx, v, tw - 30, 84, 44);
    ctx.fillText(v, x + tw / 2, 1150);
    ctx.fillStyle = '#7D8781';
    ctx.font = `700 24px ${FONT}`;
    ctx.letterSpacing = '4px';
    ctx.fillText(l, x + tw / 2, 1200);
    ctx.letterSpacing = '0px';
  });

  // riquadro inferiore: nuovi record, altrimenti migliori serie
  ctx.textAlign = 'left';
  const logs = s.logs.filter((l) => workingSets(l.sets).length);
  const prLogs = logs.filter((l) => l.sets.some((x) => x.isPersonalRecord));
  const isPR = prLogs.length > 0;
  const rows = (isPR ? prLogs : logs).slice(0, 4);
  const boxY = 1300;
  const boxH = 120 + rows.length * 66;
  roundRect(ctx, pad, boxY, W - pad * 2, boxH, 36);
  if (isPR) {
    const bg = ctx.createLinearGradient(pad, 0, W - pad, 0);
    bg.addColorStop(0, 'rgba(232,194,90,0.18)');
    bg.addColorStop(1, 'rgba(232,194,90,0.04)');
    ctx.fillStyle = bg;
  } else ctx.fillStyle = '#0D0F0E';
  ctx.fill();
  ctx.strokeStyle = isPR ? 'rgba(232,194,90,0.5)' : '#222724';
  ctx.lineWidth = 2;
  ctx.stroke();
  const head = isPR ? (prLogs.length === 1 ? 'NUOVO RECORD' : 'NUOVI RECORD') : 'MIGLIORI SERIE';
  if (isPR) trophy(ctx, pad + 40, boxY + 40, 40, GOLD);
  ctx.fillStyle = isPR ? GOLD : '#7D8781';
  ctx.font = `800 26px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillText(head, pad + (isPR ? 96 : 40), boxY + 70);
  ctx.letterSpacing = '0px';
  rows.forEach((l, i) => {
    const y = boxY + 140 + i * 66;
    const best = topSet(l.sets);
    const right = best ? `${formatKg(best.weight, 2)} kg × ${best.reps}` : '';
    ctx.font = `700 36px ${FONT}`;
    const rw = ctx.measureText(right).width;
    ctx.textAlign = 'right';
    ctx.fillStyle = isPR ? GOLD : '#FAFAFA';
    ctx.fillText(right, W - pad - 40, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(fit(ctx, nameOf(l), W - pad * 2 - 100 - rw), pad + 40, y);
  });

  // firma in basso
  const by = H - 110;
  ctx.font = `800 52px ${DISPLAY}`;
  const w1 = ctx.measureText('VULCAN ').width;
  const w2 = ctx.measureText('LIFT').width;
  const total = 64 + 18 + w1 + w2;
  const bx = (W - total) / 2;
  if (logo) {
    ctx.save();
    roundRect(ctx, bx, by - 50, 64, 64, 14);
    ctx.clip();
    ctx.drawImage(logo, bx, by - 50, 64, 64);
    ctx.restore();
  }
  ctx.fillStyle = '#FAFAFA';
  ctx.fillText('VULCAN ', bx + 82, by);
  ctx.fillStyle = ACCENT;
  ctx.fillText('LIFT', bx + 82 + w1, by);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non generata'))), 'image/png'));
}

/** Condivide l'immagine (menu di condivisione del telefono) o la scarica. */
export async function shareImage(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  return shareFile(blob, filename, 'Il mio allenamento');
}

/** Condivide un file (immagine o video) col menu del telefono, altrimenti lo scarica. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
