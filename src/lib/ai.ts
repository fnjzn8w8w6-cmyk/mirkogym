import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebase';

/**
 * Motore AI comune (Gemini via Firebase AI Logic, Gemini Developer API — piano gratuito Spark).
 * - Prova i modelli Flash più recenti e ricorda il primo disponibile (Google li ritira spesso).
 * - Timeout per richiesta, nuovi tentativi su sovraccarico, passaggio ai modelli "lite".
 * - L'AI interpreta e compone: i numeri (calorie, serie, carichi) restano calcolati dall'app.
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
const TIMEOUT_MS = 35_000;

export type Progress = (status: string) => void;
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface AIOptions {
  json?: boolean;
  temperature?: number;
  onProgress?: Progress;
  isCancelled?: () => boolean;
  /** Etichetta mostrata durante l'attesa (es. "Creo il piano alimentare…"). */
  label?: string;
}

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

const isTransient = (msg: string) =>
  /deadline|timed? ?out|timeout|unavailable|overloaded|503|500|502|504|internal|aborted|fetch-error|network/i.test(msg) &&
  !/RESOURCE_EXHAUSTED|quota|429/i.test(msg);
const isModelMissing = (msg: string) => /not.?found|404|not supported|unsupported|is not available|does not exist|unknown model/i.test(msg);
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export const CANCELLED = 'Operazione annullata';

/** Chiama Gemini e restituisce il testo della risposta. */
export async function callAI(parts: Part[], opts: AIOptions = {}): Promise<string> {
  const ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
  let lastError: unknown = null;
  let allMissing = true;
  let transientFailures = 0;
  const check = () => {
    if (opts.isCancelled?.()) throw new Error(CANCELLED);
  };

  for (const model of modelOrder()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      check();
      opts.onProgress?.(transientFailures ? `Server occupato, nuovo tentativo…` : (opts.label ?? 'Elaborazione in corso…'));
      try {
        const m = getGenerativeModel(
          ai,
          {
            model,
            generationConfig: {
              temperature: opts.temperature ?? 0.4,
              ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            },
          },
          { timeout: TIMEOUT_MS },
        );
        const res = await m.generateContent(parts);
        check();
        const text = res.response.text();
        try {
          localStorage.setItem(MODEL_KEY, model);
        } catch {
          /* ignorato */
        }
        return text;
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === CANCELLED) throw e;
        if (isModelMissing(msg)) break;
        allMissing = false;
        if (!isTransient(msg)) throw friendlyError(e);
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

/** Chiama Gemini chiedendo JSON e lo valida con `parse` (che deve lanciare se i dati non sono validi). */
export async function callAIJson<T>(prompt: string, parse: (raw: unknown) => T, opts: AIOptions = {}, extra: Part[] = []): Promise<T> {
  const text = await callAI([{ text: prompt }, ...extra], { ...opts, json: true });
  const json = text.match(/[[{][\s\S]*[\]}]/)?.[0];
  if (!json) throw new Error("Risposta dell'AI non valida, riprova");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Risposta dell'AI incompleta, riprova");
  }
  return parse(raw);
}

export function friendlyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/api-not-enabled|AI Logic|firebasevertexai|firebaseml|PERMISSION_DENIED|403/i.test(msg))
    return new Error('Firebase AI Logic non è attivo nel progetto: vedi SETUP.md, passo 7.');
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) return new Error('Limite gratuito raggiunto per oggi: riprova più tardi.');
  if (/deadline|timed? ?out|timeout|unavailable|overloaded|503/i.test(msg))
    return new Error('I server gratuiti di Gemini sono sovraccarichi in questo momento. Riprova tra qualche minuto.');
  if (/SAFETY|blocked/i.test(msg)) return new Error("L'AI ha rifiutato la richiesta: riformula o usa un'altra foto.");
  if (/network|fetch/i.test(msg)) return new Error('Connessione assente: serve internet.');
  return e instanceof Error ? e : new Error(msg);
}

/* ---------- Helper di validazione ---------- */

export const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
export const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const strArr = (v: unknown, maxItems = 10, maxLen = 120): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
