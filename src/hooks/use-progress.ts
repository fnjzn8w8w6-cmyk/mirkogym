import { useMemo } from 'react';
import { useSessions } from './use-sessions';
import { useBodyLogs } from './use-body-logs';
import { ACHIEVEMENTS, computeStats, isUnlocked, levelOf, liftRanks, xpOf } from '@/lib/gamification';

/** Livello, traguardi e ranghi di forza dell'utente. */
export function useProgress() {
  const { sessions, nameOf } = useSessions();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const stats = computeStats(sessions, bodyLogs, nameOf);
    const achievements = ACHIEVEMENTS.map((a) => ({ a, unlocked: isUnlocked(a, stats), progress: a.progress(stats) }));
    const unlocked = achievements.filter((x) => x.unlocked).length;
    const level = levelOf(xpOf(stats, unlocked));
    const bodyweight = bodyLogs.find((b) => b.weight != null)?.weight ?? 0;
    const ranks = liftRanks(sessions, bodyweight, nameOf);
    return { stats, achievements, unlocked, level, bodyweight, ranks };
  }, [sessions, bodyLogs, nameOf]);
}
