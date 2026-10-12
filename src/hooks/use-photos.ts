import { useCallback, useEffect, useState } from 'react';
import type { PhotoImages, ProgressPhoto } from '@/types';
import { deletePhoto, getPhotoImages, newPhotoId, savePhoto, savePhotoBody, settle, subscribePhotos } from '@/lib/firestore';
import { analyseBody, MASK_VERSION, type BodyResult } from '@/lib/body-align';
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

// corpo riconosciuto in ogni foto: si calcola una volta sola e si salva con la foto
const bodies = new Map<string, Promise<BodyResult | null>>();
function ensureBody(uid: string, photo: ProgressPhoto): Promise<BodyResult | null> {
  const id = photoId(photo);
  const key = `${uid}/${id}`;
  let r = bodies.get(key);
  if (!r) {
    r = (async () => {
      const im = await loadImages(uid, id);
      if (!im) return null;
      if (photo.body !== undefined && (photo.maskV ?? 1) >= MASK_VERSION) return { body: photo.body, mask: im.mask };
      const res = await analyseBody(im.front);
      const rest: PhotoImages = { ...im };
      delete rest.mask;
      memo.set(key, Promise.resolve(res.mask ? { ...rest, mask: res.mask } : rest));
      await settle(savePhotoBody(uid, id, res.body, MASK_VERSION, res.mask));
      return res;
    })();
    bodies.set(key, r);
    // non riuscito (es. senza connessione la prima volta): si riprova la prossima volta
    r.then(
      (x) => !x && bodies.delete(key),
      () => bodies.delete(key),
    );
  }
  return r;
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
      // il corpo si riconosce subito, senza aspettare: servirà per confronto, reel e sagoma
      if (meta.kind !== 'checkin') void ensureBody(uid, { ...meta, id }).catch(() => null);
      return id;
    },
    [uid],
  );
  const images = useCallback((id: string) => (uid ? loadImages(uid, id) : Promise.resolve(null)), [uid]);
  /** posizione e sagoma del corpo (riconosciuto la prima volta che serve) */
  const body = useCallback((p: ProgressPhoto) => (uid ? ensureBody(uid, p) : Promise.resolve(null)), [uid]);
  const remove = useCallback(
    (id: string) => {
      if (uid) bodies.delete(`${uid}/${id}`);
      return uid ? settle(deletePhoto(uid, id)) : Promise.resolve();
    },
    [uid],
  );
  return { photos, save, images, body, remove };
}
