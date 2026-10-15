import { useCallback, useEffect, useState } from 'react';
import type { GoalPhoto } from '@/types';
import { deleteGoalPhoto, getGoalPhotoImage, saveGoalPhoto, settle, subscribeGoalPhotos } from '@/lib/firestore';
import { useData } from './data-context';

// immagini già caricate in questa sessione: riaprirle è istantaneo
const memo = new Map<string, Promise<string | null>>();

/** Riduce un'immagine (JPEG): `max` px sul lato lungo. Il documento salvato deve restare sotto ~1 MB. */
async function jpeg(src: string, max: number, quality: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Immagine non leggibile'));
    i.src = src;
  });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Foto obiettivo salvate nell'app (si vedono ogni volta, su tutti i dispositivi). */
export function useGoalPhotos() {
  const { uid } = useData();
  const [goalPhotos, setGoalPhotos] = useState<GoalPhoto[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeGoalPhotos(uid, setGoalPhotos, () => undefined);
  }, [uid]);
  const image = useCallback(
    (id: string) => {
      if (!uid) return Promise.resolve(null);
      const key = `${uid}/${id}`;
      let p = memo.get(key);
      if (!p) {
        p = getGoalPhotoImage(uid, id).catch(() => null);
        memo.set(key, p);
        void p.then((r) => !r && memo.delete(key));
      }
      return p;
    },
    [uid],
  );
  const save = useCallback(
    async (meta: Omit<GoalPhoto, 'id' | 'thumb' | 'createdAt'>, src: string) => {
      if (!uid) return null;
      // immagine grande sotto ~700 KB, miniatura piccola
      let big = await jpeg(src, 1024, 0.85);
      if (big.length > 900_000) big = await jpeg(src, 900, 0.75);
      const thumb = await jpeg(src, 240, 0.7);
      const id = `goal-${Date.now().toString(36)}`;
      memo.set(`${uid}/${id}`, Promise.resolve(big));
      await settle(saveGoalPhoto(uid, { ...meta, id, thumb, createdAt: Date.now() }, big));
      return id;
    },
    [uid],
  );
  const remove = useCallback((id: string) => (uid ? settle(deleteGoalPhoto(uid, id)) : Promise.resolve()), [uid]);
  return { goalPhotos, image, save, remove };
}
