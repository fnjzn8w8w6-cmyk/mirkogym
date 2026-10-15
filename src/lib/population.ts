/**
 * "Quanto sei raro": confronto con la popolazione adulta dello stesso sesso (stime, non un censimento).
 * - Forza: 1RM / peso corporeo con distribuzione log-normale della popolazione generale (soprattutto non allenata),
 *   mediana un po' sopra la soglia del rango Bronzo; tarata su studi di forza e standard di sollevamento.
 * - Corpo: massa grassa (DXA, grandi indagini di popolazione) per sesso ed età e FFMI (massa magra per l'altezza).
 * Le frasi si mostrano SOLO quando sono un complimento: chi è sotto la media non vede confronti.
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
/** Sotto questa soglia non si festeggia: troppo poco grasso non è un traguardo. */
const MIN_BF: Record<Sex, number> = { m: 7, f: 15 };

/** Si mostra solo se fai meglio di almeno il 60% (sempre un complimento). */
const SHOW_FROM = 0.6;

/** Articolo italiano davanti alla percentuale: "il 4%", "l'8%", "lo 0,5%". */
function withArticle(n: string): string {
  if (n.startsWith('0')) return `lo ${n}`;
  if (/^(1|8|11|18|8\d)(,|$)/.test(n)) return `l'${n}`;
  return `il ${n}`;
}

/** Percentuale leggibile: decimali solo sotto l'1%. */
function pctText(share: number): string {
  if (share < 0.001) return 'meno dello 0,1%';
  const v = share < 0.01 ? (Math.round(share * 1000) / 10).toString().replace('.', ',') : String(Math.round(share * 100));
  return `${withArticle(v)}%`;
}

const who = (sex: Sex) => (sex === 'f' ? 'delle donne' : 'degli uomini');

/** Frase sulla forza (null = non è un complimento o non c'è uno standard affidabile). */
export function strengthRarity(o: { ratio: number; ratios: number[]; sex: Sex; kg: number; name: string; estimated: boolean; bodyweightBased: boolean; perHand: boolean }): string | null {
  // solo i fondamentali con standard noti, col bilanciere (manubri e corpo libero non si confrontano bene)
  if (o.estimated || o.bodyweightBased || o.perHand || !(o.kg > 0)) return null;
  const above = strengthShareAbove(o.ratio, o.ratios);
  if (1 - above < SHOW_FROM) return null;
  const lift = o.name.toLowerCase();
  if (above <= 0.1) {
    const s = pctText(above);
    return `${s.startsWith('meno') ? 'Meno dello 0,1%' : `Solo ${s}`} ${who(o.sex)} adult${o.sex === 'f' ? 'e' : 'i'} arriva a ${o.kg} kg di ${lift} al tuo peso.`;
  }
  return `Sei più forte di circa ${pctText(1 - above)} ${who(o.sex)} adult${o.sex === 'f' ? 'e' : 'i'} in ${lift}.`;
}

/** Frasi sul corpo: solo quelle a tuo favore (meno grasso, più muscolo per l'altezza). Vuoto = nessun confronto. */
export function bodyRarity(o: { sex: Sex; age: number; bf: number; ffmi: number }): string[] {
  const band = ageBand(o.age);
  const group = `${who(o.sex)} ${AGE_TXT[band]}`;
  const out: string[] = [];
  // quota con meno grasso di te
  const leaner = normalCdf((o.bf - BF_MEAN[o.sex][band]) / BF_SD);
  if (o.bf >= MIN_BF[o.sex] && 1 - leaner >= SHOW_FROM) out.push(`Hai meno grasso di circa ${pctText(1 - leaner)} ${group}.`);
  // quota con più muscolo di te
  const f = FFMI[o.sex];
  const moreMuscle = 1 - normalCdf((o.ffmi - f.mean) / f.sd);
  if (1 - moreMuscle >= SHOW_FROM) out.push(`Hai più muscolo per la tua altezza di circa ${pctText(1 - moreMuscle)} ${group}.`);
  return out;
}
