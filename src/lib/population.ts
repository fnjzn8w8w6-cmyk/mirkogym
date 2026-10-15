/**
 * "Quanto sei raro": confronto con la popolazione adulta dello stesso sesso (stime, non un censimento).
 * - Forza: 1RM / peso corporeo con distribuzione log-normale della popolazione generale (soprattutto non allenata),
 *   mediana un po' sopra la soglia del rango Bronzo; tarata su studi di forza e standard di sollevamento.
 * - Corpo: massa grassa (DXA, grandi indagini di popolazione) per sesso ed età e FFMI (massa magra per l'altezza).
 * Le frasi si mostrano sempre, come dato: tono neutro, senza giudizi.
 */
import type { Sex } from './metabolism';

/** Funzione di ripartizione della normale standard (approssimazione di Abramowitz-Stegun, errore < 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** Variabilità della forza nella popolazione (deviazione standard del logaritmo di 1RM/peso). */
const STRENGTH_SIGMA = 0.4;

/**
 * Quota della popolazione adulta (stesso sesso) che solleva di più, in rapporto al peso corporeo.
 * `ratios` = soglie dei ranghi già adattate a sesso e manubri; la mediana della popolazione è ~1,2 × la prima soglia
 * (uomo: panca ~0,6 × peso; circa 1 uomo su 10 solleva in panca il proprio peso).
 */
export function strengthShareAbove(ratio: number, ratios: number[]): number {
  const median = ratios[0] * 1.2;
  if (!(ratio > 0) || !(median > 0)) return 1;
  return 1 - normalCdf(Math.log(ratio / median) / STRENGTH_SIGMA);
}

const ageBand = (age: number) => (age < 40 ? 0 : age < 60 ? 1 : 2);
const AGE_TXT = ['tra 20 e 39 anni', 'tra 40 e 59 anni', 'sopra i 60 anni'];
/**
 * Massa grassa media (%) per fascia d'età e sua deviazione standard: valori DXA delle grandi indagini meno ~2 punti,
 * perché plicometro, foto e bilance leggono in media un po' più basso della DXA.
 */
const BF_MEAN: Record<Sex, number[]> = { m: [22, 24.5, 26.5], f: [32, 35, 37] };
const BF_SD = 6.5;
/** FFMI medio e deviazione standard. */
const FFMI: Record<Sex, { mean: number; sd: number }> = { m: { mean: 19.5, sd: 2.2 }, f: { mean: 15.8, sd: 2 } };
/** Sotto questa soglia la stima non ha senso (misura sbagliata o valore non sano): nessuna frase. */
const MIN_BF: Record<Sex, number> = { m: 4, f: 10 };

/** Articolo italiano davanti alla percentuale: "il 4%", "l'8%", "lo 0,5%". */
function withArticle(n: string): string {
  if (n.startsWith('0')) return `lo ${n}`;
  // l' davanti a uno, otto, undici, ottanta…: "l'1%", "l'8%", "l'11%", "l'85%" (ma "il 18%")
  if (/^(1|8|11|8\d)(,|$)/.test(n)) return `l'${n}`;
  return `il ${n}`;
}

/** Percentuale leggibile: decimali solo sotto l'1%. */
function pctText(share: number): string {
  if (share < 0.001) return 'meno dello 0,1%';
  const v = share < 0.01 ? (Math.round(share * 1000) / 10).toString().replace('.', ',') : String(Math.round(share * 100));
  return `${withArticle(v)}%`;
}

const who = (sex: Sex) => (sex === 'f' ? 'delle donne' : 'degli uomini');
/** Prima lettera maiuscola (inizio frase: "Il 45%", "L'85%", "Lo 0,5%"). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Frase sulla forza: sempre, come dato (null = nessuno standard affidabile per questo esercizio). */
export function strengthRarity(o: { ratio: number; ratios: number[]; sex: Sex; kg: number; name: string; estimated: boolean; bodyweightBased: boolean; perHand: boolean }): string | null {
  // solo i fondamentali con standard noti, col bilanciere (manubri e corpo libero non si confrontano bene)
  if (o.estimated || o.bodyweightBased || o.perHand || !(o.kg > 0)) return null;
  const above = strengthShareAbove(o.ratio, o.ratios);
  const lift = o.name.toLowerCase();
  const adults = `${who(o.sex)} adult${o.sex === 'f' ? 'e' : 'i'}`;
  if (above <= 0.1) {
    const s = pctText(above);
    return `${s.startsWith('meno') ? 'Meno dello 0,1%' : `Solo ${s}`} ${adults} arriva a ${o.kg} kg di ${lift} al tuo peso.`;
  }
  return `Sei più forte di circa ${pctText(Math.max(0.01, 1 - above))} ${adults} in ${lift}.`;
}

/**
 * Frase sul corpo, una sola e neutra, sempre: quanti hanno una condizione fisica come la tua o migliore
 * (poco grasso e tanto muscolo per l'altezza, in un punteggio unico; chi è nella media sta al 50%).
 */
export function bodyRarity(o: { sex: Sex; age: number; bf: number; ffmi: number }): string | null {
  if (o.bf < MIN_BF[o.sex]) return null;
  const band = ageBand(o.age);
  const zFat = (BF_MEAN[o.sex][band] - o.bf) / BF_SD;
  const f = FFMI[o.sex];
  const zMuscle = (o.ffmi - f.mean) / f.sd;
  const share = 1 - normalCdf((zFat + zMuscle) / Math.SQRT2);
  const s = pctText(Math.min(0.99, share));
  const start = share <= 0.1 ? (s.startsWith('meno') ? 'Meno dello 0,1%' : `Solo ${s}`) : cap(s);
  return `${start} ${who(o.sex)} ${AGE_TXT[band]} ha una condizione fisica come la tua o migliore.`;
}
