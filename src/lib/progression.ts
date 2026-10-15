import type { Exercise, ExerciseLog, Session, SetLog, Suggestion, SuggestionType } from '@/types';
import { formatKg } from './analytics';


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

const normName = (s: string) => s.trim().toLowerCase();
const nameWords = (s: string) => normName(s).split(/[^a-z0-9àèéìòù]+/).filter((w) => w.length > 2);

/**
 * Stesso esercizio? Le schede vecchie riusano gli stessi id per esercizi diversi (es. "t1e1" = squat in un modello,
 * panca in un altro): con lo stesso id si controlla anche il nome. Un nome ritoccato ("Panca" → "Panca piana") resta lo stesso.
 */
export function sameExerciseName(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y || x === y || x.includes(y) || y.includes(x)) return true;
  const wa = nameWords(a);
  const wb = new Set(nameWords(b));
  const common = wa.filter((w) => wb.has(w)).length;
  return common >= Math.min(2, wa.length, wb.size);
}

/** Log precedenti di un esercizio (per id con lo stesso nome, fallback per nome se l'id non ha storico), in ordine cronologico. */
export function previousLogsFor(exercise: Pick<Exercise, 'id' | 'name'>, sessions: Session[]): PreviousLog[] {
  const sorted = [...sessions].sort((a, b) => a.date - b.date);
  const collect = (match: (l: ExerciseLog) => boolean) =>
    sorted.flatMap((s) =>
      s.logs.filter((l) => match(l) && l.sets.length > 0).map((l) => ({ ...l, date: s.date, deload: s.deload })),
    );
  const byId = collect((l) => l.exerciseId === exercise.id && sameExerciseName(l.name ?? '', exercise.name));
  if (byId.length) return byId;
  const name = exercise.name.trim().toLowerCase();
  return collect((l) => (l.name ?? '').trim().toLowerCase() === name);
}

/** RIR obiettivo della serie i dal programma ("2/1/1-0" → 2, 1, 0,5…). */
export function targetRirFor(rirTarget: string, i: number): number | null {
  const parts = rirTarget.split('/').map((x) => x.trim()).filter(Boolean);
  const part = parts.length ? parts[Math.min(i, parts.length - 1)] : rirTarget;
  const nums = parseRirNumbers(part);
  return nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
}

/** RIR oltre il quale la stima non è affidabile (serie troppo lontana dal cedimento). */
const MAX_RIR_FOR_ESTIMATE = 4;

/**
 * Massimale stimato da una serie: peso × (1 + ripetizioni possibili / 30) (Epley), dove le ripetizioni possibili
 * sono quelle fatte + quelle rimaste (RIR). Senza sforzo segnato si considera la serie a cedimento (stima prudente).
 */
export function setE1RM(set: Pick<SetLog, 'weight' | 'reps' | 'rir'>): number {
  const rir = Math.min(MAX_RIR_FOR_ESTIMATE, Math.max(0, set.rir ?? 0));
  return set.weight * (1 + Math.min(15, set.reps + rir) / 30);
}

/** Massimale stimato di una sessione: la serie più indicativa (la stima più alta). */
function sessionE1RM(log: ExerciseLog): { value: number; set: SetLog } | null {
  let best: { value: number; set: SetLog } | null = null;
  for (const x of validSetsOf(log)) {
    const v = setE1RM(x);
    if (!best || v > best.value) best = { value: v, set: x };
  }
  return best;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Carico di lavoro calcolato dall'app (al posto dei tentativi a piramide):
 * 1. massimale stimato dalle serie dell'ultima sessione (peso, ripetizioni e sforzo); se è peggiore della volta
 *    prima (giornata storta) si fa una media, così il carico non crolla per un giorno no;
 * 2. carico per fare le ripetizioni minime del programma lasciando in canna il RIR della prima serie;
 * 3. serie tutte uguali; se il carico è lo stesso dell'ultima volta si punta a +1 ripetizione.
 * I log di deload vengono ignorati come riferimento.
 * `count` = quante serie preparare.
 */
export function calculateSuggestion(
  exercise: Exercise,
  previousLogs: PreviousLog[],
  isDeloadWeek: boolean,
  deloadPercentage: number,
  count = Math.max(exercise.sets, 10),
): Suggestion {
  const training = previousLogs.filter((l) => !l.deload && validSetsOf(l).length > 0);
  const step = progressionStep(exercise);
  const shown = Math.max(1, exercise.sets);
  const same = (w: number) => Array.from({ length: count }, () => w);

  if (training.length === 0) {
    if (exercise.startWeight) {
      return { weight: exercise.startWeight, hint: 'Carico di partenza — trova il tuo range', type: 'start' };
    }
    return { weight: null, hint: 'Prima sessione — inserisci peso di partenza', type: 'first' };
  }

  const lastLog = training[training.length - 1];
  const last = sessionE1RM(lastLog)!;
  const prev = training.length > 1 ? sessionE1RM(training[training.length - 2]) : null;
  const e1rm = prev && last.value < prev.value ? last.value * 0.6 + prev.value * 0.4 : last.value;

  const rir = targetRirFor(exercise.rirTarget, 0) ?? 2;
  const reps = exercise.repMin;
  let weight = roundTo(e1rm / (1 + Math.min(15, reps + rir) / 30), step);
  // prudenza: mai più del 7,5% sopra la serie più pesante fatta l'ultima volta
  const lastWorking = validSetsOf(lastLog).map((x) => x.weight);
  const heaviest = Math.max(...lastWorking);
  weight = Math.min(weight, roundTo(heaviest * 1.075, step));

  // tutte le serie al massimo del range (anche senza sforzo segnato) → si sale comunque di un gradino
  const lastSets = validSetsOf(lastLog);
  const minRir = parseRirNumbers(exercise.rirTarget).length ? Math.min(...parseRirNumbers(exercise.rirTarget)) : 0;
  if (lastSets.length >= exercise.sets && lastSets.every((x) => x.reps >= exercise.repMax && (x.rir == null || x.rir >= minRir)) && weight <= heaviest)
    weight = roundTo(heaviest + step, step);

  const basis = `${formatKg(last.set.weight, 2)}×${last.set.reps}${last.set.rir != null ? ` a RPE ${formatKg(10 - last.set.rir, 1)}` : ''}`;
  const e1Text = `massimale stimato ≈ ${Math.round(e1rm)} kg (da ${basis})`;

  if (isDeloadWeek) {
    const w = roundTo(weight * (1 - deloadPercentage / 100), step);
    return { weight: w, weights: same(w), reps: same(reps), shown, e1rm, hint: `Deload week — ${deloadPercentage}% di riduzione · ${e1Text}`, type: 'deload' };
  }

  // stesso carico della volta scorsa (serie tipica) → +1 ripetizione, fino al massimo del range
  const typical = [...lastWorking].sort((x, y) => x - y)[Math.floor(lastWorking.length / 2)];
  const lastReps = validSetsOf(lastLog).filter((x) => x.weight === weight).map((x) => x.reps);
  const repTarget = lastReps.length ? Math.min(exercise.repMax, Math.max(reps, Math.max(...lastReps) + 1)) : reps;
  const type: SuggestionType = weight > typical ? 'progress' : 'maintain';
  const rpe = formatKg(10 - rir, 1);
  const hint = `${e1Text} → ${repTarget} ripetizioni lasciandone ${formatKg(rir, 1)} in canna (RPE ${rpe})`;
  return { weight, weights: same(weight), reps: same(repTarget), shown, e1rm, hint, type };
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
