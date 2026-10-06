import type { ExerciseLog, Session } from '@/types';
import { formatKg, formatTonnage, sessionSetCount, sessionTonnage, topSet, workingSets } from './analytics';
import { formatDuration, formatLongDate } from './date-utils';

const W = 1080;
const H = 1350;
const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Disegna l'immagine riepilogativa dell'allenamento (1080×1350, formato post Instagram). */
export async function renderShareCard(
  s: Session,
  title: string,
  subtitle: string,
  nameOf: (l: ExerciseLog) => string,
): Promise<Blob> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');

  // Sfondo con bagliore arancione
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.85, 120, 20, W * 0.85, 120, 700);
  g.addColorStop(0, 'rgba(61,220,132,0.35)');
  g.addColorStop(1, 'rgba(61,220,132,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const pad = 80;
  ctx.fillStyle = '#3DDC84';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('VULCAN LIFT', pad, 130);
  ctx.fillStyle = '#A7B0AB';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(formatLongDate(s.date), pad, 185);

  ctx.fillStyle = '#FAFAFA';
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(title, pad, 320);
  ctx.fillStyle = '#A7B0AB';
  ctx.font = `700 48px ${FONT}`;
  ctx.fillText(subtitle.slice(0, 32), pad, 390);

  // Statistiche
  const prs = s.logs.reduce((a, l) => a + l.sets.filter((x) => x.isPersonalRecord).length, 0);
  const tiles: [string, string][] = [
    ['DURATA', formatDuration(s.duration)],
    ['VOLUME', formatTonnage(sessionTonnage(s))],
    ['SERIE', String(sessionSetCount(s))],
    ['PR', String(prs)],
  ];
  const tw = (W - pad * 2 - 3 * 24) / 4;
  tiles.forEach(([label, value], i) => {
    const x = pad + i * (tw + 24);
    roundRect(ctx, x, 450, tw, 170, 28);
    ctx.fillStyle = label === 'PR' && prs > 0 ? 'rgba(234,179,8,0.15)' : '#1D1530';
    ctx.fill();
    ctx.fillStyle = '#7D8781';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(label, x + 28, 505);
    ctx.fillStyle = label === 'PR' && prs > 0 ? '#EAB308' : '#FAFAFA';
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(value, x + 28, 585);
  });

  // Esercizi con il miglior set
  ctx.fillStyle = '#7D8781';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('ESERCIZI', pad, 700);
  const logs = s.logs.filter((l) => workingSets(l.sets).length).slice(0, 7);
  logs.forEach((l, i) => {
    const y = 770 + i * 72;
    const best = topSet(l.sets);
    const pr = l.sets.some((x) => x.isPersonalRecord);
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `600 38px ${FONT}`;
    let name = nameOf(l);
    while (ctx.measureText(name).width > 620 && name.length > 4) name = name.slice(0, -2);
    if (name !== nameOf(l)) name += '…';
    ctx.fillText(name, pad, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = pr ? '#EAB308' : '#A7B0AB';
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(`${pr ? '🏆 ' : ''}${workingSets(l.sets).length}× ${best ? `${formatKg(best.weight, 2)}kg×${best.reps}` : ''}`, W - pad, y);
    ctx.textAlign = 'left';
  });
  if (s.logs.length > logs.length) {
    ctx.fillStyle = '#7D8781';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(`+ altri ${s.logs.length - logs.length} esercizi`, pad, 770 + logs.length * 72);
  }

  ctx.fillStyle = '#5B5070';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('Allenamento registrato con Vulcan Lift', pad, H - 70);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non generata'))), 'image/png'));
}

/** Condivide l'immagine (menu di condivisione del telefono) o la scarica. */
export async function shareImage(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Il mio allenamento' });
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
