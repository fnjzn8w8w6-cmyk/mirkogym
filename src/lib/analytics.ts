import { subDays } from 'date-fns';
import type { BodyLog, ExerciseLog, PRFlags, Session, SetLog } from '@/types';
import { toISODate, weekStart } from './date-utils';

/** 1RM stimato (Epley). */
export const epley1RM = (weight: number, reps: number): number => Math.round(weight * (1 + reps / 30));

/** Chiave stabile di un esercizio per lo storico (per nome, così Day diversi si sommano). */
export const exerciseKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Serie allenanti (esclude il riscaldamento). */
export const isWorkingSet = (s: { type?: SetLog['type'] }): boolean => s.type !== 'warmup';
export const workingSets = <T extends { type?: SetLog['type'] }>(sets: T[]): T[] => sets.filter(isWorkingSet);

export const setVolume = (s: SetLog): number => (isWorkingSet(s) ? (s.weight || 0) * (s.reps || 0) : 0);
export const logVolume = (l: ExerciseLog): number => l.sets.reduce((a, s) => a + setVolume(s), 0);
export const sessionTonnage = (s: Session): number => s.logs.reduce((a, l) => a + logVolume(l), 0);
export const sessionSetCount = (s: Session): number => s.logs.reduce((a, l) => a + workingSets(l.sets).length, 0);

export function formatKg(n: number, digits = 1): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return v.toLocaleString('it-IT', { maximumFractionDigits: digits });
}

