import type { Day, Exercise } from '@/types';
import type { Equipment, Experience, Goal, Sex, UserProfile } from './metabolism';
import { NAME_IT } from './exercise-library';

/**
 * Generatore di schede in base a obiettivo, esperienza, giorni e attrezzatura.
 * Riferimenti: 10–20 serie settimanali per muscolo (meno per i neofiti), 1–3 RIR,
 * forza 3–6 rep con recuperi lunghi, ipertrofia 6–12 (multiarticolari) e 10–15 (isolamento).
 */

type SlotId =
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
  core: { group: 'Core', compound: false, gym: ['Cable_Crunch', 'Plank'], dumbbells: 'Plank', bodyweight: 'Plank' },
};

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

export function generateProgram(p: UserProfile): Day[] {
  const days = DAY_PLANS[Math.min(6, Math.max(2, p.daysPerWeek))];
  return days.map((plan, di) => {
    const used = new Set<string>();
    const exercises: Exercise[] = [];
    plan.slots.forEach((slotId, si) => {
      const slot = SLOTS[slotId];
      const lib = pickVariant(slot, p.equipment, p.experience);
      if (!lib || used.has(lib)) return;
      used.add(lib);
      const rx = prescribe(p.goal, p.experience, slot.compound, si === 0);
      exercises.push({
        id: `g${di + 1}e${exercises.length + 1}`,
        libraryId: lib,
        name: NAME_IT[lib] ?? lib.replace(/_/g, ' '),
        group: slot.group,
        sets: rx.sets,
        repMin: rx.repMin,
        repMax: rx.repMax,
        rirTarget: rx.rir,
        rest: rx.rest,
        startWeight: startWeight(slot, lib, p, rx.repMax),
      });
    });
    return { id: `day${di + 1}`, order: di + 1, name: `Day ${di + 1}`, subtitle: plan.name, exercises };
  });
}

/** Fascia di serie settimanali per muscolo consigliata per livello. */
export const weeklySetsFor = (exp: Experience): { min: number; max: number } =>
  exp === 'beginner' ? { min: 6, max: 12 } : exp === 'intermediate' ? { min: 10, max: 20 } : { min: 12, max: 24 };
