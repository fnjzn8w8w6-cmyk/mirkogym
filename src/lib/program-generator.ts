import type { Day, Exercise } from '@/types';
import type { Equipment, Experience, Goal, Sex, UserProfile } from './metabolism';
import { NAME_IT } from './exercise-library';
import { parseRestSeconds } from './progression';

/**
 * Generatore di schede in base a obiettivo, esperienza, giorni e attrezzatura, più le
 * preferenze del coach (priorità muscolari, movimenti da evitare, tempo massimo).
 * Riferimenti: 10–20 serie settimanali per muscolo (meno per i neofiti), 1–3 RIR,
 * forza 3–6 rep con recuperi lunghi, ipertrofia 6–12 (multiarticolari) e 10–15 (isolamento).
 */

export type SlotId =
  | 'squat'
  | 'hinge'
  | 'hpush'
  | 'ipush'
  | 'vpush'
  | 'hpull'
  | 'vpull'
  | 'lunge'
  | 'kneeExt'
  | 'kneeFlex'
  | 'lateral'
  | 'rearDelt'
  | 'fly'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'glute'
  | 'core';

interface SlotDef {
  group: string;
  compound: boolean;
  /** Varianti per attrezzatura; per 'gym' la prima è per intermedi/avanzati, la seconda (se c'è) per neofiti. */
  gym: string[];
  dumbbells?: string;
  bodyweight?: string;
  /** Rapporto 1RM / peso corporeo (uomo) per neofita, intermedio, avanzato — per il carico di partenza. */
  ratio?: [number, number, number];
  lower?: boolean;
}

const SLOTS: Record<SlotId, SlotDef> = {
  squat: { group: 'Gambe', compound: true, gym: ['Barbell_Full_Squat', 'Leg_Press'], dumbbells: 'Goblet_Squat', bodyweight: 'Bodyweight_Squat', ratio: [0.8, 1.25, 1.7], lower: true },
  hinge: { group: 'Gambe', compound: true, gym: ['Romanian_Deadlift'], dumbbells: 'Stiff-Legged_Dumbbell_Deadlift', bodyweight: 'Single_Leg_Glute_Bridge', ratio: [0.6, 0.95, 1.3], lower: true },
  hpush: { group: 'Petto', compound: true, gym: ['Barbell_Bench_Press_-_Medium_Grip', 'Leverage_Chest_Press'], dumbbells: 'Dumbbell_Bench_Press', bodyweight: 'Pushups', ratio: [0.6, 0.95, 1.3] },
  ipush: { group: 'Petto', compound: true, gym: ['Incline_Dumbbell_Press', 'Leverage_Incline_Chest_Press'], dumbbells: 'Incline_Dumbbell_Press', bodyweight: 'Decline_Push-Up' },
  vpush: { group: 'Spalle', compound: true, gym: ['Barbell_Shoulder_Press', 'Leverage_Shoulder_Press'], dumbbells: 'Dumbbell_Shoulder_Press', bodyweight: 'Handstand_Push-Ups', ratio: [0.4, 0.6, 0.8] },
  hpull: { group: 'Dorso', compound: true, gym: ['Bent_Over_Barbell_Row', 'Seated_Cable_Rows'], dumbbells: 'One-Arm_Dumbbell_Row', bodyweight: 'Inverted_Row', ratio: [0.5, 0.75, 1] },
  vpull: { group: 'Dorso', compound: true, gym: ['Wide-Grip_Lat_Pulldown'], dumbbells: 'Bent-Arm_Dumbbell_Pullover', bodyweight: 'Pullups', ratio: [0.55, 0.8, 1] },
  lunge: { group: 'Gambe', compound: true, gym: ['Split_Squat_with_Dumbbells', 'Dumbbell_Lunges'], dumbbells: 'Dumbbell_Lunges', bodyweight: 'Bodyweight_Walking_Lunge', lower: true },
  kneeExt: { group: 'Gambe', compound: false, gym: ['Leg_Extensions'], dumbbells: 'Dumbbell_Step_Ups', bodyweight: 'Bodyweight_Squat', lower: true },
  kneeFlex: { group: 'Gambe', compound: false, gym: ['Lying_Leg_Curls', 'Seated_Leg_Curl'], lower: true },
  lateral: { group: 'Spalle', compound: false, gym: ['Cable_Seated_Lateral_Raise', 'Side_Lateral_Raise'], dumbbells: 'Side_Lateral_Raise' },
  rearDelt: { group: 'Spalle', compound: false, gym: ['Face_Pull'], dumbbells: 'Seated_Bent-Over_Rear_Delt_Raise', bodyweight: 'Superman' },
  fly: { group: 'Petto', compound: false, gym: ['Cable_Crossover', 'Butterfly'], dumbbells: 'Dumbbell_Flyes' },
  biceps: { group: 'Bicipiti', compound: false, gym: ['Barbell_Curl', 'Standing_Biceps_Cable_Curl'], dumbbells: 'Dumbbell_Alternate_Bicep_Curl', bodyweight: 'Chin-Up' },
  triceps: { group: 'Tricipiti', compound: false, gym: ['Triceps_Pushdown_-_Rope_Attachment'], dumbbells: 'Standing_Dumbbell_Triceps_Extension', bodyweight: 'Bench_Dips' },
  calves: { group: 'Gambe', compound: false, gym: ['Standing_Calf_Raises'], dumbbells: 'Standing_Dumbbell_Calf_Raise', bodyweight: 'Standing_Dumbbell_Calf_Raise', lower: true },
  glute: { group: 'Gambe', compound: true, gym: ['Barbell_Hip_Thrust'], dumbbells: 'Single_Leg_Glute_Bridge', bodyweight: 'Single_Leg_Glute_Bridge', lower: true },
  core: { group: 'Core', compound: false, gym: ['Cable_Crunch', 'Plank'], dumbbells: 'Plank', bodyweight: 'Plank' },
};

