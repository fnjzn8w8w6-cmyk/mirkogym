import { useCallback, useEffect, useState } from 'react';
import type { CheckIn } from '@/lib/checkin';
import { deleteCheckIn, deletePhoto, saveCheckIn, settle, subscribeCheckIns } from '@/lib/firestore';
import { useData } from './data-context';
import { useSettings } from './use-settings';

/**
 * Archivio completo dei check-in settimanali (tutti, dal più recente).
 * I check-in fatti prima dell'archivio (salvati solo nelle impostazioni) vengono copiati qui la prima volta.
 */
export function useCheckIns() {
  const { uid } = useData();
  const { settings, update } = useSettings();
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
  /** Elimina un check-in (anche dall'elenco breve delle impostazioni, così non torna) e, se c'è, la sua foto. */
  const remove = useCallback(
    async (c: CheckIn, photoId?: string) => {
      if (!uid) return;
      // prima dall'elenco breve (altrimenti verrebbe ricopiato nell'archivio), poi dall'archivio
      await settle(update({ checkIns: (settings.checkIns ?? []).filter((x) => x.date !== c.date) }));
      await settle(deleteCheckIn(uid, c.date));
      if (photoId) await settle(deletePhoto(uid, photoId));
    },
    [uid, update, settings.checkIns],
  );
  // finché l'archivio non è caricato si mostrano quelli delle impostazioni
  const all = list ?? settings.checkIns ?? [];
  const merged = [...all, ...(settings.checkIns ?? []).filter((c) => !all.some((x) => x.date === c.date))].sort((a, b) => b.date - a.date);
  return { checkIns: merged, save, remove, loading: list == null };
}
