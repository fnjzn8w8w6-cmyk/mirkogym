import type { Day, Exercise } from '@/types';
import { NAME_IT } from './exercise-library';
import { SEED_DAYS } from './seed-data';

type Row = [libraryId: string, group: string, sets: number, repMin: number, repMax: number, rir?: string, rest?: string];

const day = (idx: number, subtitle: string, rows: Row[]): Day => ({
  id: `day${idx}`,
  order: idx,
  name: `Day ${idx}`,
  subtitle,
  exercises: rows.map(([libraryId, group, sets, repMin, repMax, rir, rest], i): Exercise => ({
    id: `t${idx}e${i + 1}`,
    libraryId,
    name: NAME_IT[libraryId] ?? libraryId.replace(/_/g, ' '),
    group,
    sets,
    repMin,
    repMax,
    rirTarget: rir ?? (repMax <= 8 ? '2/1/1' : '1-2'),
    rest: rest ?? (repMax <= 8 ? '2-3 min' : '90 sec'),
  })),
});

export interface Template {
  id: string;
  name: string;
  description: string;
  level: string;
  days: () => Day[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'mirko',
    name: 'Scheda di Mirko',
    description: '5 giorni · split per gruppi muscolari con giorno di forza',
    level: 'Intermedio / avanzato',
    days: () => structuredClone(SEED_DAYS),
  },
  {
    id: 'fullbody',
    name: 'Full Body',
    description: '3 giorni · tutto il corpo ogni seduta, ideale per iniziare',
    level: 'Principiante',
    days: () => [
      day(1, 'Full Body A', [
        ['Barbell_Full_Squat', 'Gambe', 3, 6, 8],
        ['Barbell_Bench_Press_-_Medium_Grip', 'Petto', 3, 6, 8],
        ['Seated_Cable_Rows', 'Dorso', 3, 8, 12],
        ['Dumbbell_Shoulder_Press', 'Spalle', 3, 8, 12],
        ['Plank', 'Core', 3, 30, 60, '1-2', '60 sec'],
      ]),
      day(2, 'Full Body B', [
        ['Romanian_Deadlift', 'Gambe', 3, 6, 10],
        ['Wide-Grip_Lat_Pulldown', 'Dorso', 3, 8, 12],
        ['Incline_Dumbbell_Press', 'Petto', 3, 8, 12],
        ['Side_Lateral_Raise', 'Spalle', 3, 12, 15],
        ['Dumbbell_Bicep_Curl', 'Bicipiti', 2, 10, 12],
        ['Triceps_Pushdown', 'Tricipiti', 2, 10, 12],
      ]),
      day(3, 'Full Body C', [
        ['Leg_Press', 'Gambe', 3, 8, 12],
        ['Dumbbell_Bench_Press', 'Petto', 3, 8, 12],
        ['One-Arm_Dumbbell_Row', 'Dorso', 3, 8, 12],
        ['Lying_Leg_Curls', 'Gambe', 3, 10, 12],
        ['Cable_Crunch', 'Core', 3, 12, 15, '1-2', '60 sec'],
      ]),
    ],
  },
  {
    id: 'upperlower',
    name: 'Upper / Lower',
    description: '4 giorni · parte alta e bassa alternate, ottimo equilibrio',
    level: 'Intermedio',
    days: () => [
      day(1, 'Upper · forza', [
        ['Barbell_Bench_Press_-_Medium_Grip', 'Petto', 4, 5, 8],
        ['Bent_Over_Barbell_Row', 'Dorso', 4, 6, 8],
        ['Barbell_Shoulder_Press', 'Spalle', 3, 6, 8],
        ['Wide-Grip_Lat_Pulldown', 'Dorso', 3, 8, 10],
        ['Barbell_Curl', 'Bicipiti', 2, 8, 10],
        ['EZ-Bar_Skullcrusher', 'Tricipiti', 2, 8, 10],
      ]),
      day(2, 'Lower · forza', [
        ['Barbell_Full_Squat', 'Gambe', 4, 5, 8],
        ['Romanian_Deadlift', 'Gambe', 3, 6, 8],
        ['Leg_Press', 'Gambe', 3, 8, 12],
        ['Standing_Calf_Raises', 'Gambe', 4, 10, 15],
        ['Hanging_Leg_Raise', 'Core', 3, 10, 15, '1-2', '60 sec'],
      ]),
      day(3, 'Upper · ipertrofia', [
        ['Incline_Dumbbell_Press', 'Petto', 3, 8, 12],
        ['Seated_Cable_Rows', 'Dorso', 3, 10, 12],
        ['Cable_Crossover', 'Petto', 3, 12, 15],
        ['Side_Lateral_Raise', 'Spalle', 4, 12, 20],
        ['Hammer_Curls', 'Bicipiti', 3, 10, 12],
        ['Triceps_Pushdown_-_Rope_Attachment', 'Tricipiti', 3, 10, 12],
      ]),
      day(4, 'Lower · ipertrofia', [
        ['Hack_Squat', 'Gambe', 3, 8, 12],
        ['Barbell_Hip_Thrust', 'Gambe', 3, 8, 12],
        ['Leg_Extensions', 'Gambe', 3, 12, 15],
        ['Seated_Leg_Curl', 'Gambe', 3, 10, 12],
        ['Seated_Calf_Raise', 'Gambe', 4, 12, 15],
      ]),
    ],
  },
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    description: '3 giorni (ripetibili 2 volte a settimana) · spinta, trazione, gambe',
    level: 'Intermedio',
    days: () => [
      day(1, 'Push · Petto, Spalle, Tricipiti', [
        ['Barbell_Bench_Press_-_Medium_Grip', 'Petto', 4, 6, 8],
        ['Incline_Dumbbell_Press', 'Petto', 3, 8, 12],
        ['Dumbbell_Shoulder_Press', 'Spalle', 3, 8, 12],
        ['Side_Lateral_Raise', 'Spalle', 4, 12, 20],
        ['Triceps_Pushdown', 'Tricipiti', 3, 10, 12],
        ['Cable_Rope_Overhead_Triceps_Extension', 'Tricipiti', 3, 10, 15],
      ]),
      day(2, 'Pull · Dorso, Bicipiti', [
        ['Pullups', 'Dorso', 3, 6, 10],
        ['Bent_Over_Barbell_Row', 'Dorso', 3, 6, 10],
        ['Seated_Cable_Rows', 'Dorso', 3, 10, 12],
        ['Face_Pull', 'Spalle', 3, 12, 15],
        ['Barbell_Curl', 'Bicipiti', 3, 8, 12],
        ['Hammer_Curls', 'Bicipiti', 3, 10, 12],
      ]),
      day(3, 'Legs · Gambe, Core', [
        ['Barbell_Full_Squat', 'Gambe', 4, 6, 8],
        ['Romanian_Deadlift', 'Gambe', 3, 8, 10],
        ['Leg_Press', 'Gambe', 3, 10, 12],
        ['Lying_Leg_Curls', 'Gambe', 3, 10, 12],
        ['Standing_Calf_Raises', 'Gambe', 4, 10, 15],
        ['Cable_Crunch', 'Core', 3, 12, 15, '1-2', '60 sec'],
      ]),
    ],
  },
  {
    id: 'empty',
    name: 'Crea la tua',
    description: 'Parti da zero e scegli tu gli esercizi dalla libreria',
    level: 'Tutti',
    days: () => [{ id: 'day1', order: 1, name: 'Day 1', subtitle: 'Il mio allenamento', exercises: [] }],
  },
];
