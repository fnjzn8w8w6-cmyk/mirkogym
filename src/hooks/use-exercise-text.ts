import { useEffect, useState } from 'react';
import type { LibraryExercise } from '@/lib/exercise-library';
import { exerciseText, type TextSource } from '@/lib/exercise-i18n';
import { useSettings } from './use-settings';

export function useExerciseText(ex: LibraryExercise | null) {
  const { settings } = useSettings();
  const [state, setState] = useState<{ id: string; name: string; steps: string[]; source: TextSource } | null>(null);
  useEffect(() => {
    if (!ex) return;
    let alive = true;
    void exerciseText(ex, settings.language).then((t) => alive && setState({ id: ex.id, ...t }));
    return () => {
      alive = false;
    };
  }, [ex, settings.language]);
  const ready = Boolean(ex && state?.id === ex.id);
  return { text: ready ? state : null, loading: Boolean(ex) && !ready, lang: settings.language };
}
