/** Wrapper per navigator.vibrate (no-op dove non supportato, es. Safari iOS). */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignorato */
  }
}

export const haptics = {
  tap: () => vibrate(10),
  setDone: () => vibrate([30]),
  pr: () => vibrate([80, 40, 80, 40, 200]),
  timerEnd: () => vibrate([200, 100, 200]),
  sessionSaved: () => vibrate([100, 50, 100, 50, 200]),
};

let audioCtx: AudioContext | null = null;
let soundInSilent = false;

/** Bip anche con l'iPhone in silenzioso (Safari 16.4+): il suono diventa «di riproduzione» solo durante il bip. */
export function setSoundInSilent(value: boolean): void {
  soundInSilent = value;
}

type AudioSessionLike = { type: string };
const audioSession = (): AudioSessionLike | null =>
  typeof navigator !== 'undefined' ? ((navigator as unknown as { audioSession?: AudioSessionLike }).audioSession ?? null) : null;

/** Il telefono permette di suonare anche in modalità silenziosa? */
export const canPlayInSilent = (): boolean => audioSession() != null;

function context(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  return audioCtx;
}

let restoreTimer = 0;

/**
 * Breve doppio "beep" via Web Audio (nessun file audio da scaricare).
 * Prima risveglia l'audio: dopo che l'app è stata in secondo piano (o dopo una chiamata/notifica)
 * iPhone lo lascia sospeso e il bip non si sentirebbe.
 */
export async function playBeep(): Promise<void> {
  try {
    const ctx = context();
    if (!ctx) return;
    const session = audioSession();
    if (soundInSilent && session) {
      window.clearTimeout(restoreTimer);
      session.type = 'playback';
    }
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i ? 1175 : 880;
      const t = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    // finito il bip si torna al suono normale (la musica di altre app non viene più disturbata)
    if (soundInSilent && session) restoreTimer = window.setTimeout(() => (session.type = 'auto'), 1500);
  } catch {
    /* ignorato */
  }
}

/** Da chiamare su un gesto utente (o al ritorno nell'app) per sbloccare/risvegliare l'audio su iOS. */
export function unlockAudio(): void {
  try {
    const ctx = context();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  } catch {
    /* ignorato */
  }
}
