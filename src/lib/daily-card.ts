/**
 * Foto del giorno: la foto dell'utente con sopra il giorno del percorso, i numeri dell'allenamento
 * e la mappa dei muscoli allenati (1080×1920, formato storia).
 */
import type { Session } from '@/types';
import { formatTonnage, sessionSetCount, sessionTonnage, workingSets } from './analytics';
import { formatDuration, formatLongDate } from './date-utils';
import { ACCENT, DISPLAY, FONT, fitFont, loadImage, roundRect } from './share-card';

const W = 1080;
const H = 1920;

export interface DailyCardInput {
  /** foto (data URL) */
  photo: string;
  /** giorno del percorso (1 = prima foto) */
  day: number;
  date: number;
  session: Session | null;
  /** titolo dell'allenamento (es. "Petto + Tricipiti") */
  title?: string;
  /** mappa muscolare già pronta come SVG (data URL) */
  muscles?: string | null;
  weight?: number | null;
  /** allenamenti fatti questa settimana (per i giorni di riposo) */
  weekSessions?: number;
  /** impaginazione minima: colonna a sinistra, blocco in basso o striscia in alto */
  layout?: DailyLayout;
  /** il dato in kg aggiunto: peso corporeo o volume sollevato */
  kg?: 'peso' | 'volume';
}

export type DailyLayout = 'colonna' | 'angolo' | 'striscia';

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
  if (input.kg === 'volume' && s) out.push(['Sollevati', `${Math.round(sessionTonnage(s)).toLocaleString('it-IT')} kg`]);
  else if (input.weight) out.push(['Peso', `${String(input.weight).replace('.', ',')} kg`]);
  return out;
}

/** Testo leggibile sopra qualsiasi foto (ombra morbida). */
function shadow(ctx: CanvasRenderingContext2D, on: boolean) {
  ctx.shadowColor = on ? 'rgba(0,0,0,0.65)' : 'transparent';
  ctx.shadowBlur = on ? 14 : 0;
  ctx.shadowOffsetY = on ? 2 : 0;
}

