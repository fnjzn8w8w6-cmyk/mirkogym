import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Mesocycle, Session } from '@/types';
import { newMesocycle, saveMesocycle } from '@/lib/firestore';
import { daysBetween, fromISODate } from '@/lib/date-utils';
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

/** Settimana del calendario del mesociclo (dalla data di inizio): solo per i mesocicli senza allenamenti. */
export function rawWeekOf(meso: Pick<Mesocycle, 'startDate'>, date: Date | number = new Date()): number {
  return Math.floor(daysBetween(date, fromISODate(meso.startDate)) / 7) + 1;
}

const WEEK_MS = 7 * 86400000;

/**
 * Settimane del mesociclo contate sugli allenamenti, non sul calendario: una settimana è un giro completo della scheda
 * (es. 5 giorni = 5 sessioni). Così una settimana iniziata a metà, un giorno saltato o una settimana di pausa non fanno
 * partire il deload in anticipo: il deload arriva dopo aver completato i giri previsti.
 */
export function mesoProgress(
  active: Pick<Mesocycle, 'startDate' | 'weeks' | 'deloadForced'> & { createdAt?: number },
  sessions: Pick<Session, 'date' | 'deload'>[],
  perWeek: number,
  autoDeload: boolean,
) {
  const n = Math.max(1, perWeek);
  const from = fromISODate(active.startDate).getTime();
  const own = sessions.filter((s) => s.date >= from).sort((a, b) => a.date - b.date);
  const training = own.filter((s) => !s.deload);
  // le sessioni di scarico dello stesso giorno ma del mesociclo prima (chiuso stamattina) non contano
  const deloads = own.filter((s) => s.deload && s.date >= (active.createdAt ?? 0));
  const deloadOn = autoDeload || Boolean(active.deloadForced);
  const trainingWeeks = deloadOn ? active.weeks - 1 : active.weeks;
  const doneRotations = Math.floor(training.length / n);
  let current: number;
  let isOver: boolean;
  if (active.deloadForced || (deloadOn && doneRotations >= trainingWeeks)) {
    current = active.weeks;
    isOver = deloads.length >= n;
  } else {
    current = Math.min(doneRotations + 1, active.weeks);
    isOver = !deloadOn && doneRotations >= active.weeks;
  }
  // sessioni di ogni settimana: i giri della scheda in ordine, l'ultima (se c'è il deload) con le sessioni di scarico
  const chunks = Array.from({ length: active.weeks }, (_, i) =>
    deloadOn && i === active.weeks - 1 ? deloads.slice(0, n) : training.slice(i * n, (i + 1) * n),
  );
  return { current, isOver, chunks, deloadOn, perWeek: n };
}

export function useMesocycle() {
  const { mesocycles, sessions, settings, uid, loaded, schedule } = useData();
  const active = useMemo(() => mesocycles.find((m) => m.status === 'active') ?? null, [mesocycles]);
  const perWeek = schedule?.days.length || settings.profile?.daysPerWeek || 3;

  const progress = useMemo(
    () => (active ? mesoProgress(active, sessions, perWeek, settings.autoDeload) : null),
    [active, sessions, perWeek, settings.autoDeload],
  );
  const currentWeek = progress?.current ?? 1;
  const isOver = progress?.isOver ?? false;
  const isDeloadWeek = Boolean(active && progress && !isOver && progress.deloadOn && currentWeek === active.weeks);

  const weeks = useMemo<MesoWeek[]>(() => {
    if (!active || !progress) return [];
    let cursor = fromISODate(active.startDate).getTime();
    return progress.chunks.map((chunk, i) => {
      const index = i + 1;
      // inizio: la prima sessione della settimana (o la fine della precedente); fine: l'inizio della successiva
      const start = chunk[0] ? chunk[0].date : Math.max(cursor, index === currentWeek ? cursor : Date.now());
      const nextFirst = progress.chunks[i + 1]?.[0]?.date;
      const end = nextFirst ?? (chunk.length ? Math.max(chunk[chunk.length - 1].date + 1, index === currentWeek ? Date.now() + WEEK_MS : 0) : start + WEEK_MS);
      cursor = end;
      return {
        index,
        start: new Date(start),
        end: new Date(end),
        isDeload: progress.deloadOn && index === active.weeks,
        isCurrent: index === currentWeek && !isOver,
        isPast: index < currentWeek || isOver,
        sessions: chunk as Session[],
      };
    });
  }, [active, progress, currentWeek, isOver]);

  const persist = useCallback((m: Mesocycle) => (uid ? saveMesocycle(uid, m) : Promise.resolve()), [uid]);

  /** Chiude il mesociclo corrente e ne apre uno nuovo da oggi. */
  const endMesocycle = useCallback(async () => {
    if (!uid) return;
    if (active) await saveMesocycle(uid, { ...active, status: 'completed', currentWeek });
    await saveMesocycle(uid, newMesocycle(uid, settings.deloadFrequency));
  }, [uid, active, currentWeek, settings.deloadFrequency]);

  /** Passa subito alla settimana di deload. */
  const forceDeload = useCallback(async () => {
    if (!active) return;
    await persist({ ...active, currentWeek: active.weeks, deloadForced: true });
  }, [active, persist]);

  return {
    mesocycle: active,
    history: mesocycles.filter((m) => m.status === 'completed'),
    currentWeek,
    totalWeeks: active?.weeks ?? settings.deloadFrequency,
    isDeloadWeek,
    weeks,
    isOver,
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
  const { mesocycle, currentWeek, endMesocycle, isOver, loading } = useMesocycle();
  const { uid, loaded } = useData();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    // si aspetta che sessioni e scheda siano caricate: senza, il conteggio partirebbe da zero
    if (!mesocycle || !uid || loading || !loaded.sessions || !loaded.schedule) return;
    const key = `${mesocycle.id}:${isOver ? 'over' : currentWeek}`;
    if (handled.current === key) return;
    handled.current = key;
    if (isOver) void endMesocycle();
    else if (mesocycle.currentWeek !== currentWeek) void saveMesocycle(uid, { ...mesocycle, currentWeek });
  }, [mesocycle, uid, currentWeek, isOver, loading, loaded.sessions, loaded.schedule, endMesocycle]);
}
