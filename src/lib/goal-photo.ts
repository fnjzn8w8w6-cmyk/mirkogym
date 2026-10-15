/**
 * Foto obiettivo generata dall'AI (prova tecnica).
 * Usa Puter.js con Nano Banana (modello immagini di Google): gratis per l'app (ogni utente usa la quota gratuita di Puter)
 * e senza registrazione (Puter crea un utente temporaneo anonimo al primo uso).
 */
import type { GoalPhase } from './goal-plan';
import type { UserProfile } from './metabolism';
import { checkPlan, compOf, type Comp } from './goal-feasibility';

const SCRIPT = 'https://js.puter.com/v2/';
/** Modelli da provare in ordine (Nano Banana 2, poi Nano Banana). */
const MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image-preview'];

interface PuterAI {
  auth: { isSignedIn(): boolean; signIn(o?: { attempt_temp_user_creation?: boolean }): Promise<unknown> };
  ai: { txt2img(prompt: string, o?: Record<string, unknown>): Promise<HTMLImageElement> };
  quiet?: boolean;
}
declare global {
  interface Window {
    puter?: PuterAI;
  }
}

let loading: Promise<PuterAI> | null = null;
/** Carica Puter.js una volta sola (va fatto prima del tocco su "Genera": la finestra di Puter deve aprirsi subito al tocco). */
export function loadPuter(): Promise<PuterAI> {
  if (window.puter) return Promise.resolve(window.puter);
  if (!loading) {
    loading = new Promise<PuterAI>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => {
        if (!window.puter) return reject(new Error('Puter non disponibile'));
        window.puter.quiet = true;
        resolve(window.puter);
      };
      s.onerror = () => reject(new Error('Puter non raggiungibile (connessione?)'));
      document.head.appendChild(s);
    });
    // se non si carica, al prossimo tentativo si riprova
    loading.catch(() => (loading = null));
  }
  return loading;
}

export type Composition = Comp;
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface PhaseProjection {
  phase: GoalPhase;
  index: number;
  from: Composition;
  to: Composition;
  weeks: number;
  /** avviso se i numeri del piano non sono realistici (e cosa uso al loro posto) */
  note?: string;
}

/** Composizione a fine di ogni fase, in ordine, partendo da oggi: lo stesso calcolo della verifica del coach. */
export function projectPhases(p: UserProfile, now: { weight: number; bf: number }, phases: GoalPhase[], current: number): PhaseProjection[] {
  return checkPlan(p, compOf(now.weight, now.bf), phases, current).map((c) => ({
    phase: c.phase,
    index: c.index,
    from: c.from,
    to: c.to,
    weeks: c.weeks,
    note: c.issues[0] ? `${c.issues[0]} La foto usa i numeri realistici.` : undefined,
  }));
}

/** Come appare l'addome a una certa percentuale di grasso (uomo; per la donna le soglie sono circa +7%). */
function lookAt(bf: number, female: boolean): string {
  const b = female ? bf - 7 : bf;
  if (b >= 20) return 'soft midsection with no visible abdominal muscles, smooth arms';
  if (b >= 16) return 'flat stomach, abs not visible except a faint upper outline in direct light, some shape in shoulders and arms';
  if (b >= 13) return 'upper abs visible, lower abs faint, clear shoulder and arm shape';
  if (b >= 10) return 'clearly visible six-pack and obliques, defined shoulders and arms, light vascularity on the forearms';
  return 'very lean physique, sharp and deep abdominal definition, visible vascularity on arms and lower abdomen';
}

/** Istruzioni per l'AI (in inglese: i modelli immagine le seguono meglio). */
export function goalPrompt(p: PhaseProjection, female: boolean, steps: GoalPhase['type'][] = [p.phase.type]): string {
  const what = (t: GoalPhase['type']) => (t === 'cut' ? 'a fat-loss phase' : t === 'maintain' ? 'a recomposition phase' : 'a lean muscle-gain phase');
  const f = (c: Composition) => `${r1(c.weight)} kg at ${r1(c.bf)}% body fat (lean mass ${r1(c.lean)} kg, fat mass ${r1(c.fat)} kg)`;
  return [
    'Edit this real fitness progress photo. Output the SAME photo of the SAME person after a training phase.',
    'Keep exactly the same: face and identity, hairstyle, skin tone, tattoos, pose, camera angle and framing, clothing, background and lighting.',
    `Change ONLY the body composition: now ${f(p.from)}; after ${Math.round(p.weeks)} weeks of ${steps.map(what).join(' followed by ')}: ${f(p.to)}.`,
    `Target look: ${lookAt(p.to.bf, female)}.`,
    'The result must be realistic and achievable naturally (drug-free) in that time: do not exaggerate muscle size, keep natural proportions and skin texture. Photorealistic, no text, no watermark.',
  ].join('\n');
}

/** Riduce la foto (max 1024 px) per inviarla più in fretta e consumare meno quota. */
async function shrink(src: string, max = 1024): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Foto non leggibile'));
    i.src = src;
  });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

async function toDataUrl(img: HTMLImageElement): Promise<string> {
  if (img.src.startsWith('data:')) return img.src;
  const blob = await (await fetch(img.src)).blob();
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
}

/** Accesso a Puter (utente temporaneo): da chiamare subito al tocco, prima di qualsiasi altra attesa. */
export async function ensurePuterUser(puter: PuterAI): Promise<void> {
  if (!puter.auth.isSignedIn()) await puter.auth.signIn({ attempt_temp_user_creation: true });
}

const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e)).slice(0, 300);

/** Genera la foto obiettivo: restituisce l'immagine (data URL) e il modello usato. */
export async function generateGoalPhoto(puter: PuterAI, photo: string, prompt: string): Promise<{ image: string; model: string }> {
  const input = await shrink(photo);
  const errors: string[] = [];
  for (const model of MODELS) {
    // formato attuale (input_images) e quello vecchio (input_image + tipo)
    for (const opts of [{ model, input_images: [input] }, { model, input_image: input.split(',')[1], input_image_mime_type: 'image/jpeg' }]) {
      try {
        const img = await puter.ai.txt2img(prompt, opts);
        return { image: await toDataUrl(img), model };
      } catch (e) {
        errors.push(`${model}: ${errText(e)}`);
      }
    }
  }
  throw new Error(errors.join(' | '));
}
