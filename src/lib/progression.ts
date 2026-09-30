import type { Exercise, ExerciseLog, Session, SetLog, Suggestion } from '@/types';
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

/**
 * Algoritmo di progressione (double progression + RIR).
 * I log di deload vengono ignorati come riferimento per la progressione.
 */
export function calculateSuggestion(
  exercise: Exercise,
  previousLogs: PreviousLog[],
  isDeloadWeek: boolean,
  deloadPercentage: number,
): Suggestion {
  const training = previousLogs.filter((l) => !l.deload && validSetsOf(l).length > 0);

  if (isDeloadWeek) {
    const ref = training.length ? validSetsOf(training[training.length - 1])[0]?.weight : exercise.startWeight;
    if (ref) {
      const deloaded = round025(ref * (1 - deloadPercentage / 100));
      return { weight: deloaded, hint: `Deload week — ${deloadPercentage}% di riduzione`, type: 'deload' };
    }
  }

  if (training.length === 0) {
    if (exercise.startWeight) {
      return { weight: exercise.startWeight, hint: 'Carico di partenza — trova il tuo range', type: 'start' };
    }
    return { weight: null, hint: 'Prima sessione — inserisci peso di partenza', type: 'first' };
  }

  const lastLog = training[training.length - 1];
  const validSets = validSetsOf(lastLog);
  const lastWeight = validSets[0].weight;
  const allAtTopRange = validSets.every((s) => s.reps >= exercise.repMax);
  const allInRange = validSets.every((s) => s.reps >= exercise.repMin);

  const rirNums = parseRirNumbers(exercise.rirTarget);
  const minTargetRir = rirNums.length ? Math.min(...rirNums) : 0;
  const allRirOk = validSets.every((s) => s.rir == null || s.rir >= minTargetRir);

  const step = progressionStep(exercise);

  // Doppio fallimento → deload del singolo esercizio
  const prevPrevLog = training[training.length - 2];
  const failedNow = !allInRange;
  const failedPrev = prevPrevLog ? !validSetsOf(prevPrevLog).every((s) => s.reps >= exercise.repMin) : false;

  if (failedNow && failedPrev) {
    const deloaded = round025(lastWeight * 0.9);
    return {
      weight: deloaded,
      hint: `2 sessioni sotto range → deload -10% (${formatKg(lastWeight)}kg → ${formatKg(deloaded)}kg)`,
      type: 'exercise-deload',
    };
  }

  if (allAtTopRange && allRirOk) {
    return {
      weight: lastWeight + step,
      hint: `Top range con RIR ok → +${formatKg(step, 2)}kg`,
      type: 'progress',
    };
  }

  if (allInRange) return { weight: lastWeight, hint: 'Stesso peso — punta ad aumentare le reps', type: 'maintain' };
  return { weight: lastWeight, hint: 'Stesso peso — completa il range', type: 'maintain' };
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
