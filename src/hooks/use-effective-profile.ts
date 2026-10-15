import { useMemo } from 'react';
import type { UserProfile } from '@/lib/metabolism';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { bodyFatNow } from '@/lib/bodyfat-estimate';

/** Profilo con peso e massa grassa attuali (da "Corpo"): è quello da usare per calorie e consumo. */
export function useEffectiveProfile(): UserProfile | null {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const p = settings.profile;
    if (!p) return null;
    const w = bodyLogs.find((b) => b.weight != null)?.weight;
    // ultima misura affidabile della massa grassa, aggiornata col trend del peso (come in Corpo)
    const bf = bodyFatNow(bodyLogs)?.value;
    return { ...p, weightKg: w ?? p.weightKg, bodyFatPct: bf ?? p.bodyFatPct };
  }, [settings.profile, bodyLogs]);
}
