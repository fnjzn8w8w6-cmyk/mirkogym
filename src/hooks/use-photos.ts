import { useCallback, useEffect, useState } from 'react';
import type { PhotoImages, ProgressPhoto } from '@/types';
import { deletePhoto, getPhotoImages, newPhotoId, savePhoto, settle, subscribePhotos } from '@/lib/firestore';
import { useData } from './data-context';

/** Foto dei progressi (metadati in tempo reale, immagini su richiesta). `id` = codice della foto. */
export const photoId = (p: ProgressPhoto) => p.id ?? p.date;

// foto grandi già caricate in questa sessione (e richieste in corso): riaprirle è istantaneo
const memo = new Map<string, Promise<PhotoImages | null>>();
function loadImages(uid: string, id: string): Promise<PhotoImages | null> {
  const key = `${uid}/${id}`;
  let p = memo.get(key);
  if (!p) {
    p = getPhotoImages(uid, id).catch(() => null);
    memo.set(key, p);
    // se non è arrivata, la prossima volta si riprova
    void p.then((r) => !r && memo.delete(key));
  }
  return p;
}

export function usePhotos() {
  const { uid } = useData();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribePhotos(uid, setPhotos, () => undefined);
  }, [uid]);
  /** salva sempre una foto nuova (con codice suo) e restituisce il codice */
  const save = useCallback(
    async (meta: ProgressPhoto, images: PhotoImages) => {
      if (!uid) return null;
      const id = meta.id ?? newPhotoId(meta.date);
      await settle(savePhoto(uid, { ...meta, id }, images));
      return id;
    },
    [uid],
  );
  const images = useCallback((id: string) => (uid ? loadImages(uid, id) : Promise.resolve(null)), [uid]);
  const remove = useCallback((id: string) => (uid ? settle(deletePhoto(uid, id)) : Promise.resolve()), [uid]);
  return { photos, save, images, remove };
}
