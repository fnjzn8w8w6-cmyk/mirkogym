import { useCallback, useMemo } from 'react';
import type { ExerciseLog, Session } from '@/types';
import { deleteSession, newId, saveSession } from '@/lib/firestore';
import { useData } from './data-context';
import { useSchedule } from './use-schedule';

export function useSessions() {
  const { sessions, uid, loaded } = useData();
  const { exerciseIndex } = useSchedule();

  /** Nome/gruppo di un log: snapshot salvato, altrimenti dalla scheda attuale. */
  const nameOf = useCallback(
    (l: ExerciseLog) => l.name ?? exerciseIndex.get(l.exerciseId)?.name ?? 'Esercizio',
    [exerciseIndex],
  );
  const groupOf = useCallback(
    (l: ExerciseLog) => l.group ?? exerciseIndex.get(l.exerciseId)?.group ?? 'Altro',
    [exerciseIndex],
  );

  const remove = useCallback((id: string) => (uid ? deleteSession(uid, id) : Promise.resolve()), [uid]);
  const save = useCallback((s: Session) => (uid ? saveSession(uid, s) : Promise.resolve()), [uid]);
  const duplicate = useCallback(
    (s: Session) => {
      if (!uid) return Promise.resolve();
      const copy: Session = {
        ...s,
        id: newId(uid),
        date: Date.now(),
        logs: s.logs.map((l) => ({ ...l, sets: l.sets.map(({ isPersonalRecord: _pr, ...rest }) => rest) })),
      };
      return saveSession(uid, copy);
    },
    [uid],
  );

  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  return { sessions, byId, nameOf, groupOf, remove, save, duplicate, loading: !loaded.sessions };
}
