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

/** Breve doppio "beep" via Web Audio (nessun file audio da scaricare). */
export function playBeep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
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
  } catch {
    /* ignorato */
  }
}

/** Da chiamare su un gesto utente per sbloccare l'audio su iOS. */
export function unlockAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* ignorato */
  }
}