/** "12,4 t" oppure "850 kg" */
export function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${formatKg(kg / 1000, 1)} t`;
  return `${formatKg(kg, 0)} kg`;
}

/** Top set = peso più alto (a parità, più reps). */
export function topSet(sets: SetLog[]): SetLog | null {
  let best: SetLog | null = null;
  for (const s of workingSets(sets)) {
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
  }
  return best;
}

export interface ExerciseHistoryEntry {
  sessionId: string;
  date: number;
  dayId: string;
  sets: SetLog[];
  top: SetLog | null;
  volume: number;
  best1RM: number;
}

/** Tutte le occorrenze (ordine cronologico) di un esercizio, per chiave nome. */
export function exerciseHistory(sessions: Session[], key: string, nameOf: (l: ExerciseLog) => string): ExerciseHistoryEntry[] {
  const out: ExerciseHistoryEntry[] = [];
  for (const s of [...sessions].sort((a, b) => a.date - b.date)) {
    for (const l of s.logs) {
      const ws = workingSets(l.sets);
      if (exerciseKey(nameOf(l)) !== key || ws.length === 0) continue;
      out.push({
        sessionId: s.id,
        date: s.date,
        dayId: s.dayId,
        sets: l.sets,
        top: topSet(l.sets),
        volume: logVolume(l),
        best1RM: Math.max(...ws.map((x) => epley1RM(x.weight, x.reps))),
      });
    }
  }
  return out;
}

export interface ExerciseRecords {
  maxWeight: number;
  best1RM: number;
  /** Per ogni peso, massime reps ottenute. */
  repsAtWeight: Map<number, number>;
}

export function computeRecords(sets: SetLog[]): ExerciseRecords {
  const repsAtWeight = new Map<number, number>();
  let maxWeight = 0;
  let best1RM = 0;
  for (const s of workingSets(sets)) {
    if (!(s.weight > 0) || !(s.reps > 0)) continue;
    maxWeight = Math.max(maxWeight, s.weight);
    best1RM = Math.max(best1RM, epley1RM(s.weight, s.reps));
    repsAtWeight.set(s.weight, Math.max(repsAtWeight.get(s.weight) ?? 0, s.reps));
  }
  return { maxWeight, best1RM, repsAtWeight };
}

/**
 * PR detection: confronta un nuovo set con tutti i set precedenti dell'esercizio.
 * Senza storico non si considera PR (la prima volta non è un record).
 */
export function detectPR(previous: SetLog[], set: { weight: number; reps: number }): PRFlags {
  const valid = workingSets(previous).filter((s) => s.weight > 0 && s.reps > 0);
  if (valid.length === 0 || !(set.weight > 0) || !(set.reps > 0)) {
    return { weightPR: false, repsPR: false, estimated1RMPR: false };
  }
  const rec = computeRecords(valid);
  const weightPR = set.weight > rec.maxWeight;
  // repsPR: nessun set storico con peso ≥ e reps ≥ (dominanza) — e almeno un set con peso ≥
  const dominated = valid.some((s) => s.weight >= set.weight && s.reps >= set.reps);
  const repsPR = !weightPR && !dominated && valid.some((s) => s.weight === set.weight);
  const estimated1RMPR = epley1RM(set.weight, set.reps) > rec.best1RM;
  return { weightPR, repsPR, estimated1RMPR };
}

export const isAnyPR = (f: PRFlags): boolean => f.weightPR || f.repsPR || f.estimated1RMPR;

/* ---------- Aggregazioni settimanali ---------- */

export interface WeekBucket {
  week: Date;
  label: string;
  [group: string]: number | string | Date;
}

export function weeklyVolumeByGroup(
  sessions: Session[],
  weeks: number,
  groupOf: (l: ExerciseLog) => string,
): { data: WeekBucket[]; groups: string[] } {
  const start = weekStart(subDays(new Date(), (weeks - 1) * 7));
  const buckets = new Map<number, WeekBucket>();
  for (let i = 0; i < weeks; i++) {
    const w = new Date(start);
    w.setDate(w.getDate() + i * 7);
    buckets.set(w.getTime(), { week: w, label: `${w.getDate()}/${w.getMonth() + 1}` });
  }
  const groups = new Set<string>();
  for (const s of sessions) {
    const b = buckets.get(weekStart(s.date).getTime());
    if (!b) continue;
    for (const l of s.logs) {
      const g = groupOf(l);
      groups.add(g);
      b[g] = ((b[g] as number | undefined) ?? 0) + logVolume(l);
    }
  }
  const data = [...buckets.values()];
  for (const b of data) for (const g of groups) b[g] = Math.round((b[g] as number | undefined) ?? 0);
  return { data, groups: [...groups] };
}

export function weeklyTonnage(sessions: Session[], weeks: number): { label: string; tonnage: number; sessions: number }[] {
  const { data } = weeklyVolumeByGroup(sessions, weeks, () => '__all');
  const counts = new Map<number, number>();
  for (const s of sessions) {
    const k = weekStart(s.date).getTime();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return data.map((b) => ({
    label: b.label,
    tonnage: Math.round((b.__all as number | undefined) ?? 0),
    sessions: counts.get((b.week as Date).getTime()) ?? 0,
  }));
}

/** Settimane consecutive (fino alla corrente, o la precedente se questa è ancora vuota) con ≥1 allenamento. */
export function weekStreak(sessions: Session[]): number {
  const weeks = new Set(sessions.map((s) => weekStart(s.date).getTime()));
  let cursor = weekStart(new Date());
  if (!weeks.has(cursor.getTime())) cursor = weekStart(subDays(cursor, 1));
  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor = weekStart(subDays(cursor, 1));
  }
  return streak;
}

/** Conteggio sessioni per giorno (YYYY-MM-DD). */
export function sessionsPerDay(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = toISODate(s.date);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export interface RecentPR {
  sessionId: string;
  date: number;
  name: string;
  set: SetLog;
}

export function recentPRs(sessions: Session[], days: number, nameOf: (l: ExerciseLog) => string): RecentPR[] {
  const since = subDays(new Date(), days).getTime();
  const out: RecentPR[] = [];
  for (const s of sessions) {
    if (s.date < since) continue;
    for (const l of s.logs) {
      for (const set of l.sets) if (set.isPersonalRecord) out.push({ sessionId: s.id, date: s.date, name: nameOf(l), set });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

/* ---------- Corpo ---------- */

/** Media mobile su 7 giorni di calendario (non 7 punti), per stabilizzare il peso. */
export function movingAverage7d(logs: BodyLog[], field: 'weight' | 'bodyFat'): Map<string, number> {
  const sorted = logs.filter((l) => l[field] != null).sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, number>();
  sorted.forEach((l, i) => {
    const end = new Date(l.date).getTime();
    const window = sorted.slice(0, i + 1).filter((x) => end - new Date(x.date).getTime() < 7 * 86400000);
    const avg = window.reduce((a, x) => a + (x[field] ?? 0), 0) / window.length;
    out.set(l.date, Math.round(avg * 10) / 10);
  });
  return out;
}

/** Valore (media 7d) più vicino a `daysAgo` giorni fa, per calcolare i trend. */
export function trendDelta(logs: BodyLog[], field: 'weight' | 'bodyFat' | 'lean', daysAgo: number): { current: number; delta: number | null } | null {
  const value = (l: BodyLog): number | undefined => {
    if (field === 'lean') return l.weight != null && l.bodyFat != null ? l.weight * (1 - l.bodyFat / 100) : undefined;
    return l[field];
  };
  const sorted = logs.filter((l) => value(l) != null).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const current = value(last) as number;
  const target = new Date(last.date).getTime() - daysAgo * 86400000;
  const past = [...sorted].reverse().find((l) => new Date(l.date).getTime() <= target);
  if (!past) {
    const first = sorted[0];
    return { current, delta: first === last ? null : current - (value(first) as number) };
  }
  return { current, delta: current - (value(past) as number) };
}

/* ---------- Colori gruppi muscolari ---------- */

// Un colore ben distinto per gruppo, senza verde (= ok) né rosso (= avviso)
const GROUP_COLORS: Record<string, string> = {
  dorso: '#3B82F6',
  petto: '#D946EF',
  gambe: '#F97316',
  spalle: '#FACC15',
  bicipiti: '#22D3EE',
  tricipiti: '#8B5CF6',
  braccia: '#22D3EE',
  core: '#D6C3A1',
  addome: '#D6C3A1',
};

export const groupColor = (group: string): string => GROUP_COLORS[group.trim().toLowerCase()] ?? '#A8A8AD';

/* ---------- Muscoli: serie settimanali e recupero ---------- */

export interface MuscleStatus {
  group: string;
  /** Serie allenanti nella settimana corrente (lun–dom). */
  weekSets: number;
  lastTrained: number | null;
  /** 0..1 — stima del recupero (1 = pronto). */
  recovery: number;
  hoursSince: number | null;
}

/**
 * Stato per gruppo muscolare. Recupero stimato (stile Fitbod): servono ~48h dopo una seduta
 * normale, fino a ~96h se il volume della seduta è alto.
 */
export function muscleStatus(sessions: Session[], groupOf: (l: ExerciseLog) => string, groups: string[]): MuscleStatus[] {
  const now = Date.now();
  const wStart = weekStart(new Date()).getTime();
  const map = new Map<string, MuscleStatus & { lastSets: number }>();
  for (const g of groups) map.set(g, { group: g, weekSets: 0, lastTrained: null, recovery: 1, hoursSince: null, lastSets: 0 });
  for (const s of [...sessions].sort((a, b) => a.date - b.date)) {
    const perGroup = new Map<string, number>();
    for (const l of s.logs) {
      const g = groupOf(l);
      perGroup.set(g, (perGroup.get(g) ?? 0) + workingSets(l.sets).length);
    }
    for (const [g, n] of perGroup) {
      if (n === 0) continue;
      const m = map.get(g) ?? { group: g, weekSets: 0, lastTrained: null, recovery: 1, hoursSince: null, lastSets: 0 };
      if (s.date >= wStart) m.weekSets += n;
      m.lastTrained = s.date;
      m.lastSets = n;
      map.set(g, m);
    }
  }
  return [...map.values()].map(({ lastSets, ...m }) => {
    if (m.lastTrained == null) return m;
    const hours = (now - m.lastTrained) / 3600000;
    const needed = Math.min(96, 48 + Math.max(0, lastSets - 6) * 6);
    return { ...m, hoursSince: hours, recovery: Math.min(1, Math.max(0, hours / needed)) };
  });
}

/** Riepilogo della settimana corrente vs precedente. */
export function weekSummary(sessions: Session[]) {
  const thisStart = weekStart(new Date()).getTime();
  const prevStart = weekStart(subDays(new Date(thisStart), 1)).getTime();
  const cur = sessions.filter((s) => s.date >= thisStart);
  const prev = sessions.filter((s) => s.date >= prevStart && s.date < thisStart);
  const vol = (list: Session[]) => list.reduce((a, s) => a + sessionTonnage(s), 0);
  const sets = (list: Session[]) => list.reduce((a, s) => a + sessionSetCount(s), 0);
  return {
    sessions: cur.length,
    sets: sets(cur),
    volume: vol(cur),
    prevVolume: vol(prev),
    prevSessions: prev.length,
  };
}

/** Ripetizioni massime stimate a un dato carico (Epley inverso). */
export const repsAtWeight = (oneRM: number, weight: number): number => Math.max(0, Math.floor(30 * (oneRM / weight - 1)));
/** Carico stimato per N ripetizioni massimali (Epley inverso). */
export const weightForReps = (oneRM: number, reps: number): number => (reps <= 1 ? oneRM : oneRM / (1 + reps / 30));
