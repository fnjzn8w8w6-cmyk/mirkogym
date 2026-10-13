import type { Exercise, ExerciseLog, Session, SetLog, Suggestion, SuggestionType } from '@/types';
import { formatKg } from './analytics';

const round025 = (n: number) => Math.round(n * 4) / 4;

/** Esercizi di isolamento/leggeri: incremento 1.25 kg invece di 2.5 kg. */
const LIGHT_ISO = /alzate|curl|reverse fly|push ?over(head)?|pushdown|croci|leg curl|leg extension|pullover/i;

export const progressionStep = (exercise: Pick<Exercise, 'name'>): number => (LIGHT_ISO.test(exercise.name) ? 1.25 : 2.5);

export const parseRirNumbers = (rirTarget: string): number[] => (rirTarget.match(/\d+/g) ?? []).map(Number);

const validSetsOf = (log: ExerciseLog | undefined): SetLog[] =>
  (log?.sets ?? []).filter(
    (s) => s.type !== 'warmup' && Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.reps > 0,
  );

export interface PreviousLog extends ExerciseLog {
  date: number;
  deload?: boolean;
}

/** Log precedenti di un esercizio (per id, fallback per nome se l'id non ha storico), in ordine cronologico. */
export function previousLogsFor(exercise: Pick<Exercise, 'id' | 'name'>, sessions: Session[]): PreviousLog[] {
  const sorted = [...sessions].sort((a, b) => a.date - b.date);
  const collect = (match: (l: ExerciseLog) => boolean) =>
    sorted.flatMap((s) =>
      s.logs.filter((l) => match(l) && l.sets.length > 0).map((l) => ({ ...l, date: s.date, deload: s.deload })),
    );
  const byId = collect((l) => l.exerciseId === exercise.id);
  if (byId.length) return byId;
  const name = exercise.name.trim().toLowerCase();
  return collect((l) => (l.name ?? '').trim().toLowerCase() === name);
}

const kg = (n: number) => `${formatKg(n, 2)} kg`;
/** "1", "1 e 2", "1, 2 e 3" */
const setList = (idx: number[]) => {
  const n = idx.map((i) => String(i + 1));
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
};

type SetKind = 'progress' | 'maintain' | 'below' | 'exercise-deload';

/**
 * Algoritmo di progressione (double progression + RIR), serie per serie.
 * Ogni serie si confronta con la STESSA serie dell'ultima sessione (così le piramidi 60→70→80 progrediscono
 * su ogni gradino, e una serie pesante sotto range non blocca le altre):
 * - top del range con RIR ok → +incremento, si riparte dal fondo del range;
 * - nel range → stesso peso, +1 rep;
 * - sotto range → stesso peso, completa il range; due volte di fila sotto range → −10% su quella serie.
 * I log di deload vengono ignorati come riferimento.
 * `count` = quante serie preparare (le serie in più ripetono l'ultima).
 */
export function calculateSuggestion(
  exercise: Exercise,
  previousLogs: PreviousLog[],
  isDeloadWeek: boolean,
  deloadPercentage: number,
  count = Math.max(exercise.sets, 10),
): Suggestion {
  const training = previousLogs.filter((l) => !l.deload && validSetsOf(l).length > 0);
  const at = <T,>(arr: T[], i: number) => arr[Math.min(i, arr.length - 1)];

  if (isDeloadWeek) {
    const last = training.length ? validSetsOf(training[training.length - 1]) : [];
    const ref = last.length ? last.map((x) => x.weight) : exercise.startWeight ? [exercise.startWeight] : [];
    if (ref.length) {
      const weights = Array.from({ length: count }, (_, i) => round025(at(ref, i) * (1 - deloadPercentage / 100)));
      return { weight: weights[0], weights, reps: weights.map(() => exercise.repMin), shown: Math.max(1, exercise.sets), hint: `Deload week — ${deloadPercentage}% di riduzione`, type: 'deload' };
    }
  }

  if (training.length === 0) {
    if (exercise.startWeight) {
      return { weight: exercise.startWeight, hint: 'Carico di partenza — trova il tuo range', type: 'start' };
    }
    return { weight: null, hint: 'Prima sessione — inserisci peso di partenza', type: 'first' };
  }

  const last = validSetsOf(training[training.length - 1]);
  const before = training.length > 1 ? validSetsOf(training[training.length - 2]) : [];
  const rirNums = parseRirNumbers(exercise.rirTarget);
  const minTargetRir = rirNums.length ? Math.min(...rirNums) : 0;
  const step = progressionStep(exercise);

  const plan = Array.from({ length: count }, (_, i): { weight: number; reps: number; kind: SetKind } => {
    const p = at(last, i);
    if (p.reps >= exercise.repMax && (p.rir == null || p.rir >= minTargetRir)) return { weight: p.weight + step, reps: exercise.repMin, kind: 'progress' };
    if (p.reps >= exercise.repMin) return { weight: p.weight, reps: Math.min(exercise.repMax, p.reps + 1), kind: 'maintain' };
    const pp = before.length ? at(before, i) : undefined;
    if (pp && pp.reps < exercise.repMin && pp.weight <= p.weight) return { weight: round025(p.weight * 0.9), reps: exercise.repMin, kind: 'exercise-deload' };
    return { weight: p.weight, reps: exercise.repMin, kind: 'below' };
  });

  // riepilogo sulle serie in programma (una serie aggiunta a mano ha comunque il suo carico, ma non cambia il riepilogo)
  const shown = plan.slice(0, Math.max(1, exercise.sets));
  const by = (k: SetKind) => shown.map((x, i) => (x.kind === k ? i : -1)).filter((i) => i >= 0);
  const prog = by('progress');
  const keep = by('maintain');
  const below = by('below');
  const down = by('exercise-deload');
  let hint: string;
  if (prog.length === shown.length) hint = `Top range con RIR ok → +${formatKg(step, 2)}kg`;
  else if (keep.length === shown.length) hint = 'Stesso peso — punta ad aumentare le reps';
  else if (below.length === shown.length) hint = 'Stesso peso — completa il range';
  else if (down.length === shown.length) hint = `2 sessioni sotto range → deload -10% (${kg(last[0].weight)} → ${kg(plan[0].weight)})`;
  else {
    const parts: string[] = [];
    if (prog.length) parts.push(`serie ${setList(prog)}: top del range → +${formatKg(step, 2)} kg`);
    if (keep.length) parts.push(`serie ${setList(keep)}: stesso peso, +1 rep`);
    if (below.length) parts.push(`serie ${setList(below)}: stesso peso, completa il range`);
    if (down.length) parts.push(`serie ${setList(down)}: 2 volte sotto range → −10%`);
    hint = parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
  }
  const type: SuggestionType = prog.length ? 'progress' : down.length === shown.length ? 'exercise-deload' : 'maintain';
  return { weight: plan[0].weight, weights: plan.map((x) => x.weight), reps: plan.map((x) => x.reps), shown: shown.length, hint, type };
}

