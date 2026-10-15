import { useCallback, useEffect, useMemo } from 'react';
import type { WeekCalories } from '@/types';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { useRecentFoodLogs } from './use-athlete';
import { estimateMetabolism, smoothMetabolism } from '@/lib/body-model';
import { useEnergy } from './use-energy';
import { useEffectiveProfile } from './use-effective-profile';
import { settle } from '@/lib/firestore';
import { mondayISO, todayISO } from '@/lib/date-utils';
import { computeWeekCalories } from '@/lib/calorie-week';
import { weekPhaseChanged } from '@/lib/goal-plan';
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

/** Settimana prima di quella in corso, ricostruita dai valori salvati per "Annulla" (per rifare il calcolo del lunedì). */
function previousWeek(w: WeekCalories | undefined): WeekCalories | undefined {
  if (!w || w.week !== mondayISO()) return w;
  const base = w.beforeRecalc ?? w;
  if (!base.undo) return undefined;
  return { ...base, ...base.undo, intent: undefined, week: 'prima', undo: undefined, beforeRecalc: undefined };
}

/** Salva le calorie di una settimana e ricalcola le porzioni del piano pasti (stesse ricette). */
function useApplyWeek() {
  const { settings, update } = useSettings();
  const { sessions } = useSessions();
  const { days } = useSchedule();
  const p = useEffectiveProfile();
  return useCallback(
    async (w: WeekCalories) => {
      if (!p) return;
      const patch: Parameters<typeof update>[0] = { weekCal: w, kcalAdjust: w.adjust };
      const before = settings.weekCal && settings.weekCal.week === w.week ? settings.weekCal.target : w.prevTarget;
      if (before != null && w.target !== before && settings.weekPlan && settings.weekPlan.source !== 'nutrizionista') {
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
    },
    [p, settings, update, sessions, days.length],
  );
}

/**
 * Calcolo della settimana con i dati di oggi:
 * - `recalc`: questa settimana rifatta adesso (come se fosse lunedì), per "Ricalcola ora";
 * - `next`: anteprima della settimana prossima (quello che il lunedì fisserebbe con i dati di oggi).
 */
export function useWeekCalc() {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(28);
  const p = useEffectiveProfile();
  const energy = useEnergy();
  const apply = useApplyWeek();
  return useMemo(() => {
    if (!p || !energy) return { recalc: null, next: null, applyRecalc: async () => undefined };
    const now = new Date();
    const cur = settings.weekCal && settings.weekCal.week === mondayISO() ? settings.weekCal : undefined;
    const recalc = cur ? { ...computeWeekCalories(p, { ...settings, weekCal: previousWeek(cur) }, bodyLogs, foodLogs, now, energy.total), beforeRecalc: cur.beforeRecalc ?? cur } : null;
    const next = computeWeekCalories(p, settings, bodyLogs, foodLogs, now, energy.total);
    return { recalc, next, applyRecalc: async () => (recalc ? apply(recalc) : undefined) };
  }, [p, energy, settings, bodyLogs, foodLogs, apply]);
}

/**
 * Aggiornamento settimanale delle calorie: il primo avvio di ogni settimana (lunedì) fissa l'obiettivo.
 * Aspetta qualche secondo che diario, pesate e metabolismo del giorno siano caricati.
 */
export function useWeekCaloriesSync() {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(28);
  const { loaded } = useData();
  // peso e massa grassa attuali, consumo calcolato con gli allenamenti fatti
  const p = useEffectiveProfile();
  const energy = useEnergy();
  // a metà settimana si ricalcola anche quando cambia la fase dell'obiettivo (conferma del coach, check-in, fase dopo)
  const phaseChanged = settings.weekCal?.week === mondayISO() && weekPhaseChanged(settings.weekCal, settings.goalPlan);
  const due = Boolean(p) && (settings.weekCal?.week !== mondayISO() || phaseChanged);
  const apply = useApplyWeek();
  useEffect(() => {
    if (!due || !p || !energy || !loaded.settings || !loaded.bodyLogs || !loaded.sessions) return;
    const t = window.setTimeout(() => {
      // ricalcolo della settimana in corso: si riparte dai valori della settimana prima (per "Annulla")
      const s = phaseChanged ? { ...settings, weekCal: previousWeek(settings.weekCal), kcalAdjust: 0 } : settings;
      void apply(computeWeekCalories(p, s, bodyLogs, foodLogs, new Date(), energy.total));
    }, phaseChanged ? 800 : 4000);
    return () => window.clearTimeout(t);
  }, [due, phaseChanged, p, energy, loaded.settings, loaded.bodyLogs, loaded.sessions, settings, bodyLogs, foodLogs, apply]);
}