function brand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number, align: 'left' | 'center' | 'right') {
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

async function renderMinimal(input: DailyCardInput, layout: DailyLayout): Promise<Blob> {
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
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (photo) cover(ctx, photo, W, H);
  const list = stats(input);
  const dayTxt = `GIORNO ${input.day}`;

  if (layout === 'colonna') {
    // colonna stretta in alto a sinistra: giorno, dati uno sotto l'altro, mappa, logo
    const cx = 64 + 110;
    ctx.textAlign = 'center';
    shadow(ctx, true);
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.fillText(dayTxt, cx, 150);
    let y = 215;
    for (const [l, v] of list) {
      ctx.fillStyle = 'rgba(250,250,250,0.7)';
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(l, cx, y);
      ctx.fillStyle = '#FAFAFA';
      ctx.font = `700 36px ${FONT}`;
      ctx.fillText(v, cx, y + 40);
      y += 92;
    }
    shadow(ctx, false);
    if (map) {
      const mw = 230;
      const mh = mw * (212 / 218);
      ctx.drawImage(map, cx - mw / 2, y, mw, mh);
      y += mh + 30;
    }
    brand(ctx, logo, cx, y, 64, 'center');
  } else if (layout === 'angolo') {
    // blocco in basso a sinistra: mappa piccola + giorno e dati in riga
    const x = 64;
    const yb = H - 120;
    let tx = x;
    if (map) {
      const mh = 190;
      const mw = mh * (218 / 212);
      ctx.drawImage(map, x - 10, yb - mh + 8, mw, mh);
      tx = x + mw + 14;
    }
    ctx.textAlign = 'left';
    shadow(ctx, true);
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `800 84px ${DISPLAY}`;
    ctx.fillText(dayTxt, tx, yb - 70);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = 'rgba(250,250,250,0.9)';
    ctx.fillText(list.map(([, v]) => v).join('  ·  '), tx, yb - 18);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = 'rgba(250,250,250,0.6)';
    ctx.letterSpacing = '2px';
    ctx.fillText(list.map(([l]) => l.toUpperCase()).join('   ·   '), tx, yb + 14);
    ctx.letterSpacing = '0px';
    shadow(ctx, false);
    brand(ctx, logo, W - 64, 70, 72, 'right');
  } else {
    // striscia in alto: giorno a sinistra, logo a destra, una riga di dati sotto
    const top = ctx.createLinearGradient(0, 0, 0, 360);
    top.addColorStop(0, 'rgba(0,0,0,0.55)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 360);
    ctx.textAlign = 'left';
    shadow(ctx, true);
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `800 96px ${DISPLAY}`;
    ctx.fillText(dayTxt, 64, 165);
    const cw = (W - 128 - (map ? 170 : 0)) / list.length;
    list.forEach(([l, v], i) => {
      const x = 64 + i * cw;
      ctx.fillStyle = '#FAFAFA';
      ctx.font = `700 36px ${FONT}`;
      ctx.fillText(v, x, 240);
      ctx.fillStyle = 'rgba(250,250,250,0.7)';
      ctx.font = `600 19px ${FONT}`;
      ctx.fillText(l, x, 272);
    });
    shadow(ctx, false);
    if (map) {
      const mh = 165;
      const mw = mh * (218 / 212);
      ctx.drawImage(map, W - 64 - mw, 140, mw, mh);
    }
    brand(ctx, logo, W / 2, H - 190, 64, 'center');
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non generata'))), 'image/jpeg', 0.9));
}

/** Copre tutto il riquadro con la foto (come object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const iw = img.width * k;
  const ih = img.height * k;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

export async function renderDailyCard(input: DailyCardInput): Promise<Blob> {
  if (input.layout) return renderMinimal(input, input.layout);
  await Promise.all([document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`700 40px ${FONT}`)].map((p) => p?.catch(() => undefined)));
  await document.fonts?.ready;
  const [photo, logo, map] = await Promise.all([
    loadImage(input.photo),
    loadImage(`${import.meta.env.BASE_URL}icons/icon-512.png`),
    input.muscles ? loadImage(input.muscles) : Promise.resolve(null),
  ]);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  const pad = 64;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (photo) cover(ctx, photo, W, H);

  // sfumature per leggere bene i testi sopra la foto
  const top = ctx.createLinearGradient(0, 0, 0, 560);
  top.addColorStop(0, 'rgba(0,0,0,0.78)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 560);
  const bottom = ctx.createLinearGradient(0, H - 980, 0, H);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(0.45, 'rgba(0,0,0,0.65)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 980, W, 980);

  // in alto: giorno del percorso e data
  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.font = `800 34px ${FONT}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('GIORNO', pad, 120);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#FAFAFA';
  ctx.font = `800 190px ${DISPLAY}`;
  ctx.fillText(String(input.day), pad - 6, 300);
  ctx.fillStyle = 'rgba(250,250,250,0.85)';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(formatLongDate(input.date), pad, 360);
  if (logo) {
    const L = 112;
    ctx.save();
    roundRect(ctx, W - pad - L, 70, L, L, 26);
    ctx.clip();
    ctx.drawImage(logo, W - pad - L, 70, L, L);
    ctx.restore();
  }

  // pannello in basso, basso e compatto per lasciare libero il corpo: mappa muscolare + numeri in fila
  const s = input.session;
  const panelH = 330;
  const py = H - 150 - panelH;
  roundRect(ctx, pad, py, W - pad * 2, panelH, 36);
  ctx.fillStyle = 'rgba(10,12,11,0.74)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(61,220,132,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const hasMap = Boolean(s && map);
  const mapH = panelH - 50;
  const mapW = hasMap ? mapH * (218 / 212) : 0;
  if (hasMap && map) ctx.drawImage(map, pad + 18, py + 25, mapW, mapH);
  const rx = pad + (hasMap ? mapW + 34 : 44);
  const rw = W - pad - 36 - rx;

  // titolo
  const title = (s ? input.title || 'Allenamento' : 'Giorno di riposo').toUpperCase();
  const tsz = fitFont(ctx, title, rw, 64, 38);
  ctx.fillStyle = '#FAFAFA';
  ctx.font = `800 ${tsz}px ${DISPLAY}`;
  ctx.fillText(title, rx, py + 88);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 22px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillText(s ? 'ALLENAMENTO COMPLETATO' : 'RECUPERO', rx, py + 128);
  ctx.letterSpacing = '0px';

  const mins = s?.duration != null ? Math.round(s.duration / 60) : null;
  const tiles: [string, string][] = s
    ? [
        [mins == null ? '—' : mins < 60 ? `${Math.max(1, mins)}′` : formatDuration(s.duration), 'DURATA'],
        [String(s.logs.filter((l) => workingSets(l.sets).length).length), 'ESERCIZI'],
        [String(sessionSetCount(s)), 'SERIE'],
        [formatTonnage(sessionTonnage(s)), 'VOLUME'],
      ]
    : [
        ...(input.weight ? ([[`${String(input.weight).replace('.', ',')} kg`, 'PESO']] as [string, string][]) : []),
        [String(input.weekSessions ?? 0), 'ALLENAMENTI SETT.'],
      ];
  // numeri in fila, separati da una linea sottile
  const cw = rw / Math.max(tiles.length, 2);
  tiles.forEach(([v, l], i) => {
    const x = rx + i * cw;
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x - 12, py + 172, 2, 104);
    }
    ctx.fillStyle = '#FAFAFA';
    fitFont(ctx, v, cw - 24, 58, 30);
    ctx.fillText(v, x, py + 234);
    ctx.fillStyle = '#9AA39E';
    ctx.font = `700 18px ${FONT}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(l, x, py + 270);
    ctx.letterSpacing = '0px';
  });

  // firma
  const by = H - 70;
  ctx.font = `800 48px ${DISPLAY}`;
  const w1 = ctx.measureText('VULCAN ').width;
  const w2 = ctx.measureText('LIFT').width;
  const bx = (W - (w1 + w2)) / 2;
  ctx.fillStyle = '#FAFAFA';
  ctx.fillText('VULCAN ', bx, by);
  ctx.fillStyle = ACCENT;
  ctx.fillText('LIFT', bx + w1, by);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non generata'))), 'image/jpeg', 0.9));
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