/** "70×8, 70×8, 70×7 · RIR 2, 1, 1" */
export function describeLog(log: ExerciseLog): string {
  const working = log.sets.filter((s) => s.type !== 'warmup');
  const sets = working.map((s) => `${formatKg(s.weight, 2)}×${s.reps}`).join(', ');
  const rirs = working.map((s) => s.rir);
  const rirText = rirs.some((r) => r != null) ? ` · RIR ${rirs.map((r) => (r == null ? '–' : r)).join(', ')}` : '';
  return sets + rirText;
}

/** Recupero in secondi: "2-3 min" → 150, "90 sec" → 90, "60-90 sec" → 75. */
export function parseRestSeconds(rest: string): number {
  const nums = (rest.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
  if (nums.length === 0) return 90;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const isMin = /min|'/i.test(rest) && !/sec|"/i.test(rest);
  return Math.round(isMin ? avg * 60 : avg);
}

/**
 * Obiettivo di ripetizioni per ogni serie (stile Alpha Progression):
 * - carico aumentato → si riparte dal fondo del range
 * - stesso carico → +1 rep rispetto alla stessa serie dell'ultima volta (max top range)
 */
export function repTargets(exercise: Exercise, lastLog: ExerciseLog | undefined, suggestion: Suggestion, count: number): string[] {
  const range = `${exercise.repMin}-${exercise.repMax}`;
  const last = lastLog ? validSetsOf(lastLog) : [];
  if (suggestion.reps?.length) return Array.from({ length: count }, (_, i) => String(suggestion.reps![Math.min(i, suggestion.reps!.length - 1)]));
  return Array.from({ length: count }, (_, i) => {
    if (suggestion.type === 'progress' || suggestion.type === 'exercise-deload' || suggestion.type === 'deload') {
      return String(exercise.repMin);
    }
    const prev = last[i] ?? last[last.length - 1];
    if (suggestion.type === 'maintain' && prev) return String(Math.min(exercise.repMax, Math.max(exercise.repMin, prev.reps + 1)));
    return range;
  });
}

/** Serie di riscaldamento per un carico di lavoro (arrotondate a 2.5 kg). */
export function warmupSets(workWeight: number): { weight: number; reps: number }[] {
  const r = (x: number) => Math.max(0, Math.round(x / 2.5) * 2.5);
  const scheme: [number, number][] =
    workWeight >= 60 ? [[0.4, 10], [0.6, 5], [0.8, 3]] : workWeight >= 30 ? [[0.5, 8], [0.75, 4]] : [[0.5, 10]];
  const out = scheme.map(([p, reps]) => ({ weight: r(workWeight * p), reps }));
  return out.filter((s, i) => s.weight > 0 && s.weight < workWeight && (i === 0 || s.weight !== out[i - 1].weight));
}

/** Esercizi multiarticolari (per proporre il riscaldamento). */
export const isCompound = (exercise: Pick<Exercise, 'name'>): boolean => !LIGHT_ISO.test(exercise.name);
