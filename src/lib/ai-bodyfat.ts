import { callAIJson, CANCELLED, type Progress } from './ai';
import type { Sex } from './metabolism';

/**
 * Stima della massa grassa da foto con Gemini. Le foto vengono ridimensionate sul dispositivo,
 * inviate solo per l'analisi e non salvate dall'app.
 */

export interface BodyFatAIResult {
  bodyFat: number;
  low: number;
  high: number;
  confidence: 'bassa' | 'media' | 'alta';
  notes: string;
}

export type { Progress };

/** Ridimensiona la foto (lato lungo max 768 px, JPEG) e restituisce il base64 senza prefisso. */
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

function parse(raw: unknown): BodyFatAIResult {
  const r = (raw ?? {}) as Partial<BodyFatAIResult>;
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
  try {
    return await callAIJson(
      prompt(subject, images.map((i) => i.view)),
      parse,
      { temperature: 0.2, onProgress, isCancelled, label: 'Analisi in corso…', prefer: 'flash' },
      images.map((i) => ({ inlineData: { mimeType: 'image/jpeg', data: i.base64 } })),
    );
  } catch (e) {
    if (e instanceof Error && e.message === CANCELLED) throw new Error('Analisi annullata');
    throw e;
  }
}
