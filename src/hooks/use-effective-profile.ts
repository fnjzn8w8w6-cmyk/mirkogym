import { useMemo } from 'react';
import type { UserProfile } from '@/lib/metabolism';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';

/** Profilo con peso e massa grassa più recenti registrati in "Corpo". */
export function useEffectiveProfile(): UserProfile | null {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const p = settings.profile;
    if (!p) return null;
    const w = bodyLogs.find((b) => b.weight != null)?.weight;
    const bf = bodyLogs.find((b) => b.bodyFat != null)?.bodyFat;
    return { ...p, weightKg: w ?? p.weightKg, bodyFatPct: bf ?? p.bodyFatPct };
  }, [settings.profile, bodyLogs]);
}
