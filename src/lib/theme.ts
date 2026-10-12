/**
 * Temi dell'app: i colori sono variabili CSS (src/index.css), il tema scelto è l'attributo data-theme su <html>.
 * La scelta si salva nelle impostazioni (uguale su tutti i dispositivi) e sul telefono (applicata subito all'apertura).
 */
export type ThemeId = 'vulcano' | 'carta' | 'grafite';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  note: string;
  light: boolean;
  /** sfondo, riquadro, testo, colore principale (per l'anteprima) */
  colors: [string, string, string, string];
  /** colore della barra del browser/sistema */
  bar: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'vulcano', label: 'Vulcano', note: 'Scuro, nero e verde (originale)', light: false, colors: ['#000000', '#151816', '#fafafa', '#3ddc84'], bar: '#000000' },
  { id: 'carta', label: 'Carta', note: 'Chiaro, bianco e nero', light: true, colors: ['#f2f2f2', '#ffffff', '#111111', '#161616'], bar: '#f2f2f2' },
  { id: 'grafite', label: 'Grafite', note: 'Scuro, nero e bianco', light: false, colors: ['#0b0b0c', '#1c1c1f', '#fafafa', '#f4f4f5'], bar: '#0b0b0c' },
];

const KEY = 'vl.theme';

/** Tema valido (le impostazioni vecchie dicevano 'dark' = Vulcano). */
export function normalizeTheme(t: string | null | undefined): ThemeId {
  return THEMES.some((x) => x.id === t) ? (t as ThemeId) : 'vulcano';
}

export function applyTheme(t: string | null | undefined) {
  const id = normalizeTheme(t);
  const info = THEMES.find((x) => x.id === id)!;
  const root = document.documentElement;
  if (id === 'vulcano') delete root.dataset.theme;
  else root.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', info.bar);
  // barra di stato dell'iPhone (ora, batteria): scritte scure sul tema chiaro. Vale dalla prossima apertura dell'app.
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', info.light ? 'default' : 'black-translucent');
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* navigazione privata */
  }
}
