/**
 * Modello dell'allenamento: impara dai tuoi dati
 * - RIR calibrato (quanto sei preciso quando dici "me ne restavano 2");
 * - fatica per gruppo muscolare → settimana leggera mirata;
 * - volume ideale per gruppo (le serie con cui progredisci di più);
 * - carichi equivalenti quando sostituisci un esercizio.
 */
import type { ExerciseLog, Session } from '@/types';
import { epley1RM, exerciseKey } from './analytics';
import { weekStart } from './date-utils';
import type { PainInfo } from './athlete';

const DAY = 86400000;
const WEEK = 7 * DAY;
const working = (l: ExerciseLog) => l.sets.filter((s) => s.type !== 'warmup' && s.weight > 0 && s.reps > 0);

/* ---------- RIR calibrato ---------- */

export interface RirCalibration {
  /** ripetizioni "nascoste" in media: > 0 = ne lasci più di quante dichiari */
  offset: number;
  samples: number;
}

/**
 * Due serie consecutive allo stesso peso: se dichiari RIR ≤ 3, la serie dopo di norma perde ~1 ripetizione.
 * Se invece ne fai tante quante (o di più), ti restavano più ripetizioni di quelle che pensavi.
 */
export function rirCalibration(logs: ExerciseLog[]): RirCalibration | null {
  const obs: number[] = [];
  for (const l of logs) {
    const w = working(l);
    for (let i = 0; i + 1 < w.length; i++) {
      const a = w[i];
      const b = w[i + 1];
      if (a.rir == null || a.rir > 3 || Math.abs(a.weight - b.weight) > 0.01) continue;
      obs.push(Math.max(-2, Math.min(3, b.reps - (a.reps - 1))));
    }
  }
  if (obs.length < 3) return null;
  const raw = obs.reduce((x, y) => x + y, 0) / obs.length;
  // prudenza: con pochi dati l'effetto viene ridotto
  const offset = Math.round(raw * (obs.length / (obs.length + 4)) * 10) / 10;
  return { offset, samples: obs.length };
}

/** Aumento di carico suggerito dalla calibrazione (≈ 2,5% per ogni ripetizione nascosta, max 5%). */
export function calibrationBump(weight: number, cal: RirCalibration | null, dumbbell = false): number {
  if (!cal || cal.offset < 0.75) return 0;
  const raw = weight * Math.min(0.05, 0.025 * cal.offset);
  const step = dumbbell ? 1 : 1.25;
  return Math.max(step, Math.round(raw / step) * step);
}

/* ---------- Fatica per gruppo muscolare ---------- */

export const PAIN_GROUPS: Record<string, string[]> = {
  Spalla: ['Spalle', 'Petto'],
  Ginocchio: ['Gambe'],
  Schiena: ['Dorso', 'Gambe'],
  Gomito: ['Bicipiti', 'Tricipiti'],
  Polso: ['Bicipiti', 'Avambracci'],
  Anca: ['Gambe', 'Glutei'],
  Collo: ['Spalle'],
};

export interface GroupFatigue {
  group: string;
  score: number;
  acute: number;
  chronic: number;
  light: boolean;
  reasons: string[];
}

/**
 * Indice di fatica 0–100: serie dell'ultima settimana rispetto alla media delle 4 precedenti (rapporto acuto/cronico),
 * fastidi attivi sulla zona, energia e voti bassi negli ultimi resoconti. Sopra 70 → settimana leggera per quel gruppo.
 */
