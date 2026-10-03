import { useMemo } from 'react';
import { useSettings } from './use-settings';
import { useSessions } from './use-sessions';
import { useBodyLogs } from './use-body-logs';
import { useSchedule } from './use-schedule';
import { useMesocycle } from './use-mesocycle';
import { useAthlete, useRecentFoodLogs } from './use-athlete';
import { useTrainingModel } from './use-training-model';
import { userNutrition } from '@/lib/coach';
import { buildProposals, dayNutrition, learnedFavorites, weekTargets, weekdayOf } from '@/lib/habits';
import { fromISODate, toISODate, todayISO } from '@/lib/date-utils';
import type { UserProfile } from '@/lib/metabolism';

/** Obiettivo nutrizionale di un giorno (con le calorie che seguono la scheda, se attive). */
export function useDayTarget(profile: UserProfile | undefined, date = todayISO()) {
  const { settings } = useSettings();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    if (!profile) return null;
    const w = bodyLogs.find((b) => b.weight != null)?.weight ?? profile.weightKg;
    const base = userNutrition({ ...profile, weightKg: w }, settings);
    const trainedThatDay = sessions.some((s) => toISODate(s.date) === date);
    // giorni passati senza allenamento = riposo; oggi e futuro seguono i giorni abituali
    const trained = trainedThatDay ? true : date < todayISO() ? false : undefined;
    return { base, day: dayNutrition(base, weekdayOf(fromISODate(date)), settings.carbCycling, trained), week: weekTargets(base, settings.carbCycling) };
  }, [profile, settings, sessions, bodyLogs, date]);
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
      cycling: settings.carbCycling,
      hasPlan: Boolean(settings.weekPlan),
      mesoEnding: Boolean(meso.mesocycle) && meso.currentWeek >= meso.totalWeeks,
    });
  }, [settings, sessions, days, foodLogs, report, ideal, meso.mesocycle, meso.currentWeek, meso.totalWeeks]);
}
