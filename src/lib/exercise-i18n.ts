import { NAME_IT, type LibraryExercise } from './exercise-library';

export type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt';

export const LANGUAGES: { value: Lang; label: string; flag: string }[] = [
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'pt', label: 'Português', flag: '🇵🇹' },
];

/** Traduzioni curate incluse nell'app (per ora: italiano, esercizi più comuni). */
const BUNDLED: Partial<Record<Lang, Promise<Record<string, string[]>> | null>> = {};
function bundled(lang: Lang): Promise<Record<string, string[]>> {
  if (lang !== 'it') return Promise.resolve({});
  BUNDLED[lang] ??= fetch(`${import.meta.env.BASE_URL}i18n/${lang}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string[]>>) : {}))
    .catch(() => {
      BUNDLED[lang] = null;
      return {};
    });
  return BUNDLED[lang] ?? Promise.resolve({});
}

const cacheKey = (lang: Lang, id: string) => `mirkogym.tr.${lang}.${id}`;

interface Translated {
  name: string;
  steps: string[];
}

function readCache(lang: Lang, id: string): Translated | null {
  try {
    const raw = localStorage.getItem(cacheKey(lang, id));
    return raw ? (JSON.parse(raw) as Translated) : null;
  } catch {
    return null;
  }
}

/** Traduzione automatica (MyMemory, gratuito, senza chiave). Ogni testo < 500 caratteri. */
async function machineTranslate(texts: string[], lang: Lang): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    // Spezza i testi lunghi per frasi
    const chunks = t.length <= 450 ? [t] : (t.match(/[^.!?]+[.!?]*\s*/g) ?? [t]);
    const parts: string[] = [];
    for (const c of chunks) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(c.trim())}&langpair=en|${lang}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Traduzione non disponibile');
      const data = (await res.json()) as { responseStatus: number | string; responseData?: { translatedText?: string } };
      const txt = data.responseData?.translatedText;
      if (Number(data.responseStatus) !== 200 || !txt || /MYMEMORY WARNING/i.test(txt)) throw new Error('Limite di traduzione raggiunto');
      parts.push(txt);
    }
    out.push(parts.join(' '));
  }
  return out;
}

export type TextSource = 'original' | 'curated' | 'machine' | 'fallback';

/** Nome e istruzioni dell'esercizio nella lingua scelta. */
export async function exerciseText(ex: LibraryExercise, lang: Lang): Promise<Translated & { source: TextSource }> {
  if (lang === 'en') return { name: ex.n, steps: ex.i, source: 'original' };
  if (lang === 'it') {
    const curated = (await bundled('it'))[ex.id];
    if (curated) return { name: NAME_IT[ex.id] ?? ex.n, steps: curated, source: 'curated' };
  }
  const cached = readCache(lang, ex.id);
  if (cached) return { ...cached, name: lang === 'it' ? (NAME_IT[ex.id] ?? cached.name) : cached.name, source: 'machine' };
  try {
    const [name, ...steps] = await machineTranslate([ex.n, ...ex.i], lang);
    const result = { name, steps };
    try {
      localStorage.setItem(cacheKey(lang, ex.id), JSON.stringify(result));
    } catch {
      /* cache piena: ignorato */
    }
    return { ...result, name: lang === 'it' ? (NAME_IT[ex.id] ?? name) : name, source: 'machine' };
  } catch {
    return { name: lang === 'it' ? (NAME_IT[ex.id] ?? ex.n) : ex.n, steps: ex.i, source: 'fallback' };
  }
}
