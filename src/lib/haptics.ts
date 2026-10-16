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
/**
 * iPhone: dopo che l'app è stata in secondo piano l'audio può restare "acceso" ma muto.
 * Quando torni nell'app lo si rifà da capo al primo tocco (solo un tocco può riattivare l'audio su iOS).
 */
let staleAudio = false;
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && audioCtx) staleAudio = true;
  });
function context(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  return audioCtx;
}

export type AlarmId = 'sveglia' | 'campanella' | 'fischietto' | 'ring' | 'arcade';

/** Suoni di fine recupero: tutti lunghi 2-3 s e sulle note acute, dove la musica è meno densa (si sentono sopra Spotify). */
export const ALARMS: { id: AlarmId; label: string; note: string; seconds: number }[] = [
  { id: 'sveglia', label: 'Sveglia', note: 'Tre doppi bip, l’ultimo più acuto', seconds: 2.6 },
  { id: 'campanella', label: 'Campanella', note: 'Tre rintocchi chiari', seconds: 2.9 },
  { id: 'fischietto', label: 'Fischietto', note: 'Due fischi da arbitro', seconds: 2.1 },
  { id: 'ring', label: 'Campana del ring', note: 'Ding-ding-ding come nella boxe', seconds: 2.5 },
  { id: 'arcade', label: 'Arcade', note: 'Arpeggio da videogioco che sale', seconds: 2.1 },
];

let alarmId: AlarmId = 'sveglia';
export function setAlarmSound(id: string | undefined): void {
  alarmId = ALARMS.some((a) => a.id === id) ? (id as AlarmId) : 'sveglia';
}

/** Uscita comune: compressore (volume pieno senza distorcere) e volume finale del suono. */
function output(ctx: BaseAudioContext, level: number, lowpass?: number): AudioNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  const master = ctx.createGain();
  master.gain.value = level;
  comp.connect(master).connect(ctx.destination);
  if (!lowpass) return comp;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = lowpass;
  tone.connect(comp);
  return tone;
}

/** Una nota: inviluppo con attacco breve, tenuta e coda (esponenziale). */
function note(ctx: BaseAudioContext, dest: AudioNode, o: { type: OscillatorType; freq: number; t: number; vol: number; hold: number; decay: number }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = o.type;
  osc.frequency.value = o.freq;
  gain.gain.setValueAtTime(0.0001, o.t);
  gain.gain.exponentialRampToValueAtTime(o.vol, o.t + 0.006);
  gain.gain.setValueAtTime(o.vol, o.t + o.hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, o.t + o.hold + o.decay);
  osc.connect(gain).connect(dest);
  osc.start(o.t);
  osc.stop(o.t + o.hold + o.decay + 0.02);
  return osc;
}

function scheduleAlarm(ctx: BaseAudioContext, at: number, id: AlarmId) {
  if (id === 'campanella') {
    // tre rintocchi: armonici di una campana che si spengono a velocità diverse
    const out = output(ctx, 1.22);
    const partials: [number, number, number][] = [
      [1, 0.5, 1.4],
      [2.0, 0.3, 1.0],
      [3.01, 0.22, 0.7],
      [4.2, 0.14, 0.5],
      [5.43, 0.1, 0.35],
    ];
    for (const start of [0, 0.85, 1.7])
      for (const [ratio, vol, decay] of partials) note(ctx, out, { type: 'sine', freq: 1046 * ratio, t: at + start, vol, hold: 0.01, decay });
    return;
  }
  if (id === 'fischietto') {
    // fischio da arbitro: nota acuta con trillo veloce
    const out = output(ctx, 1.38);
    for (const [start, len] of [
      [0, 0.75],
      [1.05, 0.95],
    ]) {
      const osc = note(ctx, out, { type: 'sine', freq: 2900, t: at + start, vol: 0.55, hold: len, decay: 0.05 });
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 26;
      depth.gain.value = 140;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at + start);
      lfo.stop(at + start + len + 0.1);
      note(ctx, out, { type: 'triangle', freq: 1450, t: at + start, vol: 0.12, hold: len, decay: 0.05 });
    }
    return;
  }
  if (id === 'ring') {
    // campana del ring: colpi metallici (armonici non intonati) ravvicinati
    const out = output(ctx, 1.22);
    const partials: [number, number][] = [
      [1, 0.4],
      [1.47, 0.28],
      [2.09, 0.2],
      [2.56, 0.16],
      [3.26, 0.1],
    ];
    for (const start of [0, 0.3, 0.6])
      for (const [ratio, vol] of partials) note(ctx, out, { type: 'triangle', freq: 740 * ratio, t: at + start, vol, hold: 0.01, decay: 1.6 / ratio });
    return;
  }
  if (id === 'arcade') {
    // arpeggio do-mi-sol-do che sale, due volte, con l'ultima nota lunga
    const out = output(ctx, 1.52, 5000);
    const notes = [1047, 1319, 1568, 2093];
    notes.forEach((f, i) => note(ctx, out, { type: 'square', freq: f, t: at + i * 0.11, vol: 0.4, hold: 0.08, decay: 0.03 }));
    notes.forEach((f, i) => note(ctx, out, { type: 'square', freq: f, t: at + 0.75 + i * 0.11, vol: 0.4, hold: i === 3 ? 0.7 : 0.08, decay: i === 3 ? 0.25 : 0.03 }));
    return;
  }
  // sveglia: tre gruppi di doppi bip, l'ultimo più acuto (onda quadra filtrata)
  const out = output(ctx, 1.45, 4500);
  for (const [start, freq] of [
    [0, 1318],
    [0.9, 1318],
    [1.8, 1760],
  ])
    for (const k of [0, 1]) note(ctx, out, { type: 'square', freq, t: at + start + k * 0.2, vol: 0.5, hold: 0.125, decay: 0.03 });
}

/**
 * Suono di fine recupero via Web Audio (nessun file audio da scaricare).
 * Prima risveglia l'audio: dopo che l'app è stata in secondo piano (o dopo una chiamata/notifica)
 * iPhone lo lascia sospeso e il bip non si sentirebbe.
 */
export async function playBeep(id: AlarmId = alarmId): Promise<void> {
  try {
    const ctx = context();
    if (!ctx) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    scheduleAlarm(ctx, ctx.currentTime + 0.03, id);
  } catch {
    /* ignorato */
  }
}

/**
 * Da chiamare su un gesto utente (o al ritorno nell'app) per sbloccare/risvegliare l'audio su iOS.
 * `fromGesture`: dentro un tocco si può ricreare l'audio rimasto muto dopo il secondo piano.
 */
export function unlockAudio(fromGesture = false): void {
  try {
    if (fromGesture && staleAudio && audioCtx) {
      staleAudio = false;
      const old = audioCtx;
      audioCtx = null;
      void old.close().catch(() => undefined);
    }
    const ctx = context();
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (fromGesture) {
      // un suono muto dentro il tocco: su iOS è ciò che sblocca davvero l'audio
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    /* ignorato */
  }
}