export function groupFatigue(sessions: Session[], groupOf: (l: ExerciseLog) => string, pains: PainInfo[] = [], now = Date.now()): Map<string, GroupFatigue> {
  const out = new Map<string, GroupFatigue>();
  const first = Math.min(...sessions.map((s) => s.date));
  if (!sessions.length || now - first < 21 * DAY) return out;
  const acute = new Map<string, number>();
  const chronic = new Map<string, number>();
  for (const s of sessions) {
    const age = now - s.date;
    if (age > 35 * DAY) continue;
    for (const l of s.logs) {
      const g = groupOf(l);
      const n = working(l).length;
      if (age <= 7 * DAY) acute.set(g, (acute.get(g) ?? 0) + n);
      else chronic.set(g, (chronic.get(g) ?? 0) + n);
    }
  }
  const recent = sessions.filter((s) => s.recap && now - s.date <= 10 * DAY);
  const lowEnergy = recent.length >= 2 && recent.reduce((a, s) => a + s.recap!.energy + s.recap!.rating, 0) / (2 * recent.length) <= 2.5;
  const painGroups = new Set(pains.filter((p) => p.active).flatMap((p) => PAIN_GROUPS[p.part] ?? []));
  for (const g of new Set([...acute.keys(), ...chronic.keys()])) {
    const a = acute.get(g) ?? 0;
    const c = (chronic.get(g) ?? 0) / 4;
    if (c < 2) continue;
    const ratio = a / c;
    const reasons: string[] = [];
    let score = Math.max(0, Math.min(60, (ratio - 1) * 120));
    if (ratio >= 1.3) reasons.push(`${a} serie nell'ultima settimana contro una media di ${Math.round(c)}`);
    if (painGroups.has(g)) {
      score += 25;
      reasons.push('fastidio segnalato in questa zona');
    }
    if (lowEnergy) {
      score += 10;
      reasons.push('energia e voti bassi negli ultimi allenamenti');
    }
    score = Math.round(Math.min(100, score));
    out.set(g, { group: g, score, acute: a, chronic: Math.round(c), light: score >= 70, reasons });
  }
  return out;
}

/* ---------- Volume ideale per gruppo ---------- */

export interface IdealVolume {
  group: string;
  min: number;
  max: number;
  /** true = calcolato dai tuoi dati; false = fascia standard */
  personal: boolean;
  weeks: number;
}

const BUCKETS: [number, number][] = [
  [1, 9],
  [10, 14],
  [15, 19],
  [20, 30],
];

/**
 * Per ogni settimana: serie fatte per il gruppo e variazione della forza (massimale stimato medio) la settimana dopo.
 * La fascia di serie con il progresso medio più alto (con almeno 2 settimane) è il tuo volume ideale.
 */
export function idealVolumes(sessions: Session[], groupOf: (l: ExerciseLog) => string, nameOf: (l: ExerciseLog) => string, fallback: [number, number]): Map<string, IdealVolume> {
  const weeks = new Map<number, Map<string, { sets: number; e1: Map<string, number> }>>();
  for (const s of sessions) {
    const wk = weekStart(s.date).getTime();
    const wmap = weeks.get(wk) ?? new Map();
    for (const l of s.logs) {
      const w = working(l);
      if (!w.length) continue;
      const g = groupOf(l);
      const rec = wmap.get(g) ?? { sets: 0, e1: new Map<string, number>() };
      rec.sets += w.length;
      const k = exerciseKey(nameOf(l));
      rec.e1.set(k, Math.max(rec.e1.get(k) ?? 0, ...w.map((x) => epley1RM(x.weight, x.reps))));
      wmap.set(g, rec);
    }
    weeks.set(wk, wmap);
  }
  const keys = [...weeks.keys()].sort((a, b) => a - b);
  const byGroup = new Map<string, { sets: number; gain: number }[]>();
  for (let i = 0; i + 1 < keys.length; i++) {
    if (keys[i + 1] - keys[i] > WEEK + DAY) continue;
    for (const [g, cur] of weeks.get(keys[i])!) {
      const next = weeks.get(keys[i + 1])!.get(g);
      if (!next) continue;
      const gains: number[] = [];
      for (const [k, v] of next.e1) {
        const before = cur.e1.get(k);
        if (before) gains.push((v - before) / before);
      }
      if (gains.length) byGroup.set(g, [...(byGroup.get(g) ?? []), { sets: cur.sets, gain: gains.reduce((a, b) => a + b, 0) / gains.length }]);
    }
  }
  const out = new Map<string, IdealVolume>();
  const groups = new Set<string>();
  for (const w of weeks.values()) for (const g of w.keys()) groups.add(g);
  for (const g of groups) {
    const pts = byGroup.get(g) ?? [];
    let best: { b: [number, number]; gain: number } | null = null;
    if (pts.length >= 6) {
      for (const b of BUCKETS) {
        const inB = pts.filter((p) => p.sets >= b[0] && p.sets <= b[1]);
        if (inB.length < 2) continue;
        const gain = inB.reduce((a, p) => a + p.gain, 0) / inB.length;
        if (!best || gain > best.gain) best = { b, gain };
      }
    }
    out.set(g, best ? { group: g, min: best.b[0], max: best.b[1], personal: true, weeks: pts.length } : { group: g, min: fallback[0], max: fallback[1], personal: false, weeks: pts.length });
  }
  return out;
}

