import { useCallback, useEffect, useMemo, useRef } from 'react';
import { addDays, subDays } from 'date-fns';
import type { Mesocycle, Session } from '@/types';
import { newMesocycle, saveMesocycle } from '@/lib/firestore';
import { daysBetween, fromISODate, toISODate } from '@/lib/date-utils';
import { useData } from './data-context';

export type WeekDayStatus = 'done' | 'next' | 'pending' | 'missed';

export interface MesoWeek {
  index: number; // 1-based
  start: Date;
  end: Date;
  isDeload: boolean;
  isCurrent: boolean;
  isPast: boolean;
  sessions: Session[];
}

/** Settimana corrente del mesociclo derivata dalla data di inizio (1..weeks, o >weeks se scaduto). */
export function rawWeekOf(meso: Pick<Mesocycle, 'startDate'>, date: Date | number = new Date()): number {
  return Math.floor(daysBetween(date, fromISODate(meso.startDate)) / 7) + 1;
}

export function useMesocycle() {
  const { mesocycles, sessions, settings, uid, loaded } = useData();
  const active = useMemo(() => mesocycles.find((m) => m.status === 'active') ?? null, [mesocycles]);

  const raw = active ? rawWeekOf(active) : 1;
  const currentWeek = active ? Math.min(Math.max(raw, 1), active.weeks) : 1;
  const isOver = active ? raw > active.weeks : false;
  const isDeloadWeek = Boolean(
    active && !isOver && currentWeek === active.weeks && (settings.autoDeload || active.deloadForced),
  );

  const weeks = useMemo<MesoWeek[]>(() => {
    if (!active) return [];
    const start = fromISODate(active.startDate);
    return Array.from({ length: active.weeks }, (_, i) => {
      const wStart = addDays(start, i * 7);
      const wEnd = addDays(wStart, 7);
      const index = i + 1;
      return {
        index,
        start: wStart,
        end: wEnd,
        isDeload: index === active.weeks && (settings.autoDeload || Boolean(active.deloadForced)),
        isCurrent: index === currentWeek && !isOver,
        isPast: index < currentWeek || isOver,
        sessions: sessions.filter((s) => s.date >= wStart.getTime() && s.date < wEnd.getTime()),
      };
    });
  }, [active, sessions, currentWeek, isOver, settings.autoDeload]);

  const persist = useCallback((m: Mesocycle) => (uid ? saveMesocycle(uid, m) : Promise.resolve()), [uid]);

  /** Chiude il mesociclo corrente e ne apre uno nuovo da oggi. */
  const endMesocycle = useCallback(async () => {
    if (!uid) return;
    if (active) await saveMesocycle(uid, { ...active, status: 'completed', currentWeek });
    await saveMesocycle(uid, newMesocycle(uid, settings.deloadFrequency));
  }, [uid, active, currentWeek, settings.deloadFrequency]);

  /** Salta direttamente alla settimana di deload (sposta indietro la data di inizio). */
  const forceDeload = useCallback(async () => {
    if (!active) return;
    const startDate = toISODate(subDays(new Date(), (active.weeks - 1) * 7));
    await persist({ ...active, startDate, currentWeek: active.weeks, deloadForced: true });
  }, [active, persist]);

  return {
    mesocycle: active,
    history: mesocycles.filter((m) => m.status === 'completed'),
    currentWeek,
    totalWeeks: active?.weeks ?? settings.deloadFrequency,
    isDeloadWeek,
    weeks,
    endMesocycle,
    forceDeload,
    loading: !loaded.mesocycles,
  };
}

/**
 * Da montare UNA sola volta (AppShell): mantiene `currentWeek` salvato allineato e,
 * a mesociclo scaduto, lo chiude aprendone automaticamente uno nuovo.
 */
export function useMesocycleSync(): void {
  const { mesocycle, currentWeek, endMesocycle } = useMesocycle();
  const { uid } = useData();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!mesocycle || !uid) return;
    const isOver = rawWeekOf(mesocycle) > mesocycle.weeks;
    const key = `${mesocycle.id}:${isOver ? 'over' : currentWeek}`;
    if (handled.current === key) return;
    handled.current = key;
    if (isOver) void endMesocycle();
    else if (mesocycle.currentWeek !== currentWeek) void saveMesocycle(uid, { ...mesocycle, currentWeek });
  }, [mesocycle, uid, currentWeek, endMesocycle]);
}