/** Descrizione dei movimenti (usata anche dall'AI per capire cosa evitare). */
export const SLOT_LABEL: Record<SlotId, string> = {
  squat: 'squat / accosciata (carico su ginocchia e schiena)',
  hinge: 'stacchi / piegamento delle anche (carico lombare)',
  hpush: 'spinta orizzontale (panca, chest press, piegamenti)',
  ipush: 'spinta inclinata (panca inclinata)',
  vpush: 'spinta sopra la testa (lento, shoulder press)',
  hpull: 'trazione orizzontale (rematori, pulley)',
  vpull: 'trazione verticale (lat machine, trazioni)',
  lunge: 'affondi / split squat (ginocchia, equilibrio)',
  kneeExt: 'estensione del ginocchio (leg extension)',
  kneeFlex: 'flessione del ginocchio (leg curl)',
  lateral: 'alzate laterali',
  rearDelt: 'deltoidi posteriori (face pull, reverse fly)',
  fly: 'croci per il petto',
  biceps: 'curl per bicipiti',
  triceps: 'estensioni per tricipiti',
  calves: 'polpacci',
  glute: 'hip thrust / ponte glutei',
  core: 'addominali',
};
export const SLOT_IDS = Object.keys(SLOT_LABEL) as SlotId[];

/** Sostituti sicuri quando un movimento va evitato (in ordine di preferenza). */
const SUBSTITUTES: Partial<Record<SlotId, string[]>> = {
  squat: ['Leg_Press', 'Hack_Squat', 'Goblet_Squat', 'Barbell_Hip_Thrust', 'Single_Leg_Glute_Bridge'],
  hinge: ['Barbell_Hip_Thrust', 'Lying_Leg_Curls', 'Single_Leg_Glute_Bridge'],
  hpush: ['Dumbbell_Bench_Press', 'Leverage_Chest_Press', 'Pushups'],
  ipush: ['Leverage_Incline_Chest_Press', 'Incline_Dumbbell_Press', 'Decline_Push-Up'],
  vpush: ['Leverage_Shoulder_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise'],
  hpull: ['Seated_Cable_Rows', 'One-Arm_Dumbbell_Row', 'Inverted_Row'],
  vpull: ['Wide-Grip_Lat_Pulldown', 'Close-Grip_Front_Lat_Pulldown', 'Bent-Arm_Dumbbell_Pullover'],
  lunge: ['Leg_Press', 'Barbell_Hip_Thrust', 'Single_Leg_Glute_Bridge'],
  kneeFlex: ['Romanian_Deadlift', 'Single_Leg_Glute_Bridge'],
};

