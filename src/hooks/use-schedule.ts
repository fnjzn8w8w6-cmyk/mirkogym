import { useCallback, useMemo } from 'react';
import type { Day, Exercise } from '@/types';
import { saveSchedule } from '@/lib/firestore';
import { useData } from './data-context';

export function useSchedule() {
  const { schedule, uid, loaded } = useData();
  const days = useMemo<Day[]>(() => [...(schedule?.days ?? [])].sort((a, b) => a.order - b.order), [schedule]);
  const exerciseIndex = useMemo(() => {
    const m = new Map<string, Exercise & { dayId: string }>();
    for (const d of days) for (const e of d.exercises) m.set(e.id, { ...e, dayId: d.id });
    return m;
  }, [days]);
  const save = useCallback((next: Day[]) => (uid ? saveSchedule(uid, next) : Promise.resolve()), [uid]);
  const getDay = useCallback((id: string) => days.find((d) => d.id === id), [days]);
  return { schedule, days, exerciseIndex, getDay, save, loading: !loaded.schedule };
}
