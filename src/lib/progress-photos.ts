/**
 * Foto settimanali dei progressi: compressione, stima della massa grassa e confronto con la settimana prima.
 * Le foto restano nel tuo account (Firestore, piano gratuito): ~100 KB l'una + miniatura.
 */
import { callAIJson, type AIOptions } from './ai';
import type { Sex } from './metabolism';

/** Ridimensiona e comprime una foto: restituisce un data URL JPEG. */
export async function compressPhoto(file: File, maxSide = 720, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', quality);
}

/** Miniatura da un data URL già compresso. */
export async function thumbOf(dataUrl: string, maxSide = 200): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}

const b64 = (dataUrl: string) => dataUrl.split(',')[1] ?? '';

export interface WeekPhotoResult {
  bodyFat: number;
  low: number;
  high: number;
  comment: string;
}

export async function analyzeWeekPhoto(
  images: { front: string; side?: string },
  previous: { front: string; date: string; bodyFat?: number } | null,
  subject: { sex: Sex; age: number; heightCm: number; weightKg: number; goal: string },
  opts: AIOptions = {},
): Promise<WeekPhotoResult> {
  const parts = [
    { inlineData: { mimeType: 'image/jpeg', data: b64(images.front) } },
    ...(images.side ? [{ inlineData: { mimeType: 'image/jpeg', data: b64(images.side) } }] : []),
    ...(previous ? [{ inlineData: { mimeType: 'image/jpeg', data: b64(previous.front) } }] : []),
  ];
  return callAIJson(
    `Sei un esperto di composizione corporea e un coach. Ricevi ${images.side ? 'la foto di fronte e quella di profilo di QUESTA settimana' : 'la foto di fronte di QUESTA settimana'}${previous ? `, e per ultima la foto di fronte del ${previous.date}${previous.bodyFat ? ` (stima allora ${previous.bodyFat}%)` : ''}` : ''}.
Persona: ${subject.sex === 'm' ? 'uomo' : 'donna'}, ${subject.age} anni, ${subject.heightCm} cm, ${subject.weightKg} kg, fase attuale: ${subject.goal}.
1) Stima la massa grassa di QUESTA settimana (definizione addominale, vene, separazioni, accumulo su addome e fianchi).
2) ${previous ? 'Confronta con la foto precedente: cosa è cambiato (vita, addome, spalle, definizione). Sii onesto: se luce o posa sono diverse dillo e non trarre conclusioni forzate.' : 'È la prima foto: descrivi il punto di partenza.'}
3) Un consiglio pratico per la prossima foto o per la fase in corso.
Rispondi SOLO con JSON: {"bodyFat": numero, "low": numero, "high": numero, "comment": "3 frasi brevi in italiano, seconda persona"}`,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const bf = Number(r.bodyFat);
      if (!Number.isFinite(bf) || bf < 3 || bf > 60) throw new Error('Non riesco a stimare la massa grassa da questa foto: busto ben visibile e buona luce');
      return {
        bodyFat: Math.round(bf * 10) / 10,
        low: Math.round(Number(r.low) || bf - 3),
        high: Math.round(Number(r.high) || bf + 3),
        comment: String(r.comment ?? '').replace(/[*#`]/g, '').slice(0, 500),
      };
    },
    { prefer: 'flash', temperature: 0.2, label: 'Il coach guarda le tue foto…', ...opts },
    parts,
  );
}
