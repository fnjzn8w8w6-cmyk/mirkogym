import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebase';

/**
 * Motore AI comune (Gemini via Firebase AI Logic, Gemini Developer API — piano gratuito Spark).
 * - Prova i modelli Flash più recenti e ricorda il primo disponibile (Google li ritira spesso).
 * - Timeout per richiesta, nuovi tentativi su sovraccarico, passaggio ai modelli "lite".
 * - L'AI interpreta e compone: i numeri (calorie, serie, carichi) restano calcolati dall'app.
 */

/** Modelli Flash (più capaci, quota gratuita più bassa) — dal più recente. */
const FLASH = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash',
];
/** Modelli Lite (più veloci, quota gratuita più ampia). */
const LITE = ['gemini-3.1-flash-lite', 'gemini-3-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
const MODEL_KEY = 'mirkogym.geminiModel';
const EXHAUSTED_KEY = 'mirkogym.geminiExhausted';
const TIMEOUT_MS = 35_000;

export type Progress = (status: string) => void;
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface AIOptions {
  /** 'lite' = prima i modelli Lite (testo: coach, chat, pasti), 'flash' = prima i Flash (immagini). */
  prefer?: 'lite' | 'flash';
  json?: boolean;
  temperature?: number;
  onProgress?: Progress;
  isCancelled?: () => boolean;
  /** Etichetta mostrata durante l'attesa (es. "Creo il piano alimentare…"). */
  label?: string;
}

/* ---------- Quote per modello (il piano gratuito ha limiti separati per ogni modello) ---------- */

function readExhausted(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(EXHAUSTED_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function markExhausted(model: string, msg: string): void {
  const retry = Number(msg.match(/retry in ([\d.]+)s/i)?.[1]);
  const daily = /per.?day|PerDay|daily/i.test(msg);
  const ms = daily ? 24 * 3600_000 : Number.isFinite(retry) ? (retry + 5) * 1000 : 10 * 60_000;
  const map = readExhausted();
  map[model] = Date.now() + ms;
  try {
    localStorage.setItem(EXHAUSTED_KEY, JSON.stringify(map));
  } catch {
    /* ignorato */
  }
}
const exhaustedUntil = (model: string): number => readExhausted()[model] ?? 0;

function modelOrder(prefer: 'lite' | 'flash'): string[] {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(`${MODEL_KEY}.${prefer}`);
  } catch {
    /* ignorato */
  }
  const base = prefer === 'lite' ? [...LITE, ...FLASH] : [...FLASH, ...LITE];
  const list = [import.meta.env.VITE_GEMINI_MODEL, remembered, ...base].filter((m): m is string => Boolean(m));
  return [...new Set(list)];
}

const isQuota = (msg: string) => /RESOURCE_EXHAUSTED|quota|429|rate.?limit/i.test(msg);

function waitText(ms: number): string {
  const min = Math.ceil(ms / 60000);
  if (min <= 1) return 'tra circa un minuto';
  if (min < 60) return `tra circa ${min} minuti`;
  return `tra circa ${Math.ceil(min / 60)} ore`;
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
  const prefer = opts.prefer ?? 'lite';
  let lastError: unknown = null;
  let allMissing = true;
  let transientFailures = 0;
  let quotaHits = 0;
  const check = () => {
    if (opts.isCancelled?.()) throw new Error(CANCELLED);
  };

  for (const model of modelOrder(prefer)) {
    // Modello con quota esaurita di recente: salta senza consumare richieste
    if (exhaustedUntil(model) > Date.now()) {
      allMissing = false;
      quotaHits++;
      continue;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      check();
      opts.onProgress?.(transientFailures ? 'Server occupato, nuovo tentativo…' : (opts.label ?? 'Elaborazione in corso…'));
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
          localStorage.setItem(`${MODEL_KEY}.${prefer}`, model);
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
        if (isQuota(msg)) {
          // Quota del modello esaurita: annotala e passa al modello successivo (quote separate)
          markExhausted(model, msg);
          quotaHits++;
          break;
        }
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
  if (quotaHits > 0) {
    const times = Object.values(readExhausted()).filter((t) => t > Date.now());
    const soonest = times.length ? Math.min(...times) - Date.now() : 60_000;
    throw new Error(`Limite gratuito dell'AI raggiunto su tutti i modelli disponibili. Riprova ${waitText(soonest)}.`);
  }
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
