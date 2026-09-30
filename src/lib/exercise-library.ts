/**
 * Libreria esercizi: 876 esercizi da free-exercise-db (pubblico dominio, Unlicense),
 * ognuno con 2 foto (posizione iniziale/finale) che alternate simulano il movimento.
 * https://github.com/yuhonas/free-exercise-db
 */

export interface LibraryExercise {
  id: string;
  /** Nome originale (inglese) */
  n: string;
  /** Muscoli primari / secondari */
  p: string[];
  s: string[];
  /** Attrezzo, categoria, livello, meccanica, forza */
  e: string;
  c: string;
  l: string;
  k?: string;
  f?: string;
  /** Istruzioni (inglese) */
  i: string[];
  /** Numero di immagini */
  g: number;
}

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
export const imageUrl = (id: string, frame = 0): string => `${IMG_BASE}/${id}/${frame}.jpg`;

let cache: Promise<LibraryExercise[]> | null = null;
export function loadLibrary(): Promise<LibraryExercise[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}exercises.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Libreria esercizi non disponibile');
      return r.json() as Promise<LibraryExercise[]>;
    })
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

/* ---------- Traduzioni ---------- */

export const MUSCLE_IT: Record<string, string> = {
  abdominals: 'Addominali',
  abductors: 'Abduttori',
  adductors: 'Adduttori',
  biceps: 'Bicipiti',
  calves: 'Polpacci',
  chest: 'Petto',
  forearms: 'Avambracci',
  glutes: 'Glutei',
  hamstrings: 'Femorali',
  lats: 'Dorsali',
  'lower back': 'Lombari',
  'middle back': 'Dorso centrale',
  neck: 'Collo',
  quadriceps: 'Quadricipiti',
  shoulders: 'Spalle',
  traps: 'Trapezi',
  triceps: 'Tricipiti',
};

export const EQUIPMENT_IT: Record<string, string> = {
  barbell: 'Bilanciere',
  dumbbell: 'Manubri',
  cable: 'Cavi',
  machine: 'Macchina',
  'body only': 'Corpo libero',
  kettlebells: 'Kettlebell',
  bands: 'Elastici',
  'medicine ball': 'Palla medica',
  'exercise ball': 'Fitball',
  'foam roll': 'Foam roller',
  'e-z curl bar': 'Bilanciere EZ',
  other: 'Altro',
};

export const CATEGORY_IT: Record<string, string> = {
  strength: 'Forza',
  stretching: 'Stretching',
  plyometrics: 'Pliometria',
  powerlifting: 'Powerlifting',
  'olympic weightlifting': 'Pesistica olimpica',
  strongman: 'Strongman',
  cardio: 'Cardio',
};

export const LEVEL_IT: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Esperto' };

/** Muscolo della libreria → gruppo usato nella scheda e nelle statistiche. */
const MUSCLE_TO_GROUP: Record<string, string> = {
  chest: 'Petto',
  lats: 'Dorso',
  'middle back': 'Dorso',
  'lower back': 'Dorso',
  traps: 'Dorso',
  shoulders: 'Spalle',
  neck: 'Spalle',
  biceps: 'Bicipiti',
  forearms: 'Bicipiti',
  triceps: 'Tricipiti',
  quadriceps: 'Gambe',
  hamstrings: 'Gambe',
  glutes: 'Gambe',
  calves: 'Gambe',
  adductors: 'Gambe',
  abductors: 'Gambe',
  abdominals: 'Core',
};
export const groupForLibrary = (ex: LibraryExercise): string => MUSCLE_TO_GROUP[ex.p[0] ?? ''] ?? 'Core';

