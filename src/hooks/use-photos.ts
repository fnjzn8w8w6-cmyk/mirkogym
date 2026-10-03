import { useCallback, useEffect, useState } from 'react';
import type { PhotoImages, ProgressPhoto } from '@/types';
import { deletePhoto, getPhotoImages, savePhoto, settle, subscribePhotos } from '@/lib/firestore';
import { useData } from './data-context';

/** Foto settimanali dei progressi (metadati in tempo reale, immagini su richiesta). */
export function usePhotos() {
  const { uid } = useData();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribePhotos(uid, setPhotos, () => undefined);
  }, [uid]);
  const save = useCallback((meta: ProgressPhoto, images: PhotoImages) => (uid ? settle(savePhoto(uid, meta, images)) : Promise.resolve()), [uid]);
  const images = useCallback((date: string) => (uid ? getPhotoImages(uid, date) : Promise.resolve(null)), [uid]);
  const remove = useCallback((date: string) => (uid ? settle(deletePhoto(uid, date)) : Promise.resolve()), [uid]);
  return { photos, save, images, remove };
}
