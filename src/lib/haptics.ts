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

/** Durata del suono di fine recupero (secondi). */
export const ALARM_SECONDS = 2.6;

/**
 * Suono di fine recupero: tre gruppi di doppi bip in ~2,6 s, l'ultimo più acuto.
 * Onda quadra filtrata (timbro «sveglia») sui 1-2 kHz, dove la musica è meno densa: si sente sopra Spotify;
 * un compressore lo porta al volume pieno senza distorcere.
 */
function scheduleAlarm(ctx: BaseAudioContext, at: number) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4500;
  const master = ctx.createGain();
  master.gain.value = 1.45;
  tone.connect(comp).connect(master).connect(ctx.destination);
  const groups: [number, number][] = [
    [0, 1318],
    [0.9, 1318],
    [1.8, 1760],
  ];
  for (const [start, freq] of groups)
    for (const k of [0, 1]) {
      const t = at + start + k * 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
      gain.gain.setValueAtTime(0.5, t + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(tone);
      osc.start(t);
      osc.stop(t + 0.18);
    }
}

/** Il suono di fine recupero come file WAV (per ascoltarlo fuori dall'app). */
export async function renderAlarmWav(): Promise<Blob> {
  const rate = 44100;
  const off = new OfflineAudioContext(1, Math.ceil(rate * (ALARM_SECONDS + 0.2)), rate);
  scheduleAlarm(off, 0.03);
  const buf = await off.startRendering();
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o: number, t: string) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + data.length * 2, true);
  w(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, data.length * 2, true);
  data.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Suono di fine recupero via Web Audio (nessun file audio da scaricare).
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
    scheduleAlarm(ctx, ctx.currentTime + 0.03);
    // finito il bip si torna al suono normale (la musica di altre app non viene più disturbata)
    if (soundInSilent && session) restoreTimer = window.setTimeout(() => (session.type = 'auto'), (ALARM_SECONDS + 0.5) * 1000);
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
