import { useCallback, useEffect, useState } from 'react';
import type { CheckIn } from '@/lib/checkin';
import { saveCheckIn, settle, subscribeCheckIns } from '@/lib/firestore';
import { useData } from './data-context';
import { useSettings } from './use-settings';

/**
 * Archivio completo dei check-in settimanali (tutti, dal più recente).
 * I check-in fatti prima dell'archivio (salvati solo nelle impostazioni) vengono copiati qui la prima volta.
 */
export function useCheckIns() {
  const { uid } = useData();
  const { settings } = useSettings();
  const [list, setList] = useState<CheckIn[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return subscribeCheckIns(uid, setList, () => setList([]));
  }, [uid]);
  useEffect(() => {
    if (!uid || !list) return;
    const have = new Set(list.map((c) => c.date));
    for (const c of settings.checkIns ?? []) if (!have.has(c.date)) void settle(saveCheckIn(uid, c));
  }, [uid, list, settings.checkIns]);
  const save = useCallback((c: CheckIn) => (uid ? settle(saveCheckIn(uid, c)) : Promise.resolve()), [uid]);
  // finché l'archivio non è caricato si mostrano quelli delle impostazioni
  const all = list ?? settings.checkIns ?? [];
  const merged = [...all, ...(settings.checkIns ?? []).filter((c) => !all.some((x) => x.date === c.date))].sort((a, b) => b.date - a.date);
  return { checkIns: merged, save, loading: list == null };
}
