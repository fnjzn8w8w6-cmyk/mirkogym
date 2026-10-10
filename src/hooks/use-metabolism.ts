import { useEffect } from 'react';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { useRecentFoodLogs } from './use-athlete';
import { estimateMetabolism, smoothMetabolism } from '@/lib/body-model';
import { tdee } from '@/lib/metabolism';
import { settle } from '@/lib/firestore';
import { mondayISO, todayISO } from '@/lib/date-utils';
import { computeWeekCalories } from '@/lib/calorie-week';
import { userNutrition } from '@/lib/coach';
import { resolveCycling, weekTargets } from '@/lib/habits';
import { loadRecipes, rescalePlan } from '@/lib/recipes';
import { DEFAULT_NUTRITION, planPrefs } from '@/components/food/NutritionPlanner';
import { useSessions } from './use-sessions';
import { useSchedule } from './use-schedule';
import { useData } from './data-context';

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

/**
 * Aggiornamento settimanale delle calorie: il primo avvio di ogni settimana (lunedì) fissa l'obiettivo.
 * Aspetta qualche secondo che diario, pesate e metabolismo del giorno siano caricati.
 */
export function useWeekCaloriesSync() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(28);
  const { loaded } = useData();
  const { sessions } = useSessions();
  const { days } = useSchedule();
  const p = settings.profile;
  const due = Boolean(p) && settings.weekCal?.week !== mondayISO();
  useEffect(() => {
    if (!due || !p || !loaded.settings || !loaded.bodyLogs) return;
    const t = window.setTimeout(() => {
      const weight = bodyLogs.find((b) => b.weight != null)?.weight ?? p.weightKg;
      const w = computeWeekCalories({ ...p, weightKg: weight }, settings, bodyLogs, foodLogs);
      void (async () => {
        const patch: Parameters<typeof update>[0] = { weekCal: w, kcalAdjust: w.adjust };
        // il piano pasti segue il nuovo obiettivo (stesse ricette, porzioni ricalcolate)
        if (w.prevTarget != null && w.target !== w.prevTarget && settings.weekPlan && settings.weekPlan.source !== 'nutrizionista') {
          try {
            const data = await loadRecipes();
            const t = userNutrition({ ...p, weightKg: weight }, { ...settings, weekCal: w });
            const cycling = resolveCycling({ enabled: settings.calorieCycling, manual: settings.carbCycling, sessions, perWeek: p.daysPerWeek ?? days.length });
            patch.weekPlan = rescalePlan(
              settings.weekPlan,
              data,
              t,
              planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, settings.favoriteRecipes ?? []),
              cycling ? weekTargets(t, cycling) : undefined,
            );
          } catch {
            /* il piano verrà ricalibrato dalla sezione Dieta */
          }
        }
        await settle(update(patch));
      })();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [due, p, loaded.settings, loaded.bodyLogs, settings, bodyLogs, foodLogs, update, sessions, days.length]);
}
