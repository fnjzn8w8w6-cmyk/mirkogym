import type { BodyLog, ExerciseLog, FoodLog, Session } from '@/types';
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
  recaps: number;
  legSessions: number;
  groups: number;
  months: number;
  comebacks: number;
  painManaged: number;
  weekendSessions: number;
  quickSessions: number;
  maxSetsSession: number;
  maxPRsSession: number;
  bench: number;
  squat: number;
  deadlift: number;
  benchBW: number;
  bfLogs: number;
  dietDays: number;
  dietTargetDays: number;
  proteinDays: number;
  dayRecaps: number;
  noCheatStreak: number;
  quests: number;
}

/** Dati extra (dieta, sfide) per traguardi e XP. */
export interface StatsExtra {
  foodLogs?: FoodLog[];
  target?: { kcal: number; protein: number } | null;
  quests?: number;
  bodyweight?: number;
  groupOf?: (l: ExerciseLog) => string;
}

const DAY_MS = 86400000;
const kcalOfLog = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.kcal * e.qty) / 100 : e.per.kcal * e.qty), 0);
const protOfLog = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.protein * e.qty) / 100 : e.per.protein * e.qty), 0);

function liftBest(sessions: Session[], nameOf: (l: ExerciseLog) => string, id: string): number {
  const lift = LIFTS.find((l) => l.id === id);
  if (!lift) return 0;
  let best = 0;
  for (const s of sessions)
    for (const l of s.logs) {
      const name = nameOf(l);
      const lib = libraryIdOf({ name, libraryId: undefined });
      if (!(lib && lift.ids.includes(lib)) && !lift.match.test(name)) continue;
      for (const set of workingSets(l.sets)) if (set.reps > 0 && set.reps <= 12) best = Math.max(best, epley1RM(set.weight, set.reps));
    }
  return best;
}

