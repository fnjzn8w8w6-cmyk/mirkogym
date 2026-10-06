/**
 * Massa grassa "di tutti i giorni": la misura vera arriva ogni tanto (foto del check-in, plicometro, DEXA…),
 * nel mezzo la stimiamo dal trend del peso. Così nessuno deve inventarsi un numero ogni mattina.
 */
import type { BodyLog } from '@/types';
import { movingAverage7d } from './analytics';

export type BodyFatSource = NonNullable<BodyLog['bodyFatSource']>;

export const BF_SOURCE_IT: Record<BodyFatSource, string> = {
  photo: 'foto del check-in',
  calipers: 'plicometro',
  scale: 'bilancia impedenziometrica',
  dexa: 'DEXA / BIA professionale',
  manual: 'misura manuale',
};

export interface BodyFatNow {
  value: number;
  /** true = stimata dal trend del peso a partire dall'ultima misura */
  estimated: boolean;
  /** data dell'ultima misura usata come riferimento */
  anchorDate: string;
  source: BodyFatSource;
}

const DAY = 86400000;
const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();
/** Una misura vale come riferimento per 4 mesi. */
const MAX_AGE = 120 * DAY;

/** Valore di una misura: le bilance impedenziometriche oscillano, quindi media dei 7 giorni. */
function measured(logs: BodyLog[], l: BodyLog): number {
  if (l.bodyFatSource !== 'scale') return l.bodyFat as number;
  const end = ts(l.date);
  const win = logs.filter((x) => x.bodyFatSource === 'scale' && x.bodyFat != null && end - ts(x.date) >= 0 && end - ts(x.date) < 7 * DAY);
  return win.reduce((a, x) => a + (x.bodyFat as number), 0) / win.length;
}

/**
 * Massa grassa attuale: ultima misura affidabile aggiornata con il trend del peso (media 7 giorni).
 * Chi dimagrisce perde soprattutto grasso (~75% del peso), chi ingrassa ne prende ~60%.
 */
export function bodyFatNow(bodyLogs: BodyLog[], now = Date.now()): BodyFatNow | null {
  const withBf = bodyLogs.filter((l) => l.bodyFat != null).sort((a, b) => b.date.localeCompare(a.date));
  const anchor = withBf[0];
  if (!anchor || now - ts(anchor.date) > MAX_AGE) return null;
  const bf = measured(bodyLogs, anchor);
  const source: BodyFatSource = anchor.bodyFatSource ?? (anchor.notes?.toLowerCase().includes('foto') ? 'photo' : 'manual');
  const avg = movingAverage7d(bodyLogs, 'weight');
  const weights = [...avg.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!weights.length) return { value: round(bf), estimated: false, anchorDate: anchor.date, source };
  // peso (medio) al momento della misura e oggi
  const atAnchor = [...weights].reverse().find(([d]) => d <= anchor.date) ?? weights[0];
  const last = weights[weights.length - 1];
  if (last[0] <= anchor.date) return { value: round(bf), estimated: false, anchorDate: anchor.date, source };
  const w0 = anchor.weight ?? atAnchor[1];
  const w1 = last[1];
  const dw = w1 - w0;
  const fat = (w0 * bf) / 100 + dw * (dw < 0 ? 0.75 : 0.6);
  const value = Math.min(60, Math.max(3, (fat / w1) * 100));
  return { value: round(value), estimated: Math.abs(value - bf) >= 0.05, anchorDate: anchor.date, source };
}

const round = (n: number) => Math.round(n * 10) / 10;