/* ---------- Carichi equivalenti ---------- */

type Kind = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'smith' | 'ez' | 'other';

/** Carico totale tipico rispetto al bilanciere (manubri: somma dei due). */
const RATIO: Record<Kind, number> = { barbell: 1, smith: 0.9, ez: 0.9, dumbbell: 0.8, machine: 1, cable: 0.6, other: 1 };

export function kindOf(name: string, equipment?: string): Kind {
  const e = (equipment ?? '').toLowerCase();
  if (e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('e-z')) return 'ez';
  if (e.includes('cable')) return 'cable';
  if (e.includes('machine')) return /smith/i.test(name) ? 'smith' : 'machine';
  if (e.includes('barbell')) return 'barbell';
  const n = name.toLowerCase();
  if (/manubri|dumbbell/.test(n)) return 'dumbbell';
  if (/smith/.test(n)) return 'smith';
  if (/\bez\b|bilanciere ez/.test(n)) return 'ez';
  if (/cav|pulley|cable|lat machine|pulldown/.test(n)) return 'cable';
  if (/macchina|machine|pressa|leg press|leg curl|leg extension|chest press/.test(n)) return 'machine';
  if (/bilanciere|barbell|stacco|squat|panca piana|rematore con bilanciere/.test(n)) return 'barbell';
  return 'other';
}

export interface Conversion {
  /** valore da inserire (per i manubri: il peso di UN manubrio) */
  weight: number;
  label: string;
  personal: boolean;
}

/**
 * Carico equivalente quando sostituisci un esercizio: rapporto standard tra attrezzi,
 * oppure il tuo rapporto reale se hai già fatto entrambi gli esercizi.
 */
export function convertLoad(
  from: { name: string; equipment?: string; weight: number },
  to: { name: string; equipment?: string },
  sessions: Session[],
  nameOf: (l: ExerciseLog) => string,
): Conversion | null {
  if (!(from.weight > 0)) return null;
  const kf = kindOf(from.name, from.equipment);
  const kt = kindOf(to.name, to.equipment);
  const best = (name: string) => {
    let b = 0;
    for (const s of sessions) if (Date.now() - s.date < 90 * DAY) for (const l of s.logs) if (exerciseKey(nameOf(l)) === exerciseKey(name)) for (const x of working(l)) b = Math.max(b, epley1RM(x.weight, x.reps));
    return b;
  };
  const bf = best(from.name);
  const bt = best(to.name);
  let total: number;
  let personal = false;
  const fromTotal = kf === 'dumbbell' ? from.weight * 2 : from.weight;
  if (bf > 0 && bt > 0) {
    total = (kt === 'dumbbell' ? bt * 2 : bt) / (kf === 'dumbbell' ? bf * 2 : bf) * fromTotal;
    personal = true;
  } else {
    if (kf === kt && kf !== 'other') return null;
    total = (fromTotal / RATIO[kf]) * RATIO[kt];
  }
  if (kt === 'dumbbell') {
    const each = Math.max(1, Math.round(total / 2 / 2) * 2);
    return { weight: each, label: `2 × ${each} kg`, personal };
  }
  const w = Math.max(1.25, Math.round(total / 2.5) * 2.5);
  return { weight: w, label: `${String(w).replace('.', ',')} kg`, personal };
}
