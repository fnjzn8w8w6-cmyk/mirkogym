import { useEffect, useMemo, useState } from 'react';
import { loadLibrary, searchText, type LibraryExercise } from '@/lib/exercise-library';

/** Carica la libreria esercizi (una sola volta per sessione, poi dalla cache del service worker). */
export function useLibrary() {
  const [list, setList] = useState<LibraryExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((l) => alive && setList(l))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Errore'));
    return () => {
      alive = false;
    };
  }, []);
  const byId = useMemo(() => new Map((list ?? []).map((e) => [e.id, e])), [list]);
  const texts = useMemo(() => new Map((list ?? []).map((e) => [e.id, searchText(e)])), [list]);
  return { list, byId, texts, error, loading: !list && !error };
}
