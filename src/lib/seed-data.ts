import type { Day, Exercise, Settings } from '@/types';

type Row = [group: string, name: string, sets: number, repMin: number, repMax: number, rir: string, rest: string];

/** Esercizi della scheda di Mirko → esercizio della libreria (demo e istruzioni). */
export const SEED_LIBRARY: Record<string, string> = {
  'lat machine': 'Wide-Grip_Lat_Pulldown',
  pulley: 'Seated_Cable_Rows',
  'lat machine a dischi': 'Close-Grip_Front_Lat_Pulldown',
  pullover: 'Straight-Arm_Pulldown',
  'curl alternato manubri': 'Dumbbell_Alternate_Bicep_Curl',
  'curl martello': 'Hammer_Curls',
  'curl manubri panca scott': 'Two-Arm_Dumbbell_Preacher_Curl',
  'chest press': 'Leverage_Chest_Press',
  'incline chest press': 'Leverage_Incline_Chest_Press',
  'croci ai cavi': 'Cable_Crossover',
  'spinte presa stretta manubri': 'Close-Grip_Dumbbell_Press',
  pushdown: 'Triceps_Pushdown',
  'push overhead': 'Cable_Rope_Overhead_Triceps_Extension',
  'pushdown cavo singolo': 'Triceps_Pushdown',
  'leg press orizzontale': 'Leg_Press',
  'hack squat': 'Hack_Squat',
  'mezzi stacchi': 'Romanian_Deadlift',
  'leg extension': 'Leg_Extensions',
  'leg curl': 'Seated_Leg_Curl',
  'shoulder press': 'Leverage_Shoulder_Press',
  'alzate laterali ai cavi': 'Cable_Seated_Lateral_Raise',
  'reverse fly': 'Cable_Rear_Delt_Fly',
  stacchi: 'Barbell_Deadlift',
  'panca piana': 'Barbell_Bench_Press_-_Medium_Grip',
  't-bar / rematore t-bar': 'T-Bar_Row_with_Handle',
  'croci ai cavi bassi': 'Low_Cable_Crossover',
  'curl ai cavi': 'Standing_Biceps_Cable_Curl',
  'curl concentrato ai cavi': 'Standing_One-Arm_Cable_Curl',
  'pushdown ai cavi': 'Triceps_Pushdown_-_Rope_Attachment',
  'reverse fly ai cavi/macchina': 'Cable_Rear_Delt_Fly',
};

/** Esercizio della libreria collegato (esplicito o dedotto dal nome per le schede create prima della libreria). */
export const libraryIdOf = (e: Pick<Exercise, 'libraryId' | 'name'>): string | undefined =>
  e.libraryId ?? SEED_LIBRARY[e.name.trim().toLowerCase()];

function ex(prefix: string, rows: Row[]): Exercise[] {
  return rows.map(([group, name, sets, repMin, repMax, rirTarget, rest], i) => ({
    libraryId: SEED_LIBRARY[name.toLowerCase()],
    id: `${prefix}e${i + 1}`,
    group,
    name,
    sets,
    repMin,
    repMax,
    rirTarget,
    rest,
  }));
}