export function computeStats(sessions: Session[], bodyLogs: BodyLog[], nameOf: (l: ExerciseLog) => string, extra: StatsExtra = {}): Stats {
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
  const groupOf = extra.groupOf ?? ((l: ExerciseLog) => l.group ?? '');
  const asc = [...sessions].sort((a, b) => a.date - b.date);
  const groups = new Set<string>();
  let legSessions = 0;
  let comebacks = 0;
  let painManaged = 0;
  let maxPRsSession = 0;
  asc.forEach((s, i) => {
    const gs = new Set(s.logs.filter((l) => workingSets(l.sets).length).map(groupOf));
    gs.forEach((g) => g && groups.add(g));
    if (gs.has('Gambe')) legSessions++;
    if (i > 0 && s.date - asc[i - 1].date >= 14 * DAY_MS) comebacks++;
    // fastidio segnalato e, entro 3 settimane, una sessione senza fastidi
    if (s.recap && !s.recap.pain.length && asc.slice(0, i).some((p) => p.recap?.pain.length && s.date - p.date <= 21 * DAY_MS)) painManaged++;
    maxPRsSession = Math.max(maxPRsSession, s.logs.reduce((a, l) => a + l.sets.filter((x) => x.isPersonalRecord).length, 0));
  });
  const food = (extra.foodLogs ?? []).filter((l) => l.entries.length);
  const t = extra.target;
  const recapsAsc = (extra.foodLogs ?? []).filter((l) => l.recap).sort((a, b) => b.date.localeCompare(a.date));
  let noCheatStreak = 0;
  for (const l of recapsAsc) {
    if (l.recap!.cheat) break;
    noCheatStreak++;
  }
  const bench = liftBest(sessions, nameOf, 'bench');
  const bw = extra.bodyweight ?? bodyLogs.find((b) => b.weight != null)?.weight ?? 0;
  return {
    recaps: sessions.filter((s) => s.recap).length,
    legSessions,
    groups: groups.size,
    months: new Set(sessions.map((s) => new Date(s.date).toISOString().slice(0, 7))).size,
    comebacks,
    painManaged,
    weekendSessions: sessions.filter((s) => [0, 6].includes(new Date(s.date).getDay())).length,
    quickSessions: sessions.filter((s) => (s.duration ?? 0) > 0 && (s.duration ?? 0) <= 40 * 60 && sessionSetCount(s) >= 12).length,
    maxSetsSession: Math.max(0, ...sessions.map(sessionSetCount)),
    maxPRsSession,
    bench,
    squat: liftBest(sessions, nameOf, 'squat'),
    deadlift: liftBest(sessions, nameOf, 'deadlift'),
    benchBW: bw > 0 ? Math.round((bench / bw) * 100) : 0,
    bfLogs: bodyLogs.filter((b) => b.bodyFat != null).length,
    dietDays: food.length,
    dietTargetDays: t ? food.filter((l) => Math.abs(kcalOfLog(l) - t.kcal) <= t.kcal * 0.1).length : 0,
    proteinDays: t ? food.filter((l) => protOfLog(l) >= t.protein * 0.9).length : 0,
    dayRecaps: recapsAsc.length,
    noCheatStreak,
    quests: extra.quests ?? 0,
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
  return st.sessions * 100 + st.sets * 5 + st.prs * 40 + unlocked * 150 + st.recaps * 20 + st.dietDays * 10 + st.dayRecaps * 10 + st.quests * 150;
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
  // Costanza
  { id: 's5', title: 'Ci prendo gusto', description: '5 allenamenti completati', emoji: '✋', tier: 'bronze', progress: count('sessions', 5) },
  { id: 's200', title: 'Bicentenario', description: '200 allenamenti completati', emoji: '🗿', tier: 'legend', progress: count('sessions', 200) },
  { id: 'st2', title: 'Doppietta', description: '2 settimane consecutive di allenamento', emoji: '✌️', tier: 'bronze', progress: count('streak', 2) },
  { id: 'st8', title: 'Due mesi di fila', description: '8 settimane consecutive', emoji: '🔗', tier: 'silver', progress: count('streak', 8) },
  { id: 'st26', title: 'Mezzo anno senza mollare', description: '26 settimane consecutive', emoji: '🛡️', tier: 'legend', progress: count('streak', 26) },
  { id: 'm3', title: 'Stagione intera', description: 'Allenati in 3 mesi diversi', emoji: '🍂', tier: 'silver', progress: count('months', 3) },
  { id: 'm6', title: 'Semestre di ferro', description: 'Allenati in 6 mesi diversi', emoji: '⛓️', tier: 'gold', progress: count('months', 6) },
  { id: 'm12', title: 'Un anno in palestra', description: 'Allenati in 12 mesi diversi', emoji: '🎂', tier: 'legend', progress: count('months', 12) },
  { id: 'comeback', title: 'Il ritorno', description: 'Torna ad allenarti dopo 2 settimane di stop', emoji: '🦅', tier: 'bronze', progress: count('comebacks', 1) },
  // Forza
  { id: 'b60', title: 'Panca 60', description: 'Massimale stimato in panca di 60 kg', emoji: '🪑', tier: 'bronze', progress: count('bench', 60) },
  { id: 'b80', title: 'Panca 80', description: 'Massimale stimato in panca di 80 kg', emoji: '💥', tier: 'silver', progress: count('bench', 80) },
  { id: 'b100', title: 'Club dei 100', description: 'Massimale stimato in panca di 100 kg', emoji: '💯', tier: 'gold', progress: count('bench', 100) },
  { id: 'b140', title: 'Panca da leggenda', description: 'Massimale stimato in panca di 140 kg', emoji: '🐉', tier: 'legend', progress: count('bench', 140) },
  { id: 'bbw', title: 'Il tuo peso in panca', description: 'Massimale in panca pari al tuo peso corporeo', emoji: '⚖️', tier: 'gold', progress: count('benchBW', 100) },
  { id: 'q80', title: 'Squat 80', description: 'Massimale stimato nello squat di 80 kg', emoji: '🦵', tier: 'bronze', progress: count('squat', 80) },
  { id: 'q100', title: 'Squat a tre cifre', description: 'Massimale stimato nello squat di 100 kg', emoji: '🏗️', tier: 'silver', progress: count('squat', 100) },
  { id: 'q140', title: 'Gambe d’acciaio', description: 'Massimale stimato nello squat di 140 kg', emoji: '🗼', tier: 'gold', progress: count('squat', 140) },
  { id: 'q180', title: 'Re dello squat', description: 'Massimale stimato nello squat di 180 kg', emoji: '👑', tier: 'legend', progress: count('squat', 180) },
  { id: 'd100', title: 'Stacco 100', description: 'Massimale stimato nello stacco di 100 kg', emoji: '🪝', tier: 'bronze', progress: count('deadlift', 100) },
  { id: 'd140', title: 'Stacco 140', description: 'Massimale stimato nello stacco di 140 kg', emoji: '⛏️', tier: 'silver', progress: count('deadlift', 140) },
  { id: 'd180', title: 'Stacco 180', description: 'Massimale stimato nello stacco di 180 kg', emoji: '🏔️', tier: 'gold', progress: count('deadlift', 180) },
  { id: 'd220', title: 'Gru umana', description: 'Massimale stimato nello stacco di 220 kg', emoji: '🏗️', tier: 'legend', progress: count('deadlift', 220) },
  // Record e volume
  { id: 'pr3', title: 'Tripletta', description: '3 record personali', emoji: '🥉', tier: 'bronze', progress: count('prs', 3) },
  { id: 'pr25', title: 'Cacciatore di record', description: '25 record personali', emoji: '🎯', tier: 'silver', progress: count('prs', 25) },
  { id: 'pr100', title: 'Leggenda dei record', description: '100 record personali', emoji: '🌟', tier: 'legend', progress: count('prs', 100) },
  { id: 'prday', title: 'Giornata da record', description: '3 record in una sola sessione', emoji: '🎆', tier: 'silver', progress: count('maxPRsSession', 3) },
  { id: 'v250', title: '250 tonnellate', description: '250.000 kg sollevati in totale', emoji: '🚂', tier: 'gold', progress: count('volume', 250000) },
  { id: 'v500', title: '500 tonnellate', description: '500.000 kg sollevati in totale', emoji: '🚢', tier: 'gold', progress: count('volume', 500000) },
  { id: 'big5', title: 'Seduta tosta', description: 'Oltre 5.000 kg in una sola sessione', emoji: '🐂', tier: 'bronze', progress: count('maxSessionVolume', 5000) },
  { id: 'big15', title: 'Seduta titanica', description: 'Oltre 15.000 kg in una sola sessione', emoji: '🦖', tier: 'gold', progress: count('maxSessionVolume', 15000) },
  { id: 'set100', title: '100 serie', description: '100 serie allenanti completate', emoji: '🧱', tier: 'bronze', progress: count('sets', 100) },
  { id: 'set1000', title: '1.000 serie', description: '1.000 serie allenanti completate', emoji: '🏰', tier: 'silver', progress: count('sets', 1000) },
  { id: 'set5000', title: '5.000 serie', description: '5.000 serie allenanti completate', emoji: '🌆', tier: 'gold', progress: count('sets', 5000) },
  { id: 'set25', title: 'Sessione infinita', description: '25 serie in una sola sessione', emoji: '♾️', tier: 'silver', progress: count('maxSetsSession', 25) },
  // Varietà
  { id: 'ex10', title: 'Curioso', description: '10 esercizi diversi allenati', emoji: '🔎', tier: 'bronze', progress: count('distinctExercises', 10) },
  { id: 'ex40', title: 'Enciclopedia', description: '40 esercizi diversi allenati', emoji: '📚', tier: 'gold', progress: count('distinctExercises', 40) },
  { id: 'groups', title: 'Corpo completo', description: 'Allena almeno 6 gruppi muscolari diversi', emoji: '🧩', tier: 'silver', progress: count('groups', 6) },
  { id: 'legs10', title: 'Mai saltare le gambe', description: '10 sessioni con le gambe', emoji: '🍗', tier: 'silver', progress: count('legSessions', 10) },
  { id: 'legs30', title: 'Leg day lover', description: '30 sessioni con le gambe', emoji: '🦿', tier: 'gold', progress: count('legSessions', 30) },
  // Coach e recupero
  { id: 'rc1', title: 'Parla col coach', description: 'Invia il primo resoconto dopo un allenamento', emoji: '🗣️', tier: 'bronze', progress: count('recaps', 1) },
  { id: 'rc10', title: 'Diario di bordo', description: '10 resoconti inviati al coach', emoji: '📓', tier: 'silver', progress: count('recaps', 10) },
  { id: 'rc50', title: 'Atleta consapevole', description: '50 resoconti inviati al coach', emoji: '🧠', tier: 'gold', progress: count('recaps', 50) },
  { id: 'pain', title: 'Recupero intelligente', description: 'Dopo un fastidio, torna ad allenarti senza dolore', emoji: '🩹', tier: 'silver', progress: count('painManaged', 1) },
  { id: 'quick', title: 'Rapido ed efficace', description: 'Almeno 12 serie in meno di 40 minuti', emoji: '⏱️', tier: 'bronze', progress: count('quickSessions', 1) },
  { id: 'long', title: 'Maratoneta', description: 'Una sessione di oltre 90 minuti', emoji: '🏃', tier: 'bronze', progress: count('longestSession', 90 * 60) },
  { id: 'weekend', title: 'Guerriero del weekend', description: '10 allenamenti di sabato o domenica', emoji: '🏖️', tier: 'silver', progress: count('weekendSessions', 10) },
  // Dieta
  { id: 'f1', title: 'A tavola!', description: 'Registra la prima giornata nel diario', emoji: '🍽️', tier: 'bronze', progress: count('dietDays', 1) },
  { id: 'f7', title: 'Una settimana a tavola', description: '7 giornate registrate nel diario', emoji: '🥗', tier: 'bronze', progress: count('dietDays', 7) },
  { id: 'f30', title: 'Contabile delle calorie', description: '30 giornate registrate nel diario', emoji: '🧾', tier: 'silver', progress: count('dietDays', 30) },
  { id: 'f90', title: 'Nutrizionista di te stesso', description: '90 giornate registrate nel diario', emoji: '🥑', tier: 'gold', progress: count('dietDays', 90) },
  { id: 't5', title: 'Centrato!', description: '5 giornate entro il 10% delle calorie obiettivo', emoji: '🎯', tier: 'bronze', progress: count('dietTargetDays', 5) },
  { id: 't20', title: 'Cecchino', description: '20 giornate in target calorico', emoji: '🏹', tier: 'silver', progress: count('dietTargetDays', 20) },
  { id: 't60', title: 'Precisione chirurgica', description: '60 giornate in target calorico', emoji: '🔬', tier: 'gold', progress: count('dietTargetDays', 60) },
  { id: 'p10', title: 'Proteine al top', description: '10 giornate con le proteine in obiettivo', emoji: '🥩', tier: 'silver', progress: count('proteinDays', 10) },
  { id: 'dr7', title: 'Com’è andata?', description: '7 resoconti della giornata alimentare', emoji: '📝', tier: 'bronze', progress: count('dayRecaps', 7) },
  { id: 'nc7', title: 'Settimana pulita', description: '7 giornate di fila senza sgarri', emoji: '😇', tier: 'silver', progress: count('noCheatStreak', 7) },
  { id: 'nc21', title: 'Disciplina di ferro', description: '21 giornate di fila senza sgarri', emoji: '🧘', tier: 'gold', progress: count('noCheatStreak', 21) },
  // Corpo e sfide
  { id: 'body20', title: 'Monitoraggio costante', description: '20 misurazioni corporee registrate', emoji: '📏', tier: 'silver', progress: count('bodyLogs', 20) },
  { id: 'bf3', title: 'Occhio alla massa grassa', description: '3 misurazioni della massa grassa', emoji: '📐', tier: 'bronze', progress: count('bfLogs', 3) },
  { id: 'qs1', title: 'Prima sfida', description: 'Completa una sfida settimanale', emoji: '🎮', tier: 'bronze', progress: count('quests', 1) },
  { id: 'qs10', title: 'Cacciatore di sfide', description: '10 sfide settimanali completate', emoji: '🕹️', tier: 'silver', progress: count('quests', 10) },
  { id: 'qs30', title: 'Giocatore incallito', description: '30 sfide settimanali completate', emoji: '👾', tier: 'gold', progress: count('quests', 30) },
  { id: 'qs100', title: 'Boss finale', description: '100 sfide settimanali completate', emoji: '🐲', tier: 'legend', progress: count('quests', 100) },
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
  legend: '#3DDC84',
};

/* ---------- Ranghi di forza (stile Liftoff) ---------- */

export const RANKS = [
  { name: 'Ferro', color: '#6E6E73' },
  { name: 'Bronzo', color: '#CD7F32' },
  { name: 'Argento', color: '#C0C7D0' },
  { name: 'Oro', color: '#EAB308' },
  { name: 'Platino', color: '#5EEAD4' },
  { name: 'Diamante', color: '#60A5FA' },
  { name: 'Campione', color: '#3DDC84' },
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

/** Standard per tipo di esercizio (1RM / peso corporeo, uomo adulto) per chi non è un fondamentale. */
interface Standard {
  id: string;
  ratios: number[];
  /** a corpo libero: il carico è peso corporeo × quota + zavorra */
  bodyShare?: number;
  match: RegExp;
  groups?: string[];
}
const STANDARDS: Standard[] = [
  { id: 'pullup', ratios: [1, 1.15, 1.3, 1.45, 1.65, 1.9], bodyShare: 1, match: /trazion|pull-?up|chin-?up/i },
  { id: 'dip', ratios: [1, 1.2, 1.4, 1.6, 1.85, 2.1], bodyShare: 1, match: /\bdip|parallele/i },
  { id: 'pushup', ratios: [0.7, 0.8, 0.9, 1, 1.15, 1.3], bodyShare: 0.64, match: /flession|piegament|push-?up/i },
  { id: 'legpress', ratios: [1.25, 1.75, 2.5, 3.25, 4, 4.75], match: /pressa|leg press/i },
  { id: 'hipthrust', ratios: [0.75, 1, 1.5, 2, 2.5, 3], match: /hip thrust|ponte glutei|glute bridge/i },
  { id: 'calf', ratios: [0.5, 0.75, 1, 1.4, 1.8, 2.2], match: /calf|polpacc/i },
  { id: 'legiso', ratios: [0.3, 0.45, 0.6, 0.8, 1, 1.2], match: /leg extension|leg curl|estension|adduttor|abduttor/i },
  { id: 'lateral', ratios: [0.07, 0.11, 0.16, 0.22, 0.3, 0.4], match: /alzat|lateral raise|front raise|reverse fly|aperture posteriori|face pull/i },
  { id: 'fly', ratios: [0.15, 0.25, 0.35, 0.5, 0.65, 0.8], match: /croci|fly|pectoral|peck deck|butterfly|cavi incrociati/i },
  { id: 'curl', ratios: [0.2, 0.35, 0.5, 0.65, 0.8, 1], match: /curl/i },
  { id: 'triceps', ratios: [0.2, 0.35, 0.5, 0.65, 0.8, 1], match: /push-?down|french|tricip|estensioni|kickback|skull/i },
  { id: 'machinepress', ratios: [0.5, 0.75, 1, 1.3, 1.6, 1.9], match: /chest press|pectoral machine|panca alla macchina|shoulder press machine/i },
  { id: 'legs', ratios: [0.5, 0.75, 1, 1.25, 1.5, 1.8], match: /squat|affond|lunge|bulgar|hack|step|good morning|stacco/i },
  // per gruppo, quando il nome non dice nulla
  { id: 'chest', ratios: [0.4, 0.6, 0.8, 1, 1.2, 1.45], match: /$^/, groups: ['Petto'] },
  { id: 'back', ratios: [0.5, 0.65, 0.8, 1, 1.25, 1.5], match: /$^/, groups: ['Dorso'] },
  { id: 'shoulders', ratios: [0.35, 0.5, 0.65, 0.8, 1, 1.2], match: /$^/, groups: ['Spalle'] },
  { id: 'arms', ratios: [0.2, 0.35, 0.5, 0.65, 0.8, 1], match: /$^/, groups: ['Bicipiti', 'Tricipiti'] },
  { id: 'legs2', ratios: [0.5, 0.75, 1, 1.25, 1.5, 1.8], match: /$^/, groups: ['Gambe', 'Glutei', 'Polpacci'] },
];
const PER_HAND = /manubri|manubrio|dumbbell|kettlebell/i;
const UPPER = new Set(['Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti']);

export interface LiftRank {
  lift: { id: string; name: string };
  best1RM: number;
  ratio: number;
  rank: number; // indice in RANKS
  /** cosa serve per il prossimo rango, es. "Oro a 103 kg" o "Oro con 12 ripetizioni" */
  nextLabel: string | null;
  progress: number; // 0..1 verso il prossimo rango
  /** sedute a settimana con questo esercizio (ultime 8 settimane) */
  perWeek: number;
  /** standard stimato per tipo di esercizio (non un fondamentale con tabelle note) */
  estimated: boolean;
  perHand: boolean;
  bodyweightBased: boolean;
}

/** Obiettivo per il prossimo rango: a corpo libero in ripetizioni (o zavorra se servono più di 20), altrimenti in kg di 1RM. */
function nextLabel(rank: string, target1RM: number, body: number, perHand: boolean): string {
  if (body > 0) {
    const reps = Math.ceil(30 * (target1RM / body - 1));
    if (reps <= 20) return `${rank} con ${Math.max(1, reps)} ripetizioni`;
    return `${rank} con ${Math.ceil(target1RM / (1 + 10 / 30) - body)} kg di zavorra × 10`;
  }
  return `${rank} a ${Math.ceil(target1RM)} kg${perHand ? ' per manubrio' : ''}`;
}

const norm = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/** Rapporti 1RM/peso corporeo per un esercizio, adattati a manubri e sesso. null = nessuno standard sensato (es. addome). */
export function standardFor(name: string, group: string, sex: 'm' | 'f' = 'm') {
  const lib = libraryIdOf({ name, libraryId: undefined });
  const known = LIFTS.find((l) => (lib && l.ids.includes(lib)) || l.match.test(name));
  const std = known ? null : STANDARDS.find((x) => x.match.test(name)) ?? STANDARDS.find((x) => x.groups?.includes(group));
  if (!known && !std) return null;
  const bodyShare = std?.bodyShare;
  const perHand = !bodyShare && PER_HAND.test(name) && std?.id !== 'lateral';
  let ratios = (known ?? std)!.ratios;
  if (perHand) ratios = ratios.map((r) => r * 0.42);
  if (sex === 'f') ratios = ratios.map((r) => r * (bodyShare ? 0.85 : UPPER.has(group) ? 0.65 : 0.75));
  return { id: known?.id ?? std!.id, ratios, estimated: !known, perHand, bodyShare };
}

/**
 * Ranghi di forza sugli esercizi che fai davvero: i più frequenti delle ultime 8 settimane
 * (almeno 2 sedute), con il miglior 1RM stimato degli ultimi 6 mesi rispetto al peso corporeo.
 */
export function liftRanks(
  sessions: Session[],
  bodyweight: number,
  nameOf: (l: ExerciseLog) => string,
  groupOf: (l: ExerciseLog) => string,
  sex: 'm' | 'f' = 'm',
  now = Date.now(),
  max = 6,
): LiftRank[] {
  const since8w = now - 56 * 86400000;
  const since6m = now - 183 * 86400000;
  const seen = new Map<string, { name: string; group: string; count: number; logs: ExerciseLog[] }>();
  for (const s of sessions) {
    if (s.date < since6m) continue;
    for (const l of s.logs) {
      if (!workingSets(l.sets).length) continue;
      const name = nameOf(l);
      const key = norm(name);
      const e = seen.get(key) ?? { name, group: groupOf(l), count: 0, logs: [] };
      if (s.date >= since8w) e.count += 1;
      e.logs.push(l);
      seen.set(key, e);
    }
  }
  const out: LiftRank[] = [];
  for (const e of [...seen.values()].filter((x) => x.count >= 2).sort((a, b) => b.count - a.count)) {
    if (out.length >= max) break;
    const std = standardFor(e.name, e.group, sex);
    if (!std) continue;
    const share = std.bodyShare ?? 0;
    let best = 0;
    for (const l of e.logs)
      for (const set of workingSets(l.sets)) {
        if (set.reps <= 0 || set.reps > (share ? 30 : 12)) continue;
        // a corpo libero il carico è il corpo (o una sua quota) più l'eventuale zavorra
        const load = share ? bodyweight * share + Math.max(0, set.weight) : set.weight;
        if (load > 0) best = Math.max(best, epley1RM(load, set.reps));
      }
    if (!best) continue;
    const ratio = bodyweight > 0 ? best / bodyweight : 0;
    let rank = 0;
    std.ratios.forEach((r, i) => {
      if (ratio >= r) rank = i + 1;
    });
    const nextRatio = std.ratios[rank] ?? null;
    const prevRatio = rank > 0 ? std.ratios[rank - 1] : 0;
    out.push({
      lift: { id: norm(e.name), name: e.name },
      best1RM: Math.round(best),
      ratio,
      rank,
      nextLabel: nextRatio != null && bodyweight > 0 ? nextLabel(RANKS[rank + 1].name, nextRatio * bodyweight, bodyweight * share, std.perHand) : null,
      progress: nextRatio != null ? Math.min(1, Math.max(0, (ratio - prevRatio) / (nextRatio - prevRatio))) : 1,
      perWeek: Math.round((e.count / 8) * 10) / 10,
      estimated: std.estimated,
      perHand: std.perHand,
      bodyweightBased: Boolean(share),
    });
  }
  return out;
}
