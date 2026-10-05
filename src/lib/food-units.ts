/** Alimenti che si contano a pezzi (uova, frutta, vasetti, fette…) e peso di un pezzo. */

const COUNTABLE =
  /\b(uov[oa]|mel[ae]|banan[ae]|per[ae]|arance?|arancia|kiwi|pesch[ea]|pesca|albicocc|prugn|mandarin|clementin|fic(o|hi)|limon|pomodor[oi] (ciliegin|datterin)|fett[ae]|panin|biscott|yogurt|vasett|tortill|piadin|cracker|grissin|barrett|cornett|brioche|merendin|scatolett|tramezzin|wurstel|hamburger|polpett|bastoncin|mozzarell|sottilett|frittell|tuorl|albume)/i;

/** Pesi tipici di un pezzo, per gli alimenti senza peso unitario nel database. */
const PIECE_FALLBACK: [RegExp, number][] = [
  [/tuorl/i, 18],
  [/albume/i, 33],
  [/uov/i, 55],
  [/banan/i, 120],
  [/mel[ae]/i, 150],
  [/per[ae]\b/i, 150],
  [/aranc/i, 160],
  [/kiwi/i, 75],
  [/fette biscottate|fetta biscottata/i, 8],
  [/fett[ae] .*pane|pane.*fett/i, 35],
  [/yogurt/i, 125],
  [/cracker/i, 25],
  [/grissin/i, 6],
  [/mozzarell/i, 125],
];

export const isCountable = (name: string) => COUNTABLE.test(name);

/** Peso di un pezzo: dal database se c'è, altrimenti un valore tipico. */
export function pieceGrams(name: string, unitGrams?: number): number | undefined {
  if (unitGrams && unitGrams > 0) return unitGrams;
  return PIECE_FALLBACK.find(([re]) => re.test(name))?.[1];
}

export const fmtPieces = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

/** Ultima modalità scelta per un alimento (pezzi o grammi): solo su questo dispositivo. */
export function rememberedMode(id: string): 'pz' | 'g' | null {
  try {
    const v = localStorage.getItem(`qty-mode:${id}`);
    return v === 'pz' || v === 'g' ? v : null;
  } catch {
    return null;
  }
}
export function rememberMode(id: string, mode: 'pz' | 'g') {
  try {
    localStorage.setItem(`qty-mode:${id}`, mode);
  } catch {
    /* non disponibile (es. navigazione privata) */
  }
}