/** La scheda di Mirko — usata al primo avvio. */
export const SEED_DAYS: Day[] = [
  {
    id: 'day1',
    order: 1,
    name: 'Day 1',
    subtitle: 'Dorso + Bicipiti',
    exercises: ex('d1', [
      ['Dorso', 'Lat machine', 3, 6, 8, '2/1/1', '2-3 min'],
      ['Dorso', 'Pulley', 3, 8, 10, '2/1/1', '2 min'],
      ['Dorso', 'Lat machine a dischi', 3, 8, 10, '2/1/0-1', '2 min'],
      ['Dorso', 'Pullover', 2, 10, 15, '1/0-1', '90 sec'],
      ['Bicipiti', 'Curl alternato manubri', 3, 8, 10, '1-2', '90 sec'],
      ['Bicipiti', 'Curl martello', 3, 6, 10, '1/0-1', '90 sec'],
      ['Bicipiti', 'Curl manubri panca Scott', 3, 6, 10, '2/1/0-1', '90 sec'],
    ]),
  },
  {
    id: 'day2',
    order: 2,
    name: 'Day 2',
    subtitle: 'Petto + Tricipiti',
    exercises: ex('d2', [
      ['Petto', 'Chest press', 3, 6, 8, '2/1/1', '2-3 min'],
      ['Petto', 'Incline chest press', 3, 8, 10, '2/1/0-1', '2-3 min'],
      ['Petto', 'Croci ai cavi', 3, 10, 15, '1-2/1/0-1', '90 sec'],
      ['Petto', 'Spinte presa stretta manubri', 3, 8, 12, '1-2', '2 min'],
      ['Tricipiti', 'Pushdown', 3, 8, 12, '1-2/1/0-1', '90 sec'],
      ['Tricipiti', 'Push overhead', 3, 10, 15, '1-2/1/0-1', '90 sec'],
      ['Tricipiti', 'Pushdown cavo singolo', 3, 8, 12, '1-2/1/0-1', '90 sec'],
    ]),
  },
  {
    id: 'day3',
    order: 3,
    name: 'Day 3',
    subtitle: 'Gambe + Spalle',
    exercises: ex('d3', [
      ['Gambe', 'Leg press orizzontale', 3, 6, 10, '2/1/1', '2-3 min'],
      ['Gambe', 'Hack squat', 3, 8, 12, '2/1/0-1', '2-3 min'],
      ['Gambe', 'Mezzi stacchi', 3, 6, 10, '2/1/1', '3 min'],
      ['Gambe', 'Leg extension', 3, 8, 12, '1/0-1', '90 sec'],
      ['Gambe', 'Leg curl', 3, 8, 12, '1-2/1/0-1', '90 sec'],
      ['Spalle', 'Shoulder press', 3, 6, 10, '2/1/1', '2-3 min'],
      ['Spalle', 'Alzate laterali ai cavi', 4, 10, 15, '1-2, ult. 0-1', '60-90 sec'],
      ['Spalle', 'Reverse fly', 3, 12, 20, '1-2', '60-90 sec'],
    ]),
  },
  {
    id: 'day4',
    order: 4,
    name: 'Day 4',
    subtitle: 'Forza / Multi-articolari',
    exercises: ex('d4', [
      ['Dorso', 'Stacchi', 3, 5, 6, '2/1/1', '3-4 min'],
      ['Petto', 'Panca piana', 3, 5, 8, '2/1/1', '3 min'],
      ['Dorso', 'T-bar / Rematore T-bar', 3, 8, 12, '1-2', '2 min'],
      ['Petto', 'Croci ai cavi bassi', 3, 10, 15, '1-2', '90 sec'],
    ]),
  },
  {
    id: 'day5',
    order: 5,
    name: 'Day 5',
    subtitle: 'Braccia + Spalle',
    exercises: ex('d5', [
      ['Bicipiti', 'Curl ai cavi', 3, 10, 15, '1-2', '90 sec'],
      ['Bicipiti', 'Curl concentrato ai cavi', 2, 10, 15, '1-0', '90 sec'],
      ['Tricipiti', 'Pushdown ai cavi', 3, 10, 15, '1-2', '90 sec'],
      ['Tricipiti', 'Pushdown cavo singolo', 2, 10, 15, '1-0', '90 sec'],
      ['Spalle', 'Alzate laterali ai cavi', 4, 12, 20, '1-2, ult. 0', '90 sec'],
      ['Spalle', 'Reverse fly ai cavi/macchina', 3, 12, 20, '1-2', '90 sec'],
    ]),
  },
];

export const DEFAULT_SETTINGS: Settings = {
  restTimerEnabled: true,
  restTimerAutoStart: true,
  soundEnabled: true,
  vibrationEnabled: true,
  weightUnit: 'kg',
  theme: 'dark',
  deloadFrequency: 4,
  deloadPercentage: 40,
  autoDeload: true,
  keepScreenOn: true,
  weeklySetsMin: 10,
  weeklySetsMax: 20,
  onboardingCompleted: false,
  startingLoadsPrompted: false,
};

export const MUSCLE_GROUPS = ['Dorso', 'Petto', 'Gambe', 'Spalle', 'Bicipiti', 'Tricipiti', 'Core'] as const;