/** Nomi italiani degli esercizi più comuni in palestra. */
export const NAME_IT: Record<string, string> = {
  'Barbell_Bench_Press_-_Medium_Grip': 'Panca piana bilanciere',
  'Barbell_Incline_Bench_Press_-_Medium_Grip': 'Panca inclinata bilanciere',
  'Decline_Barbell_Bench_Press': 'Panca declinata bilanciere',
  'Dumbbell_Bench_Press': 'Panca piana manubri',
  'Incline_Dumbbell_Press': 'Panca inclinata manubri',
  'Dumbbell_Flyes': 'Croci con manubri',
  'Incline_Dumbbell_Flyes': 'Croci inclinate manubri',
  'Cable_Crossover': 'Croci ai cavi',
  'Low_Cable_Crossover': 'Croci ai cavi bassi',
  'Butterfly': 'Pectoral machine',
  'Leverage_Chest_Press': 'Chest press',
  'Leverage_Incline_Chest_Press': 'Incline chest press',
  'Close-Grip_Dumbbell_Press': 'Spinte presa stretta manubri',
  'Close-Grip_Barbell_Bench_Press': 'Panca presa stretta',
  'Pushups': 'Piegamenti (push-up)',
  'Dips_-_Chest_Version': 'Dip alle parallele (petto)',
  'Dips_-_Triceps_Version': 'Dip alle parallele (tricipiti)',
  'Wide-Grip_Lat_Pulldown': 'Lat machine presa larga',
  'Close-Grip_Front_Lat_Pulldown': 'Lat machine presa stretta',
  'V-Bar_Pulldown': 'Lat machine triangolo',
  'Underhand_Cable_Pulldowns': 'Lat machine presa supina',
  'Straight-Arm_Pulldown': 'Pullover al cavo',
  'Bent-Arm_Dumbbell_Pullover': 'Pullover con manubrio',
  'Seated_Cable_Rows': 'Pulley basso',
  'Bent_Over_Barbell_Row': 'Rematore con bilanciere',
  'One-Arm_Dumbbell_Row': 'Rematore con manubrio',
  'T-Bar_Row_with_Handle': 'Rematore T-bar',
  'Pullups': 'Trazioni alla sbarra',
  'Chin-Up': 'Trazioni presa supina',
  'Barbell_Deadlift': 'Stacco da terra',
  'Romanian_Deadlift': 'Stacco rumeno',
  'Stiff-Legged_Barbell_Deadlift': 'Stacco a gambe tese',
  'Sumo_Deadlift': 'Stacco sumo',
  'Hyperextensions_Back_Extensions': 'Iperestensioni',
  'Barbell_Shrug': 'Scrollate con bilanciere',
  'Dumbbell_Shrug': 'Scrollate con manubri',
  'Barbell_Shoulder_Press': 'Lento avanti bilanciere',
  'Dumbbell_Shoulder_Press': 'Lento con manubri',
  'Leverage_Shoulder_Press': 'Shoulder press macchina',
  'Arnold_Dumbbell_Press': 'Arnold press',
  'Side_Lateral_Raise': 'Alzate laterali manubri',
  'Cable_Seated_Lateral_Raise': 'Alzate laterali ai cavi',
  'Front_Dumbbell_Raise': 'Alzate frontali manubri',
  'Cable_Rear_Delt_Fly': 'Reverse fly ai cavi',
  'Seated_Bent-Over_Rear_Delt_Raise': 'Alzate posteriori',
  'Face_Pull': 'Face pull',
  'Upright_Barbell_Row': 'Tirate al mento',
  'Barbell_Curl': 'Curl con bilanciere',
  'Dumbbell_Bicep_Curl': 'Curl con manubri',
  'Dumbbell_Alternate_Bicep_Curl': 'Curl alternato manubri',
  'Hammer_Curls': 'Curl a martello',
  'Preacher_Curl': 'Curl alla panca Scott',
  'Two-Arm_Dumbbell_Preacher_Curl': 'Curl manubri panca Scott',
  'Concentration_Curls': 'Curl concentrato',
  'Standing_Biceps_Cable_Curl': 'Curl ai cavi',
  'Incline_Dumbbell_Curl': 'Curl su panca inclinata',
  'EZ-Bar_Curl': 'Curl bilanciere EZ',
  'Triceps_Pushdown': 'Pushdown ai cavi',
  'Triceps_Pushdown_-_Rope_Attachment': 'Pushdown con corda',
  'Cable_Rope_Overhead_Triceps_Extension': 'Push overhead con corda',
  'EZ-Bar_Skullcrusher': 'French press bilanciere EZ',
  'Standing_Dumbbell_Triceps_Extension': 'Estensioni sopra la testa manubrio',
  'Tricep_Dumbbell_Kickback': 'Kickback manubrio',
  'Barbell_Full_Squat': 'Squat con bilanciere',
  'Front_Barbell_Squat': 'Front squat',
  'Hack_Squat': 'Hack squat',
  'Leg_Press': 'Leg press',
  'Leg_Extensions': 'Leg extension',
  'Lying_Leg_Curls': 'Leg curl sdraiato',
  'Seated_Leg_Curl': 'Leg curl seduto',
  'Barbell_Lunge': 'Affondi con bilanciere',
  'Dumbbell_Lunges': 'Affondi con manubri',
  'Split_Squat_with_Dumbbells': 'Split squat bulgaro manubri',
  'Barbell_Hip_Thrust': 'Hip thrust',
  'Goblet_Squat': 'Goblet squat',
  'Standing_Calf_Raises': 'Calf raise in piedi',
  'Seated_Calf_Raise': 'Calf raise seduto',
  'Thigh_Adductor': 'Adductor machine',
  'Thigh_Abductor': 'Abductor machine',
  'Crunches': 'Crunch',
  'Cable_Crunch': 'Crunch ai cavi',
  'Plank': 'Plank',
  'Hanging_Leg_Raise': 'Leg raise alla sbarra',
  'Russian_Twist': 'Russian twist',
  'Ab_Roller': 'Ruota addominale',
};

