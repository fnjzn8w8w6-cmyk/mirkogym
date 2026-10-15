import { useEffect } from 'react';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { useRecentFoodLogs } from './use-athlete';
import { estimateMetabolism, smoothMetabolism } from '@/lib/body-model';
import { useEnergy } from './use-energy';
import { useEffectiveProfile } from './use-effective-profile';
import { settle } from '@/lib/firestore';
import { mondayISO, todayISO } from '@/lib/date-utils';
import { computeWeekCalories } from '@/lib/calorie-week';
import { metabolismReliable, userNutrition } from '@/lib/coach';
import { resolveCycling, weekTargets } from '@/lib/habits';
import { loadRecipes, rescalePlan } from '@/lib/recipes';
import { DEFAULT_NUTRITION, planPrefs } from '@/components/food/NutritionPlanner';
import { useSessions } from './use-sessions';
import { useSchedule } from './use-schedule';
import { useData } from './data-context';

/**
 * Una volta al giorno (o quando cambiano i passi) salva il consumo calcolato voce per voce e il metabolismo dal diario,
 * che si muove al massimo di 50 kcal al giorno. Aspetta qualche secondo che sessioni, diario e pesate siano caricati.
 */
export function useMetabolismSync() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(28);
  const energy = useEnergy();
  const { loaded } = useData();
  const ready = loaded.settings && loaded.bodyLogs && loaded.sessions;
  useEffect(() => {
    if (!ready || !energy) return;
    const today = todayISO();
    const e = settings.energy;
    const energyDue =
      !e || e.date !== today || e.steps !== energy.steps || e.stepsSource !== energy.stepsSource || e.tefSource !== energy.tefSource || e.eatSource !== energy.eatSource;
    // ricalcolo anche se il valore salvato è del vecchio calcolo (senza controllo di plausibilità)
    const metaDue = (settings.metabolism?.date !== today || (settings.metabolism != null && settings.metabolism.span == null)) && foodLogs.length > 0;
    if (!energyDue && !metaDue) return;
    const t = window.setTimeout(() => {
      const patch: Parameters<typeof update>[0] = {};
      if (energyDue) patch.energy = { ...energy, date: today };
      if (metaDue) {
        const m = estimateMetabolism(foodLogs, bodyLogs, energy.total);
        if (!m) {
          // dati non più sufficienti (es. calcolo più prudente): si torna al consumo calcolato
          if (settings.metabolism) patch.metabolism = null;
        } else {
          // finché la stima è provvisoria segue subito i dati; poi si muove piano (max 50 kcal al giorno)
          const prev = metabolismReliable(settings.metabolism) ? settings.metabolism : null;
          const value = m.anomalous ? m.tdee : smoothMetabolism(prev, m.tdee, today);
          patch.metabolism = { tdee: value, date: today, days: m.days, sd: m.sd, span: m.span, measured: m.measured, anomalous: m.anomalous };
        }
      }
      if (Object.keys(patch).length) void settle(update(patch));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [ready, energy, foodLogs, bodyLogs, settings.energy, settings.metabolism, update]);
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
  // peso e massa grassa attuali, consumo calcolato con gli allenamenti fatti
  const p = useEffectiveProfile();
  const energy = useEnergy();
  const due = Boolean(p) && settings.weekCal?.week !== mondayISO();
  useEffect(() => {
    if (!due || !p || !energy || !loaded.settings || !loaded.bodyLogs || !loaded.sessions) return;
    const t = window.setTimeout(() => {
      const w = computeWeekCalories(p, settings, bodyLogs, foodLogs, new Date(), energy.total);
      void (async () => {
        const patch: Parameters<typeof update>[0] = { weekCal: w, kcalAdjust: w.adjust };
        // il piano pasti segue il nuovo obiettivo (stesse ricette, porzioni ricalcolate)
        if (w.prevTarget != null && w.target !== w.prevTarget && settings.weekPlan && settings.weekPlan.source !== 'nutrizionista') {
          try {
            const data = await loadRecipes();
            const t = userNutrition(p, { ...settings, weekCal: w });
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
  }, [due, p, energy, loaded.settings, loaded.bodyLogs, loaded.sessions, settings, bodyLogs, foodLogs, update, sessions, days.length]);
}