/** L'esercizio è eseguibile con l'attrezzatura dell'utente? */
function availableFor(id: string, equipment: Equipment): boolean {
  if (equipment === 'gym') return true;
  const bw = /Pushups|Push-Up|Plank|Bodyweight|Single_Leg|Superman|Bench_Dips|Crunch|Inverted|Pullups|Chin-Up|Handstand/;
  return equipment === 'bodyweight' ? bw.test(id) : bw.test(id) || /Dumbbell|Goblet|Step_Ups|Lunges|Split_Squat/.test(id);
}

/** Priorità muscolari riconosciute (Glutei è un sottogruppo delle Gambe). */
export const PRIORITY_KEYS = ['Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Glutei', 'Core'] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];
const PRIORITY_SLOT: Record<PriorityKey, SlotId> = {
  Petto: 'fly',
  Dorso: 'hpull',
  Spalle: 'lateral',
  Bicipiti: 'biceps',
  Tricipiti: 'triceps',
  Gambe: 'kneeExt',
  Glutei: 'glute',
  Core: 'core',
};

/** Preferenze del coach (ricavate dall'AI dal testo libero dell'utente). */
export interface CoachPrefs {
  request: string;
  summary: string;
  priorities: PriorityKey[];
  avoidSlots: SlotId[];
  avoidExercises: string[];
  maxMinutes?: number;
  injuries: string[];
}

/** Durata stimata di una seduta in minuti (serie × (recupero + ~45 s) + riscaldamento). */
export function sessionMinutes(day: Day): number {
  const sec = day.exercises.reduce((a, e) => a + e.sets * (parseRestSeconds(e.rest) + 45), 0);
  return Math.round(6 + sec / 60);
}

