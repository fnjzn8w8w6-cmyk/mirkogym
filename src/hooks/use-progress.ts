import { useMemo } from 'react';
import { useSessions } from './use-sessions';
import { useBodyLogs } from './use-body-logs';
import { useSettings } from './use-settings';
import { useSchedule } from './use-schedule';
import { useRecentFoodLogs } from './use-athlete';
import { ACHIEVEMENTS, computeStats, isUnlocked, levelOf, liftRanks, xpOf, type StatsExtra } from '@/lib/gamification';
import { weekKey, weeklyQuests } from '@/lib/quests';
import { userNutrition } from '@/lib/coach';
import { weekStreak } from '@/lib/analytics';

const WEEK = 7 * 86400000;

/** Dati extra per statistiche e XP (dieta, sfide), condivisi tra profilo e fine sessione. */
export function useStatsExtra(): StatsExtra {
  const { groupOf } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { settings } = useSettings();
  const foodLogs = useRecentFoodLogs(180);
  return useMemo(() => {
    const p = settings.profile;
    const bodyweight = bodyLogs.find((b) => b.weight != null)?.weight ?? p?.weightKg;
    const t = p ? userNutrition({ ...p, weightKg: bodyweight ?? p.weightKg }, settings) : null;
    return { foodLogs, target: t ? { kcal: t.target, protein: t.protein } : null, quests: settings.questsDone?.length ?? 0, bodyweight, groupOf };
  }, [foodLogs, bodyLogs, settings, groupOf]);
}

/** Livello, traguardi, ranghi di forza, sfide settimanali e striscia dell'utente. */
export function useProgress() {
  const { sessions, nameOf, groupOf } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { days } = useSchedule();
  const { settings } = useSettings();
  const extra = useStatsExtra();
  return useMemo(() => {
    const stats = computeStats(sessions, bodyLogs, nameOf, extra);
    const achievements = ACHIEVEMENTS.map((a) => ({ a, unlocked: isUnlocked(a, stats), progress: a.progress(stats) }));
    const unlocked = achievements.filter((x) => x.unlocked).length;
    const level = levelOf(xpOf(stats, unlocked));
    const bodyweight = bodyLogs.find((b) => b.weight != null)?.weight ?? 0;
    const ranks = liftRanks(sessions, bodyweight, nameOf, groupOf, settings.profile?.sex ?? 'm');
    const key = weekKey();
    const from = new Date(`${key}T00:00:00`).getTime();
    const quests = weeklyQuests(
      {
        week: sessions.filter((s) => s.date >= from),
        prevWeek: sessions.filter((s) => s.date >= from - WEEK && s.date < from),
        food: (extra.foodLogs ?? []).filter((l) => l.date >= key),
        body: bodyLogs.filter((b) => b.date >= key),
        planned: Math.max(1, settings.profile?.daysPerWeek ?? days.length),
        target: extra.target ?? null,
        groupOf,
      },
      key,
    ).map((q) => ({ ...q, claimed: settings.questsDone?.includes(q.id) ?? false }));
    return { stats, achievements, unlocked, level, bodyweight, ranks, quests, streak: weekStreak(sessions) };
  }, [sessions, bodyLogs, nameOf, groupOf, extra, days, settings.profile?.daysPerWeek, settings.profile?.sex, settings.questsDone]);
}
