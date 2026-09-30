/**
 * Modello dati dell'app.
 * Nota: in Firestore i campi data/ora sono salvati come `Timestamp`; il livello
 * `lib/firestore.ts` li converte in millisecondi epoch (`number`) per l'app.
 */

export type DayId = 'day1' | 'day2' | 'day3' | 'day4' | 'day5';

export interface Exercise {
  id: string;
  group: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: string;
  rest: string;
  notes?: string;
  /** Carico di partenza inserito nell'onboarding (usato finché non c'è storico). */
  startWeight?: number;
}

export interface Day {
  id: DayId;
  order: number;
  name: string;
  subtitle: string;
  exercises: Exercise[];
}

export interface Schedule {
  id: 'current';
  updatedAt: number;
  days: Day[];
}

/** Tipo di serie: le serie di riscaldamento non contano per volume, PR e progressione. */
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface SetLog {
  type?: SetType;
  weight: number;
  reps: number;
  rir?: number;
  note?: string;
  isPersonalRecord?: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  /** Snapshot di nome/gruppo al momento della sessione (sopravvive a rinomine ed esercizi extra). */
  name?: string;
  group?: string;
  extra?: boolean;
  sets: SetLog[];
}

export interface Session {
  id: string;
  date: number;
  dayId: string;
  duration?: number;
  logs: ExerciseLog[];
  bodyweightSnapshot?: number;
  notes?: string;
  deload?: boolean;
}

export interface BodyLog {
  id: string;
  date: string;
  weight?: number;
  bodyFat?: number;
  sleepHours?: number;
  energy?: number;
  notes?: string;
  weeklyGoal?: string;
  circumferences?: {
    arm?: number;
    thigh?: number;
    waist?: number;
    chest?: number;
  };
  createdAt: number;
}

export interface Mesocycle {
  id: string;
  startDate: string;
  weeks: number;
  currentWeek: number;
  status: 'active' | 'completed';
  createdAt: number;
  /** Deload forzato manualmente (vale anche con auto-deload disattivato). */
  deloadForced?: boolean;
}

export interface Settings {
  restTimerEnabled: boolean;
  restTimerAutoStart: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  weightUnit: 'kg' | 'lb';
  theme: 'dark';
  deloadFrequency: number;
  deloadPercentage: number;
  autoDeload: boolean;
  /** Mantiene lo schermo acceso durante la sessione (Screen Wake Lock). */
  keepScreenOn: boolean;
  /** Obiettivo di serie settimanali per gruppo muscolare (volume landmarks). */
  weeklySetsMin: number;
  weeklySetsMax: number;
  onboardingCompleted: boolean;
  startingLoadsPrompted: boolean;
}

/* ---------- Sessione in corso (bozza sincronizzata) ---------- */

export interface DraftSet {
  type?: SetType;
  weight: string;
  reps: string;
  rir: string;
  done: boolean;
  isPersonalRecord?: boolean;
}

export interface DraftExercise {
  exerciseId: string;
  name: string;
  group: string;
  extra?: boolean;
  sets: DraftSet[];
}

export interface ActiveSession {
  id: string;
  dayId: string;
  startedAt: number;
  updatedAt: number;
  deload: boolean;
  exercises: DraftExercise[];
  notes?: string;
}

/* ---------- Progressione ---------- */

export type SuggestionType = 'deload' | 'first' | 'exercise-deload' | 'progress' | 'maintain' | 'start';

export interface Suggestion {
  weight: number | null;
  hint: string;
  type: SuggestionType;
}

export interface PRFlags {
  weightPR: boolean;
  repsPR: boolean;
  estimated1RMPR: boolean;
}

/* ---------- Backup ---------- */

export interface BackupFile {
  app: 'mirkogym';
  version: 1;
  exportedAt: string;
  schedule: Schedule | null;
  sessions: Session[];
  bodyLogs: BodyLog[];
  mesocycles: Mesocycle[];
  settings: Settings | null;
}
