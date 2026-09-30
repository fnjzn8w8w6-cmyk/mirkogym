import type { Day, Session } from '@/types';

/** Prossimo giorno della scheda: quello successivo all'ultimo allenato (ciclico). */
export function nextDay(days: Day[], sessions: Session[]): Day | undefined {
  if (days.length === 0) return undefined;
  const last = sessions.find((s) => days.some((d) => d.id === s.dayId)); // sessions già ordinate desc
  if (!last) return days[0];
  const idx = days.findIndex((d) => d.id === last.dayId);
  return days[(idx + 1) % days.length];
}

export const plannedSets = (day: Day): number => day.exercises.reduce((a, e) => a + e.sets, 0);

/** Gruppi muscolari del giorno, in ordine di apparizione. */
export const dayGroups = (day: Day): string[] => [...new Set(day.exercises.map((e) => e.group))];
