import { useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import type { FoodLog } from '@/types';
import { subscribeRecentFoodLogs } from '@/lib/firestore';
import { toISODate } from '@/lib/date-utils';
import { athleteReport, athleteText } from '@/lib/athlete';
import { userNutrition } from '@/lib/coach';
import { useData } from './data-context';
import { useSessions } from './use-sessions';
import { useSchedule } from './use-schedule';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';

/** Diario alimentare delle ultime `days` giornate. */
export function useRecentFoodLogs(days = 28) {
  const { uid } = useData();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeRecentFoodLogs(uid, toISODate(addDays(new Date(), -days)), setLogs, () => undefined);
  }, [uid, days]);
  return logs;
}

/** Profilo dell'atleta (memoria del coach) + testo per i prompt. */
export function useAthlete() {
  const { sessions, nameOf, groupOf } = useSessions();
  const { days } = useSchedule();
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs();
  return useMemo(() => {
    const p = settings.profile;
    const w = bodyLogs.find((b) => b.weight != null)?.weight ?? p?.weightKg;
    const t = p ? userNutrition({ ...p, weightKg: w ?? p.weightKg }, settings) : null;
    const report = athleteReport({
      sessions,
      days,
      foodLogs,
      bodyLogs,
      target: t ? { kcal: t.target, protein: t.protein } : null,
      painResolved: settings.painResolved,
      nameOf,
      groupOf,
    });
    const lastCheck = settings.checkIns?.[0];
    const text =
      athleteText(report) +
      (lastCheck ? `\nUltimo check-in (${new Date(lastCheck.date).toLocaleDateString('it-IT')}): ${lastCheck.summary.slice(0, 400)}` : '') +
      (settings.coachAnalysis ? `\nUltima analisi del coach: ${settings.coachAnalysis.text.slice(0, 500)}` : '');
    return { report, text };
  }, [sessions, days, foodLogs, bodyLogs, settings, nameOf, groupOf]);
}
