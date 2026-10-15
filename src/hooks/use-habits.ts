import { useMemo } from 'react';
import { useSettings } from './use-settings';
import { useSessions } from './use-sessions';
import { useBodyLogs } from './use-body-logs';
import { useSchedule } from './use-schedule';
import { useMesocycle } from './use-mesocycle';
import { useAthlete, useRecentFoodLogs } from './use-athlete';
import { useTrainingModel } from './use-training-model';
import { userNutrition } from '@/lib/coach';
import { buildProposals, learnedFavorites, resolveCycling, weekDays, weekTargets } from '@/lib/habits';
import { fromISODate, mondayISO, toISODate, todayISO } from '@/lib/date-utils';
import { useData } from './data-context';
import type { UserProfile } from '@/lib/metabolism';

/** Giorni con più calorie (allenamento) o null se le calorie sono uguali tutti i giorni. */
export function useCyclingDays(): number[] | null {
  const { settings } = useSettings();
  const { sessions } = useSessions();
  const { days } = useSchedule();
  return useMemo(
    () => resolveCycling({ enabled: settings.calorieCycling, manual: settings.carbCycling, sessions, perWeek: settings.profile?.daysPerWeek ?? days.length }),
    [settings.calorieCycling, settings.carbCycling, settings.profile?.daysPerWeek, sessions, days.length],
  );
}

/**
 * Obiettivo nutrizionale di un giorno (con le calorie che seguono la scheda, se attive).
 * Il tipo del giorno (allenamento/riposo) tiene conto della tua scelta nel diario e dell'allenamento fatto o in corso;
 * se cambia il numero di allenamenti della settimana, i giorni che restano compensano (media settimanale invariata).
 */
export function useDayTarget(profile: UserProfile | undefined, date = todayISO()) {
  const { settings } = useSettings();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { activeSession } = useData();
  const logs = useRecentFoodLogs(21);
  const cycling = useCyclingDays();
  return useMemo(() => {
    if (!profile) return null;
    const w = bodyLogs.find((b) => b.weight != null)?.weight ?? profile.weightKg;
    const base = userNutrition({ ...profile, weightKg: w }, settings);
    const today = todayISO();
    const trainedOn = new Set(sessions.map((s) => toISODate(s.date)));
    const choices = new Map(logs.filter((l) => l.dayType).map((l) => [l.date, l.dayType!]));
    const { days, reasons } = weekDays(base, cycling, mondayISO(fromISODate(date)), today, (d) => ({
      trained: trainedOn.has(d),
      active: d === today && Boolean(activeSession),
      choice: choices.get(d),
    }));
    const me = days.find((d) => d.date === date)!;
    return {
      base,
      cycling,
      day: me.target,
      /** chi ha deciso il tipo del giorno */
      source: me.source,
      /** kcal aggiunte/tolte a questo giorno per tenere la media della settimana, e perché */
      rebalance: me.rebalance,
      reasons,
      /** i 7 giorni della settimana come sono davvero */
      weekDays: days,
      week: weekTargets(base, cycling),
    };
  }, [profile, settings, sessions, bodyLogs, date, cycling, logs, activeSession]);
}

/** Ricette che mangi davvero (dal diario): il piano le propone più spesso. */
export function useLearnedFavorites() {
  const logs = useRecentFoodLogs(120);
  return useMemo(() => learnedFavorites(logs), [logs]);
}

/** Proposte del coach per la prossima settimana (da confermare nel check-in). */
export function useProposals() {
  const { settings } = useSettings();
  const { sessions } = useSessions();
  const { days } = useSchedule();
  const meso = useMesocycle();
  const { report } = useAthlete();
  const { ideal } = useTrainingModel();
  const foodLogs = useRecentFoodLogs(35);
  const cyclingNow = useCyclingDays();
  return useMemo(() => {
    if (!settings.profile) return [];
    return buildProposals({
      sessions,
      days,
      foodLogs,
      report,
      ideal,
      profile: settings.profile,
      coachPrefs: settings.coachPrefs,
      cycling: cyclingNow,
      hasPlan: Boolean(settings.weekPlan),
      mesoEnding: Boolean(meso.mesocycle) && meso.currentWeek >= meso.totalWeeks,
    });
  }, [settings, sessions, days, foodLogs, report, ideal, meso.mesocycle, meso.currentWeek, meso.totalWeeks, cyclingNow]);
}