const DAY_PLANS: Record<number, { name: string; slots: SlotId[] }[]> = {
  2: [
    { name: 'Full Body A', slots: ['squat', 'hpush', 'hpull', 'vpush', 'biceps', 'core'] },
    { name: 'Full Body B', slots: ['hinge', 'vpull', 'ipush', 'lunge', 'lateral', 'triceps'] },
  ],
  3: [
    { name: 'Full Body A', slots: ['squat', 'hpush', 'hpull', 'lateral', 'biceps', 'core'] },
    { name: 'Full Body B', slots: ['hinge', 'vpull', 'ipush', 'kneeFlex', 'triceps', 'calves'] },
    { name: 'Full Body C', slots: ['lunge', 'vpush', 'hpull', 'fly', 'kneeExt', 'core'] },
  ],
  4: [
    { name: 'Upper A', slots: ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps'] },
    { name: 'Lower A', slots: ['squat', 'hinge', 'kneeExt', 'kneeFlex', 'calves', 'core'] },
    { name: 'Upper B', slots: ['ipush', 'vpull', 'hpull', 'lateral', 'fly', 'rearDelt'] },
    { name: 'Lower B', slots: ['hinge', 'lunge', 'squat', 'kneeFlex', 'calves', 'core'] },
  ],
  5: [
    { name: 'Upper', slots: ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps'] },
    { name: 'Lower', slots: ['squat', 'hinge', 'kneeExt', 'kneeFlex', 'calves'] },
    { name: 'Push', slots: ['ipush', 'vpush', 'fly', 'lateral', 'triceps'] },
    { name: 'Pull', slots: ['vpull', 'hpull', 'rearDelt', 'biceps', 'core'] },
    { name: 'Legs', slots: ['lunge', 'hinge', 'kneeExt', 'kneeFlex', 'calves', 'core'] },
  ],
  6: [
    { name: 'Push A', slots: ['hpush', 'vpush', 'fly', 'lateral', 'triceps'] },
    { name: 'Pull A', slots: ['vpull', 'hpull', 'rearDelt', 'biceps', 'core'] },
    { name: 'Legs A', slots: ['squat', 'hinge', 'kneeExt', 'kneeFlex', 'calves'] },
    { name: 'Push B', slots: ['ipush', 'hpush', 'lateral', 'fly', 'triceps'] },
    { name: 'Pull B', slots: ['hpull', 'vpull', 'rearDelt', 'biceps', 'core'] },
    { name: 'Legs B', slots: ['lunge', 'hinge', 'squat', 'kneeFlex', 'calves'] },
  ],
};

interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  rir: string;
  rest: string;
}

/** Serie, ripetizioni, RIR e recupero in base a obiettivo, esperienza e tipo di esercizio. */
export function prescribe(goal: Goal, exp: Experience, compound: boolean, isFirst: boolean): Prescription {
  const setAdj = exp === 'beginner' ? -1 : exp === 'advanced' ? 1 : 0;
  let p: Prescription;
  if (goal === 'strength') {
    p = compound
      ? isFirst
        ? { sets: 4, repMin: 3, repMax: 5, rir: '2-3', rest: '3-4 min' }
        : { sets: 3, repMin: 5, repMax: 8, rir: '2', rest: '2-3 min' }
      : { sets: 3, repMin: 8, repMax: 12, rir: '1-2', rest: '90 sec' };
  } else if (goal === 'bulk') {
    p = compound
      ? { sets: 3, repMin: 6, repMax: 10, rir: '2/1/1', rest: '2-3 min' }
      : { sets: 3, repMin: 10, repMax: 15, rir: '1-2, ult. 0-1', rest: '60-90 sec' };
  } else if (goal === 'cut') {
    // In definizione si mantiene l'intensità (carichi alti) per preservare il muscolo, recuperi più brevi
    p = compound
      ? { sets: 3, repMin: 6, repMax: 10, rir: '2', rest: '2 min' }
      : { sets: 2, repMin: 12, repMax: 15, rir: '1-2', rest: '60 sec' };
  } else {
    p = compound
      ? { sets: 3, repMin: 8, repMax: 12, rir: '2', rest: '2 min' }
      : { sets: 2, repMin: 10, repMax: 15, rir: '2', rest: '90 sec' };
  }
  // Neofiti: più margine dal cedimento per imparare la tecnica
  if (exp === 'beginner') p = { ...p, rir: compound ? '2-3' : '2' };
  return { ...p, sets: Math.max(2, p.sets + (compound || exp !== 'beginner' ? setAdj : 0)) };
}

function pickVariant(slot: SlotDef, equipment: Equipment, exp: Experience): string | null {
  if (equipment === 'gym') return exp === 'beginner' && slot.gym[1] ? slot.gym[1] : slot.gym[0];
  if (equipment === 'dumbbells') return slot.dumbbells ?? slot.bodyweight ?? null;
  return slot.bodyweight ?? null;
}

const round25 = (x: number) => Math.round(x / 2.5) * 2.5;

/** Carico di lavoro indicativo: 1RM stimato da peso corporeo e livello → % per le reps obiettivo. */
function startWeight(slot: SlotDef, libraryId: string, p: UserProfile, reps: number): number | undefined {
  if (!slot.ratio || p.equipment === 'bodyweight') return undefined;
  const lvl = p.experience === 'beginner' ? 0 : p.experience === 'intermediate' ? 1 : 2;
  const sexFactor = (sex: Sex) => (sex === 'm' ? 1 : slot.lower ? 0.75 : 0.6);
  let oneRM = p.weightKg * slot.ratio[lvl] * sexFactor(p.sex);
  if (libraryId === 'Leg_Press') oneRM *= 2;
  const perHand = /Dumbbell/.test(libraryId);
  const work = (oneRM / (1 + reps / 30)) * 0.9 * (perHand ? 0.4 : 1);
  const w = round25(work);
  return w > 0 ? w : undefined;
}

export function generateProgram(p: UserProfile, prefs?: CoachPrefs | null): Day[] {
  const days = DAY_PLANS[Math.min(6, Math.max(2, p.daysPerWeek))];
  const avoidSlots = new Set(prefs?.avoidSlots ?? []);
  const avoidIds = new Set(prefs?.avoidExercises ?? []);
  const priorities = new Set(prefs?.priorities ?? []);

  /** Sceglie l'esercizio per uno slot rispettando attrezzatura ed esclusioni. */
  const choose = (slotId: SlotId, used: Set<string>): string | null => {
    const slot = SLOTS[slotId];
    const primary = pickVariant(slot, p.equipment, p.experience);
    const pool: (string | null | undefined)[] = avoidSlots.has(slotId)
      ? (SUBSTITUTES[slotId] ?? [])
      : [primary, ...slot.gym, ...(SUBSTITUTES[slotId] ?? [])];
    return pool.find((id): id is string => !!id && !avoidIds.has(id) && !used.has(id) && availableFor(id, p.equipment)) ?? null;
  };

  return days.map((plan, di) => {
    const used = new Set<string>();
    const exercises: Exercise[] = [];
    // Slot del giorno + slot extra per i muscoli prioritari già allenati in quel giorno
    const slots: SlotId[] = [...plan.slots];
    const groupsOfDay = plan.slots.map((sl) => SLOTS[sl].group);
    for (const pr of priorities) {
      const extra = PRIORITY_SLOT[pr];
      const trainsIt = pr === 'Glutei' ? groupsOfDay.includes('Gambe') : pr === 'Core' || groupsOfDay.includes(pr);
      if (trainsIt && !slots.includes(extra)) slots.push(extra);
    }
    slots.forEach((slotId, si) => {
      const slot = SLOTS[slotId];
      const lib = choose(slotId, used);
      if (!lib) return;
      used.add(lib);
      const rx = prescribe(p.goal, p.experience, slot.compound, si === 0);
      const priority = priorities.has(slot.group as PriorityKey) || (slotId === 'glute' && priorities.has('Glutei'));
      exercises.push({
        id: `g${di + 1}e${exercises.length + 1}`,
        libraryId: lib,
        name: NAME_IT[lib] ?? lib.replace(/_/g, ' '),
        group: slot.group,
        sets: Math.min(5, rx.sets + (priority ? 1 : 0)),
        repMin: rx.repMin,
        repMax: rx.repMax,
        rirTarget: rx.rir,
        rest: rx.rest,
        startWeight: startWeight(slot, lib, p, rx.repMax),
        notes: avoidSlots.has(slotId) ? 'Scelto dal coach al posto di un movimento da evitare' : undefined,
      });
    });
    const day: Day = { id: `day${di + 1}`, order: di + 1, name: `Day ${di + 1}`, subtitle: plan.name, exercises };
    return prefs?.maxMinutes ? fitToTime(day, prefs.maxMinutes, priorities) : day;
  });
}

/** Riduce la seduta finché rientra nel tempo massimo: prima gli accessori non prioritari, poi le serie. */
function fitToTime(day: Day, maxMinutes: number, priorities: Set<PriorityKey>): Day {
  let ex = [...day.exercises];
  const minutes = () => sessionMinutes({ ...day, exercises: ex });
  for (let guard = 0; guard < 40 && minutes() > maxMinutes; guard++) {
    // 1) togli l'ultimo esercizio non prioritario (mai il primo), tenendone almeno 4
    const idx = [...ex.keys()].reverse().find((i) => i > 0 && !priorities.has(ex[i].group as PriorityKey));
    if (idx != null && ex.length > 4) {
      ex = ex.filter((_, i) => i !== idx);
      continue;
    }
    // 2) togli una serie all'esercizio con più serie (minimo 2)
    const biggest = ex.reduce((a, e) => (e.sets > a.sets ? e : a), ex[0]);
    if (biggest && biggest.sets > 2) {
      ex = ex.map((e) => (e === biggest ? { ...e, sets: e.sets - 1 } : e));
      continue;
    }
    if (ex.length > 3) {
      ex = ex.slice(0, -1);
      continue;
    }
    break;
  }
  return { ...day, exercises: ex };
}

/** Fascia di serie settimanali per muscolo consigliata per livello. */
export const weeklySetsFor = (exp: Experience): { min: number; max: number } =>
  exp === 'beginner' ? { min: 6, max: 12 } : exp === 'intermediate' ? { min: 10, max: 20 } : { min: 12, max: 24 };
