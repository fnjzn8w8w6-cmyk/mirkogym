import { useEffect } from 'react';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { useRecentFoodLogs } from './use-athlete';
import { estimateMetabolism, smoothMetabolism } from '@/lib/body-model';
import { tdee } from '@/lib/metabolism';
import { settle } from '@/lib/firestore';
import { todayISO } from '@/lib/date-utils';

/** Aggiorna una volta al giorno il metabolismo reale (dal diario), muovendolo al massimo di 50 kcal al giorno. */
export function useMetabolismSync() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(28);
  const p = settings.profile;
  useEffect(() => {
    if (!p || !foodLogs.length) return;
    const today = todayISO();
    if (settings.metabolism?.date === today) return;
    const m = estimateMetabolism(foodLogs, bodyLogs, tdee(p));
    if (!m) return;
    const value = smoothMetabolism(settings.metabolism, m.tdee, today);
    void settle(update({ metabolism: { tdee: value, date: today, days: m.days, sd: m.sd } }));
  }, [p, foodLogs, bodyLogs, settings.metabolism, update]);
}