export const displayName = (ex: LibraryExercise): string => NAME_IT[ex.id] ?? ex.n;

/** Sinonimi italiani → termini inglesi per la ricerca. */
const SYNONYMS: [RegExp, string][] = [
  [/panca/, 'bench'],
  [/stacc/, 'deadlift'],
  [/rematore/, 'row'],
  [/trazion/, 'pull'],
  [/alzat/, 'raise'],
  [/laterali?/, 'lateral'],
  [/croci/, 'fly'],
  [/spint|lento/, 'press'],
  [/affond/, 'lunge'],
  [/polpacc/, 'calf'],
  [/addominal|addome/, 'abdominals'],
  [/pett/, 'chest'],
  [/dors|schiena/, 'lats'],
  [/spall/, 'shoulders'],
  [/bicipit/, 'biceps'],
  [/tricipit/, 'triceps'],
  [/gamb|quadricip/, 'quadriceps'],
  [/femoral/, 'hamstrings'],
  [/glute/, 'glutes'],
  [/manubri/, 'dumbbell'],
  [/bilancier/, 'barbell'],
  [/cav[io]/, 'cable'],
  [/macchin/, 'machine'],
  [/martello/, 'hammer'],
  [/scrollat/, 'shrug'],
  [/piegament/, 'push-up'],
  [/iperestension/, 'hyperextension'],
];

/** Testo su cui cercare, pre-calcolato. */
export function searchText(ex: LibraryExercise): string {
  return [ex.n, NAME_IT[ex.id] ?? '', ...ex.p, ...ex.s, ex.e, ...ex.p.map((m) => MUSCLE_IT[m] ?? '')]
    .join(' ')
    .toLowerCase();
}

/** Ogni parola della query deve comparire (anche tramite sinonimo inglese). */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => {
    if (text.includes(w)) return true;
    return SYNONYMS.some(([re, en]) => re.test(w) && text.includes(en));
  });
}

export const youtubeUrl = (ex: LibraryExercise): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.n} esecuzione corretta`)}`;
