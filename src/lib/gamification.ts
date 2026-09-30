import type { BodyLog, ExerciseLog, Session } from '@/types';
import { epley1RM, sessionSetCount, sessionTonnage, weekStreak, workingSets } from './analytics';
import { libraryIdOf } from './seed-data';

/* ---------- Statistiche aggregate ---------- */

export interface Stats {
  sessions: number;
  sets: number;
  volume: number;
  prs: number;
  streak: number;
  maxSessionVolume: number;
  longestSession: number;
  earliestHour: number;
  latestHour: number;
  distinctExercises: number;
  bodyLogs: number;
  deloadSessions: number;
}

export function computeStats(sessions: Session[], bodyLogs: BodyLog[], nameOf: (l: ExerciseLog) => string): Stats {
  const names = new Set<string>();
  let prs = 0;
  let earliest = 24;
  let latest = 0;
  for (const s of sessions) {
    const h = new Date(s.date).getHours() + new Date(s.date).getMinutes() / 60;
    earliest = Math.min(earliest, h);
    latest = Math.max(latest, h);
    for (const l of s.logs) {
      if (workingSets(l.sets).length) names.add(nameOf(l).toLowerCase());
      prs += l.sets.filter((x) => x.isPersonalRecord).length;
    }
  }
  return {
    sessions: sessions.length,
    sets: sessions.reduce((a, s) => a + sessionSetCount(s), 0),
    volume: sessions.reduce((a, s) => a + sessionTonnage(s), 0),
    prs,
    streak: weekStreak(sessions),
    maxSessionVolume: Math.max(0, ...sessions.map(sessionTonnage)),
    longestSession: Math.max(0, ...sessions.map((s) => s.duration ?? 0)),
    earliestHour: earliest,
    latestHour: latest,
    distinctExercises: names.size,
    bodyLogs: bodyLogs.length,
    deloadSessions: sessions.filter((s) => s.deload).length,
  };
}

/* ---------- XP e livelli ---------- */

export function xpOf(st: Stats, unlocked: number): number {
  return st.sessions * 100 + st.sets * 5 + st.prs * 40 + unlocked * 150;
}

/** XP cumulativi necessari per raggiungere il livello L (L1 = 0). */
export const xpForLevel = (level: number): number => 125 * (level - 1) * level;

export function levelOf(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, xp, progress: (xp - from) / (to - from), toNext: to - xp, title: titleFor(level) };
}

const TITLES: [number, string][] = [
  [1, 'Principiante'],
  [3, 'Novizio'],
  [5, 'Atleta'],
  [8, 'Guerriero'],
  [12, 'Veterano'],
  [16, 'Élite'],
  [20, 'Titano'],
  [25, 'Leggenda'],
];
export const titleFor = (level: number): string => [...TITLES].reverse().find(([l]) => level >= l)?.[1] ?? 'Principiante';

/* ---------- Traguardi ---------- */

export type Tier = 'bronze' | 'silver' | 'gold' | 'legend';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  tier: Tier;
  /** Valore attuale e obiettivo per la barra di avanzamento. */
  progress: (s: Stats) => [number, number];
}

const count = (key: keyof Stats, target: number) => (s: Stats): [number, number] => [Math.min(s[key], target), target];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', title: 'Primo passo', description: 'Completa il primo allenamento', emoji: '🚀', tier: 'bronze', progress: count('sessions', 1) },
  { id: 's10', title: 'Abitudine', description: '10 allenamenti completati', emoji: '📅', tier: 'bronze', progress: count('sessions', 10) },
  { id: 's25', title: 'Costanza', description: '25 allenamenti completati', emoji: '💪', tier: 'silver', progress: count('sessions', 25) },
  { id: 's50', title: 'Mezzo centinaio', description: '50 allenamenti completati', emoji: '🔥', tier: 'gold', progress: count('sessions', 50) },
  { id: 's100', title: 'Centurione', description: '100 allenamenti completati', emoji: '🏛️', tier: 'legend', progress: count('sessions', 100) },
  { id: 'pr1', title: 'Record!', description: 'Stabilisci il primo PR', emoji: '🏆', tier: 'bronze', progress: count('prs', 1) },
  { id: 'pr10', title: 'Collezionista di PR', description: '10 record personali', emoji: '🥇', tier: 'silver', progress: count('prs', 10) },
  { id: 'pr50', title: 'Macchina da record', description: '50 record personali', emoji: '👑', tier: 'gold', progress: count('prs', 50) },
  { id: 'st4', title: 'Un mese di fila', description: '4 settimane consecutive di allenamento', emoji: '⚡', tier: 'silver', progress: count('streak', 4) },
  { id: 'st12', title: 'Inarrestabile', description: '12 settimane consecutive', emoji: '🌋', tier: 'gold', progress: count('streak', 12) },
  { id: 'v10', title: '10 tonnellate', description: '10.000 kg sollevati in totale', emoji: '🏋️', tier: 'bronze', progress: count('volume', 10000) },
  { id: 'v100', title: '100 tonnellate', description: '100.000 kg sollevati in totale', emoji: '🚛', tier: 'silver', progress: count('volume', 100000) },
  { id: 'v1000', title: 'Mille tonnellate', description: '1.000.000 kg sollevati in totale', emoji: '🌍', tier: 'legend', progress: count('volume', 1000000) },
  { id: 'big', title: 'Seduta monstre', description: 'Oltre 10.000 kg in una sola sessione', emoji: '🦍', tier: 'silver', progress: count('maxSessionVolume', 10000) },
  { id: 'explorer', title: 'Esploratore', description: '20 esercizi diversi allenati', emoji: '🧭', tier: 'silver', progress: count('distinctExercises', 20) },
  { id: 'body', title: 'Occhio al corpo', description: '5 misurazioni corporee registrate', emoji: '⚖️', tier: 'bronze', progress: count('bodyLogs', 5) },
  {
    id: 'early',
    title: 'Mattiniero',
    description: 'Allenati prima delle 7:30',
    emoji: '🌅',
    tier: 'bronze',
    progress: (s) => [s.sessions && s.earliestHour < 7.5 ? 1 : 0, 1],
  },
  {
    id: 'night',
    title: 'Nottambulo',
    description: 'Allenati dopo le 21:00',
    emoji: '🌙',
    tier: 'bronze',
    progress: (s) => [s.sessions && s.latestHour >= 21 ? 1 : 0, 1],
  },
  { id: 'deload', title: 'Recupero intelligente', description: 'Completa una sessione di deload', emoji: '🧘', tier: 'bronze', progress: count('deloadSessions', 1) },
];

