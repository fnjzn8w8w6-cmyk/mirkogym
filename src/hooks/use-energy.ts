import { useMemo } from 'react';
import { energyModel, type EnergyBreakdown } from '@/lib/energy';
import { useEffectiveProfile } from './use-effective-profile';
import { useSessions } from './use-sessions';
import { useRecentFoodLogs } from './use-athlete';

/** Consumo calcolato adesso, voce per voce, con gli allenamenti e il diario delle ultime 2 settimane. */
export function useEnergy(): EnergyBreakdown | null {
  const p = useEffectiveProfile();
  const { sessions, groupOf } = useSessions();
  const foodLogs = useRecentFoodLogs(21);
  return useMemo(() => (p ? energyModel(p, sessions, foodLogs, { groupOf }) : null), [p, sessions, foodLogs, groupOf]);
}
