/**
 * Foto del giorno: la foto dell'utente con, in una colonna stretta a sinistra, il giorno del percorso,
 * i numeri essenziali dell'allenamento, il peso e la mappa dei muscoli allenati; logo in basso a destra.
 * Formato storia 1080×1920.
 */
import type { Session } from '@/types';
import { sessionSetCount, workingSets } from './analytics';
import { ACCENT, DISPLAY, FONT, loadImage, roundRect } from './share-card';
import { GROUP_MUSCLES } from '@/components/library/MuscleFigure';

const W = 1080;
const H = 1920;

export interface DailyCardInput {
  /** foto (data URL) */
  photo: string;
  /** giorno del percorso (1 = prima foto) */
  day: number;
  session: Session | null;
  /** mappa muscolare già pronta come SVG (data URL) */
  muscles?: string | null;
  weight?: number | null;
}

/** Dati brevi da mostrare (etichetta, valore). */
function stats(input: DailyCardInput): [string, string][] {
  const s = input.session;
  const out: [string, string][] = [];
  if (s) {
    const mins = s.duration != null ? Math.round(s.duration / 60) : null;
    out.push(['Durata', mins == null ? '—' : mins < 60 ? `${Math.max(1, mins)}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`]);
    out.push(['Esercizi', String(s.logs.filter((l) => workingSets(l.sets).length).length)]);
    out.push(['Serie', String(sessionSetCount(s))]);
  } else out.push(['Oggi', 'Riposo']);
  if (input.weight) out.push(['Peso', `${String(input.weight).replace('.', ',')} kg`]);
  return out;
}

/** Testo leggibile sopra qualsiasi foto (ombra morbida). */
export function shadow(ctx: CanvasRenderingContext2D, on: boolean) {
  ctx.shadowColor = on ? 'rgba(0,0,0,0.65)' : 'transparent';
  ctx.shadowBlur = on ? 14 : 0;
  ctx.shadowOffsetY = on ? 2 : 0;
}

export function brand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number, align: 'left' | 'center' | 'right') {
  ctx.font = `800 ${Math.round(size * 0.42)}px ${DISPLAY}`;
  const w1 = ctx.measureText('VULCAN ').width;
  const w2 = ctx.measureText('LIFT').width;
  const tw = w1 + w2;
  const total = Math.max(size, tw);
  const cx = align === 'left' ? x + total / 2 : align === 'right' ? x - total / 2 : x;
  if (logo) {
    ctx.save();
    roundRect(ctx, cx - size / 2, y, size, size, size * 0.24);
    ctx.clip();
    ctx.drawImage(logo, cx - size / 2, y, size, size);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  shadow(ctx, true);
  ctx.fillStyle = '#FAFAFA';
  ctx.fillText('VULCAN ', cx - tw / 2, y + size + size * 0.48);
  ctx.fillStyle = ACCENT;
  ctx.fillText('LIFT', cx - tw / 2 + w1, y + size + size * 0.48);
  shadow(ctx, false);
}

/** Copre tutto il riquadro con la foto (come object-fit: cover). */
export function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const iw = img.width * k;
  const ih = img.height * k;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

export async function renderDailyCard(input: DailyCardInput): Promise<Blob> {
  await Promise.all([document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`700 40px ${FONT}`)].map((p) => p?.catch(() => undefined)));
  await document.fonts?.ready;
  const [photo, logo, map] = await Promise.all([
    loadImage(input.photo),
    loadImage(`${import.meta.env.BASE_URL}icons/icon-512.png`),
    input.muscles && input.session ? loadImage(input.muscles) : Promise.resolve(null),
  ]);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  drawDailyCard(ctx, input, { photo, logo, map });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non generata'))), 'image/jpeg', 0.9));
}

/** Disegna la foto del giorno su una tela 1080×1920 (usata anche per ogni fotogramma del reel). */
export function drawDailyCard(
  ctx: CanvasRenderingContext2D,
  input: Pick<DailyCardInput, 'day' | 'session' | 'weight'>,
  imgs: { photo: HTMLImageElement | null; logo: HTMLImageElement | null; map: HTMLImageElement | null },
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (imgs.photo) cover(ctx, imgs.photo, W, H);

  // colonna stretta in alto a sinistra: giorno, dati uno sotto l'altro, mappa
  const cx = 64 + 110;
  let y = 150;
  ctx.textAlign = 'center';
  shadow(ctx, true);
  ctx.fillStyle = '#FAFAFA';
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.fillText(`GIORNO ${input.day}`, cx, y);
  y += 65;
  for (const [l, v] of stats({ ...input, photo: '' })) {
    ctx.fillStyle = 'rgba(250,250,250,0.7)';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(l, cx, y);
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(v, cx, y + 40);
    y += 92;
  }
  shadow(ctx, false);
  if (imgs.map && input.session) {
    const mw = 230;
    ctx.drawImage(imgs.map, cx - mw / 2, y, mw, mw * (212 / 218));
  }
  // logo discreto in basso a destra
  brand(ctx, imgs.logo, W - 64, H - 200, 64, 'right');
}

/** Colori del manichino sopra la foto (chiaro, muscoli allenati in verde). */
export const MAP_COLORS = { '--accent-500': '#3DDC84', '--bg-surface-3': 'rgba(232,236,234,0.88)', '--bg-surface-2': 'rgba(190,196,193,0.7)', '--bg-base': 'rgba(18,20,19,0.9)' };

/** Intensità per muscolo dell'allenamento di un giorno (più serie = verde più pieno). */
export function dayIntensity(session: Session | null, groupOf: (l: Session['logs'][number]) => string): Record<string, number> {
  const sets = new Map<string, number>();
  for (const l of session?.logs ?? []) sets.set(groupOf(l), (sets.get(groupOf(l)) ?? 0) + workingSets(l.sets).length);
  const top = Math.max(1, ...sets.values());
  const out: Record<string, number> = {};
  for (const [g, n] of sets) for (const m of GROUP_MUSCLES[g] ?? []) out[m] = Math.max(out[m] ?? 0, 0.45 + (0.55 * n) / top);
  return out;
}

/** Manichino colorato per un giorno, partendo dalla figura vuota già nella pagina. */
export function muscleMapFor(svg: SVGSVGElement, intensity: Record<string, number>): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('polygon').forEach((p) => {
    if (p.getAttribute('fill') === 'var(--bg-surface-2)') return; // zone neutre (testa, mani…)
    const v = intensity[p.querySelector('title')?.textContent ?? ''] ?? 0;
    p.setAttribute('fill', v > 0 ? 'var(--accent-500)' : 'var(--bg-surface-3)');
    p.setAttribute('fill-opacity', String(v > 0 ? 0.28 + 0.72 * v : 1));
  });
  return svgToDataUrl(clone, MAP_COLORS);
}

/** SVG della pagina → immagine autonoma (le variabili CSS vengono sostituite con i colori veri). */
export function svgToDataUrl(svg: SVGSVGElement, overrides: Record<string, string> = {}): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const css = getComputedStyle(document.documentElement);
  const resolve = (v: string) => v.replace(/var\((--[\w-]+)\)/g, (_, name: string) => overrides[name] ?? (css.getPropertyValue(name).trim() || '#333'));
  clone.querySelectorAll('*').forEach((el) => {
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr);
      if (v?.includes('var(')) el.setAttribute(attr, resolve(v));
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '872');
  clone.setAttribute('height', '848');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
}
