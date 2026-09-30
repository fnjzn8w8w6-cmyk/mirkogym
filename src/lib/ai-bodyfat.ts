import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebase';
import type { Sex } from './metabolism';

/**
 * Stima della massa grassa da foto con Gemini (Firebase AI Logic, Gemini Developer API,
 * disponibile nel piano gratuito Spark). Le foto vengono ridimensionate sul dispositivo,
 * inviate solo per l'analisi e non salvate dall'app.
 */

export interface BodyFatAIResult {
  bodyFat: number;
  low: number;
  high: number;
  confidence: 'bassa' | 'media' | 'alta';
  notes: string;
}

/**
 * Modelli provati in ordine, dal più recente. Google ritira periodicamente i modelli
 * (i 2.0 sono spenti, i 2.5 restano solo ai progetti che li usavano): il primo che risponde
 * viene ricordato sul dispositivo. `VITE_GEMINI_MODEL` permette di forzarne uno.
 */
const CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  // Modelli "lite": più veloci, usati anche come riserva quando i Flash sono sovraccarichi
  'gemini-3.1-flash-lite',
  'gemini-3-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
];
const MODEL_KEY = 'mirkogym.geminiModel';

function modelOrder(): string[] {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(MODEL_KEY);
  } catch {
    /* ignorato */
  }
  const list = [import.meta.env.VITE_GEMINI_MODEL, remembered, ...CANDIDATES].filter((m): m is string => Boolean(m));
  return [...new Set(list)];
}

/** Errori temporanei (server sovraccarico, timeout): conviene riprovare o cambiare modello. */
const isTransient = (msg: string) =>
  /deadline|timed? ?out|timeout|unavailable|overloaded|503|500|502|504|internal|aborted|fetch-error|network/i.test(msg) &&
  !/RESOURCE_EXHAUSTED|quota|429/i.test(msg);

const TIMEOUT_MS = 35_000;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export type Progress = (status: string) => void;

const isModelMissing = (msg: string) => /not.?found|404|not supported|unsupported|is not available|does not exist|unknown model/i.test(msg);

/** Ridimensiona la foto (lato lungo max 1024 px, JPEG) e restituisce il base64 senza prefisso. */
export async function prepareImage(file: File, maxSide = 768): Promise<{ base64: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL('image/jpeg', 0.8);
  return { base64: preview.split(',')[1] ?? '', preview };
}

interface Subject {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}

const prompt = (s: Subject, views: string[]) => `Sei un esperto di composizione corporea. Stima la percentuale di massa grassa della persona nelle foto (${views.join(' e ')}).
Dati: ${s.sex === 'm' ? 'uomo' : 'donna'}, ${s.age} anni, ${s.heightCm} cm, ${s.weightKg} kg.
Valuta definizione addominale, visibilità di vene e separazioni muscolari, accumulo di grasso su addome, fianchi e petto, proporzioni rispetto a peso e altezza (una persona muscolosa può avere un BMI alto con poco grasso).
Se le foto non mostrano chiaramente il busto o non ritraggono una persona, usa confidence "bassa" e spiegalo nelle note.
Rispondi SOLO con JSON valido, senza testo aggiuntivo, nel formato:
{"bodyFat": numero, "low": numero, "high": numero, "confidence": "bassa"|"media"|"alta", "notes": "max 2 frasi in italiano su cosa hai osservato"}`;

function parse(text: string): BodyFatAIResult {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Risposta dell'AI non valida");
  const r = JSON.parse(json) as Partial<BodyFatAIResult>;
  const bf = Number(r.bodyFat);
  if (!Number.isFinite(bf) || bf < 3 || bf > 60) throw new Error("L'AI non è riuscita a stimare la massa grassa da queste foto");
  const low = Number.isFinite(Number(r.low)) ? Number(r.low) : bf - 3;
  const high = Number.isFinite(Number(r.high)) ? Number(r.high) : bf + 3;
  const confidence = r.confidence === 'alta' || r.confidence === 'bassa' ? r.confidence : 'media';
  return { bodyFat: Math.round(bf * 10) / 10, low: Math.round(low), high: Math.round(high), confidence, notes: String(r.notes ?? '').slice(0, 300) };
}

export async function estimateBodyFatFromPhotos(
  images: { base64: string; view: 'fronte' | 'profilo' }[],
  subject: Subject,
  onProgress?: Progress,
  isCancelled?: () => boolean,
): Promise<BodyFatAIResult> {
  const ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
  const parts = [
    { text: prompt(subject, images.map((i) => i.view)) },
    ...images.map((i) => ({ inlineData: { mimeType: 'image/jpeg', data: i.base64 } })),
  ];
  let lastError: unknown = null;
  let allMissing = true;
  let transientFailures = 0;
  const cancelled = () => {
    if (isCancelled?.()) throw new Error('Analisi annullata');
  };

  for (const model of modelOrder()) {
    // Fino a 2 tentativi per modello se il server è occupato, poi si passa al successivo (più leggero)
    for (let attempt = 1; attempt <= 2; attempt++) {
      cancelled();
      onProgress?.(transientFailures ? `Server occupato, nuovo tentativo (${model})…` : 'Analisi in corso…');
      try {
        const m = getGenerativeModel(
          ai,
          { model, generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } },
          { timeout: TIMEOUT_MS },
        );
        const res = await m.generateContent(parts);
        cancelled();
        const result = parse(res.response.text());
        try {
          localStorage.setItem(MODEL_KEY, model);
        } catch {
          /* ignorato */
        }
        return result;
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'Analisi annullata') throw e;
        if (isModelMissing(msg)) break; // modello inesistente: prova il prossimo
        allMissing = false;
        if (!isTransient(msg)) throw friendlyError(e); // errore definitivo (quota, sicurezza, permessi…)
        transientFailures++;
        if (transientFailures >= 4) throw friendlyError(e);
        await sleep(1500 * attempt);
      }
    }
  }
  if (allMissing)
    throw new Error(
      'Nessun modello Gemini disponibile nel progetto. Controlla in Firebase Console → AI Logic i modelli disponibili e impostane uno con VITE_GEMINI_MODEL.',
    );
  throw friendlyError(lastError);
}

function friendlyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/api-not-enabled|AI Logic|firebasevertexai|firebaseml|PERMISSION_DENIED|403/i.test(msg))
    return new Error('Firebase AI Logic non è attivo nel progetto: vedi SETUP.md, passo 7.');
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) return new Error('Limite gratuito raggiunto per oggi: riprova più tardi.');
  if (/deadline|timed? ?out|timeout|unavailable|overloaded|503/i.test(msg))
    return new Error("I server gratuiti di Gemini sono sovraccarichi in questo momento. Riprova tra qualche minuto.");
  if (/SAFETY|blocked/i.test(msg)) return new Error("L'AI ha rifiutato la foto: usa una foto con busto visibile e abbigliamento sportivo.");
  if (/network|fetch/i.test(msg)) return new Error('Connessione assente: serve internet per l’analisi.');
  return e instanceof Error ? e : new Error(msg);
}