export const isUnlocked = (a: Achievement, s: Stats): boolean => {
  const [v, t] = a.progress(s);
  return v >= t;
};
export const unlockedIds = (s: Stats): Set<string> => new Set(ACHIEVEMENTS.filter((a) => isUnlocked(a, s)).map((a) => a.id));

export const TIER_COLOR: Record<Tier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C7D0',
  gold: '#EAB308',
  legend: '#F97316',
};

/* ---------- Ranghi di forza (stile Liftoff) ---------- */

export const RANKS = [
  { name: 'Ferro', color: '#6E6E73' },
  { name: 'Bronzo', color: '#CD7F32' },
  { name: 'Argento', color: '#C0C7D0' },
  { name: 'Oro', color: '#EAB308' },
  { name: 'Platino', color: '#5EEAD4' },
  { name: 'Diamante', color: '#60A5FA' },
  { name: 'Campione', color: '#F97316' },
];

interface LiftDef {
  id: string;
  name: string;
  /** Soglie 1RM / peso corporeo per Bronzo…Campione (standard indicativi, uomo adulto). */
  ratios: number[];
  ids: string[];
  match: RegExp;
}

export const LIFTS: LiftDef[] = [
  {
    id: 'bench',
    name: 'Panca piana',
    ratios: [0.5, 0.75, 1, 1.25, 1.5, 1.75],
    ids: ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press'],
    match: /panca piana|bench press/i,
  },
  { id: 'squat', name: 'Squat', ratios: [0.75, 1, 1.25, 1.5, 2, 2.5], ids: ['Barbell_Full_Squat', 'Barbell_Squat'], match: /^squat|squat con bilanciere|back squat/i },
  {
    id: 'deadlift',
    name: 'Stacco',
    ratios: [1, 1.25, 1.5, 2, 2.5, 3],
    ids: ['Barbell_Deadlift', 'Sumo_Deadlift'],
    match: /^stacch?[io]\b|stacco da terra|deadlift/i,
  },
  {
    id: 'ohp',
    name: 'Lento / Shoulder press',
    ratios: [0.35, 0.5, 0.65, 0.8, 1, 1.2],
    ids: ['Barbell_Shoulder_Press', 'Dumbbell_Shoulder_Press', 'Leverage_Shoulder_Press'],
    match: /lento|shoulder press|military/i,
  },
  {
    id: 'row',
    name: 'Rematore',
    ratios: [0.5, 0.65, 0.8, 1, 1.25, 1.5],
    ids: ['Bent_Over_Barbell_Row', 'T-Bar_Row_with_Handle', 'One-Arm_Dumbbell_Row'],
    match: /rematore|row/i,
  },
  {
    id: 'pulldown',
    name: 'Lat machine',
    ratios: [0.5, 0.65, 0.8, 1, 1.2, 1.4],
    ids: ['Wide-Grip_Lat_Pulldown', 'Close-Grip_Front_Lat_Pulldown'],
    match: /lat machine|pulldown/i,
  },
];

export interface LiftRank {
  lift: LiftDef;
  best1RM: number;
  ratio: number;
  rank: number; // indice in RANKS
  next: number | null; // kg di 1RM per il prossimo rango
  progress: number; // 0..1 verso il prossimo rango
}

/** Miglior 1RM stimato per ogni fondamentale e rango rispetto al peso corporeo. */
export function liftRanks(sessions: Session[], bodyweight: number, nameOf: (l: ExerciseLog) => string): LiftRank[] {
  return LIFTS.map((lift) => {
    let best = 0;
    for (const s of sessions)
      for (const l of s.logs) {
        const name = nameOf(l);
        const lib = libraryIdOf({ name, libraryId: undefined });
        if (!(lib && lift.ids.includes(lib)) && !lift.match.test(name)) continue;
        for (const set of workingSets(l.sets)) if (set.reps > 0 && set.reps <= 12) best = Math.max(best, epley1RM(set.weight, set.reps));
      }
    const ratio = bodyweight > 0 ? best / bodyweight : 0;
    let rank = 0;
    lift.ratios.forEach((r, i) => {
      if (ratio >= r) rank = i + 1;
    });
    const nextRatio = lift.ratios[rank] ?? null;
    const prevRatio = rank > 0 ? lift.ratios[rank - 1] : 0;
    return {
      lift,
      best1RM: best,
      ratio,
      rank,
      next: nextRatio != null ? Math.ceil(nextRatio * bodyweight) : null,
      progress: nextRatio != null ? Math.min(1, Math.max(0, (ratio - prevRatio) / (nextRatio - prevRatio))) : 1,
    };
  });
}
