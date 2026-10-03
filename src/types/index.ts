/**
 * Modello dati dell'app.
 * Nota: in Firestore i campi data/ora sono salvati come `Timestamp`; il livello
 * `lib/firestore.ts` li converte in millisecondi epoch (`number`) per l'app.
 */

/** Identificativo del giorno (es. 'day1'); le schede possono avere da 1 a 7 giorni. */
export type DayId = string;

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
  /** Esercizio della libreria (demo animata, istruzioni, muscoli). */
  libraryId?: string;
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
  /** Resoconto di fine allenamento inviato al coach */
  recap?: WorkoutRecap;
}

/** Com'è andato l'allenamento (per il resoconto personale del coach). */
export interface WorkoutRecap {
  /** 1 = pessimo … 5 = ottimo */
  rating: number;
  /** 1 = scarico … 5 = carichissimo */
  energy: number;
  /** zone doloranti (vuoto = nessun dolore) */
  pain: string[];
  note?: string;
  at: number;
}

/** Com'è andata la giornata alimentare. */
export interface DayRecap {
  /** quanto hai seguito il piano: 1 = per niente … 5 = alla perfezione */
  adherence: number;
  /** 1 = nessuna fame … 5 = fame costante */
  hunger: number;
  /** sgarro della giornata (vuoto = nessuno) */
  cheat?: string;
  note?: string;
  at: number;
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

import type { UserProfile } from '@/lib/metabolism';
import type { CoachPrefs } from '@/lib/program-generator';
import type { NutritionPrefs } from '@/lib/coach';
import type { Lang } from '@/lib/exercise-i18n';
import type { WeekPlan } from '@/lib/recipes';
import type { Food, Macros } from '@/lib/foods';
import type { CheckIn } from '@/lib/checkin';
import type { GoalPlan } from '@/lib/goal-plan';

export interface Settings {
  /** Lingua dei contenuti (istruzioni degli esercizi). */
  language: Lang;
  /** Questionario iniziale (dati fisici, obiettivo, esperienza) completato. */
  profileCompleted: boolean;
  profile?: UserProfile;
  /** Richieste personali interpretate dal coach AI (priorità, movimenti da evitare, tempo). */
  coachPrefs?: CoachPrefs;
  /** Preferenze alimentari per il piano settimanale. */
  nutritionPrefs?: NutritionPrefs;
  /** Piano alimentare settimanale (ricette variate per 7 giorni). */
  weekPlan?: WeekPlan;
  /** Ricette salvate tra i preferiti. */
  favoriteRecipes?: string[];
  /** Check-in settimanali (il più recente per primo, massimo 12). */
  checkIns?: CheckIn[];
  /** Zone segnate come "passate" dall'utente (zona → data): il coach smette di considerarle attive. */
  painResolved?: Record<string, number>;
  /** Obiettivo a fasi con scadenze (es. massa → cut). */
  goalPlan?: GoalPlan | null;
  /** Sfide settimanali completate ("lunedì:id"). */
  questsDone?: string[];
  /** Ultima analisi completa del coach (tab Analisi). */
  coachAnalysis?: { text: string; at: number; sessions: number };
  /** Correzione calorica giornaliera applicata dal check-in settimanale (kcal). */
  kcalAdjust?: number;
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
  libraryId?: string;
  sets: DraftSet[];
}

export interface ActiveSession {
  id: string;
  dayId: string;
  startedAt: number;
  updatedAt: number;
  deload: boolean;
  /** Check di prontezza pre-allenamento (autoregolazione). */
  readiness?: 'low' | 'normal' | 'high';
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
  foodLogs?: FoodLog[];
  recipes?: UserRecipe[];
  myFoods?: Food[];
}

/* ---------- Alimentazione ---------- */

export type DiaryMeal = 'colazione' | 'pranzo' | 'cena' | 'spuntini';

/** Voce del diario alimentare: alimento (grammi) o ricetta (porzioni). */
export interface DiaryEntry {
  id: string;
  meal: DiaryMeal;
  name: string;
  brand?: string;
  /** 'g' = grammi di un alimento (per = valori per 100 g); 'porzione' = porzioni di ricetta (per = valori a porzione) */
  unit: 'g' | 'porzione';
  qty: number;
  per: Macros;
  foodId?: string;
  recipeId?: string;
  createdAt: number;
}

export interface FoodLog {
  /** YYYY-MM-DD (anche id del documento) */
  date: string;
  entries: DiaryEntry[];
  recap?: DayRecap;
}

export interface RecipeIngredient {
  foodId: string;
  name: string;
  grams: number;
  per100: Macros;
}

/** Ricetta creata dall'utente: i macro si calcolano dagli ingredienti. */
export interface UserRecipe {
  id: string;
  name: string;
  /** colazione / spuntino / principale */
  kind: 'colazione' | 'spuntino' | 'principale';
  servings: number;
  minutes?: number;
  ingredients: RecipeIngredient[];
  steps: string;
  /** foto ridimensionata (data URL JPEG, ~40 KB) */
  photo?: string;
  createdAt: number;
  updatedAt: number;
}

/** Foto settimanale dei progressi (metadati + miniatura). */
export interface ProgressPhoto {
  /** YYYY-MM-DD (anche id del documento) */
  date: string;
  /** miniatura JPEG come data URL (~10 KB) */
  thumb: string;
  weight?: number;
  bodyFat?: number;
  low?: number;
  high?: number;
  /** osservazioni del coach e confronto con la foto precedente */
  comment?: string;
  hasSide?: boolean;
  createdAt: number;
}
/** Immagini complete (caricate solo quando servono). */
export interface PhotoImages {
  front: string;
  side?: string;
}
