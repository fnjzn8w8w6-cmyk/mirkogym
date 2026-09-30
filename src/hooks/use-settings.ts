import { useCallback } from 'react';
import type { Settings } from '@/types';
import { saveSettings } from '@/lib/firestore';
import { useData } from './data-context';

export function useSettings() {
  const { settings, uid, loaded } = useData();
  const update = useCallback(
    (patch: Partial<Settings>) => (uid ? saveSettings(uid, patch) : Promise.resolve()),
    [uid],
  );
  return { settings, update, loading: !loaded.settings };
}
