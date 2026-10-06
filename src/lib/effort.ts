/**
 * Sforzo della serie: l'app ragiona in RIR (ripetizioni in riserva), ma a chi inizia l'RPE (6-10) è più intuitivo.
 * RPE = 10 − RIR. Qui le conversioni e le spiegazioni mostrate nella sessione.
 */
export type EffortScale = 'rpe' | 'rir';

export interface EffortOption {
  rpe: number;
  title: string;
  desc: string;
}

/** Dal più duro al più facile. */
export const EFFORT_OPTIONS: EffortOption[] = [
  { rpe: 10, title: 'Massimo', desc: 'Non ne avevi nemmeno una in più' },
  { rpe: 9.5, title: 'Al limite', desc: 'Forse una in più, ma non con più peso' },
  { rpe: 9, title: 'Durissima', desc: 'Ne avevi ancora 1' },
  { rpe: 8.5, title: 'Molto dura', desc: 'Ne avevi ancora 1 o 2' },
  { rpe: 8, title: 'Dura', desc: 'Ne avevi ancora 2' },
  { rpe: 7.5, title: 'Impegnativa', desc: 'Ne avevi ancora 2 o 3' },
  { rpe: 7, title: 'Sostenuta', desc: 'Ne avevi ancora 3' },
  { rpe: 6, title: 'Moderata', desc: 'Ne avevi ancora 4 o più, il peso saliva veloce' },
];

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const num = (s: string) => Number(s.replace(',', '.'));

/** Valore da mostrare per un RIR salvato ("2" → "8" in RPE). */
export function effortValue(rir: string, scale: EffortScale): string {
  if (rir.trim() === '') return '';
  const r = num(rir);
  if (!Number.isFinite(r)) return rir;
  return scale === 'rpe' ? fmt(Math.max(1, 10 - r)) : fmt(r);
}

/** Bersaglio della scheda nella scala scelta: "1-2" → "8-9", "2/1/1" → "8/9/9", "1-2, ult. 0-1" → "8-9, ult. 9-10". */
export function effortTarget(rirTarget: string, scale: EffortScale): string {
  if (scale === 'rir') return rirTarget;
  return rirTarget.replace(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/g, (_, a: string, b?: string) =>
    b != null ? `${fmt(10 - num(b))}-${fmt(10 - num(a))}` : fmt(10 - num(a)),
  );
}

/** Etichetta corta della scala ("RPE" o "RIR"). */
export const scaleLabel = (scale: EffortScale) => (scale === 'rpe' ? 'RPE' : 'RIR');

/** Intervallo di RIR di un bersaglio (min, max), per modificarlo durante la sessione. */
export function rirRange(rirTarget: string): [number, number] {
  const nums = (rirTarget.match(/\d+(?:[.,]\d+)?/g) ?? []).map(num);
  if (!nums.length) return [1, 2];
  return [Math.min(...nums), Math.max(...nums)];
}

/** Bersaglio RIR da un intervallo ("1-2" o "1"). */
export const rirTargetOf = (min: number, max: number) => (min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`).replace(/,/g, '.');
