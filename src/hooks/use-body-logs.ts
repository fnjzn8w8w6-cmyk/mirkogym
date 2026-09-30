import { useCallback } from 'react';
import type { BodyLog } from '@/types';
import { deleteBodyLog, newId, saveBodyLog } from '@/lib/firestore';
import { useData } from './data-context';

export function useBodyLogs() {
  const { bodyLogs, uid, loaded } = useData();
  const save = useCallback(
    (log: Omit<BodyLog, 'id' | 'createdAt'> & Partial<Pick<BodyLog, 'id' | 'createdAt'>>) => {
      if (!uid) return Promise.resolve();
      return saveBodyLog(uid, { ...log, id: log.id ?? newId(uid), createdAt: log.createdAt ?? Date.now() });
    },
    [uid],
  );
  const remove = useCallback((id: string) => (uid ? deleteBodyLog(uid, id) : Promise.resolve()), [uid]);
  return { bodyLogs, save, remove, loading: !loaded.bodyLogs };
}
