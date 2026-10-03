import { useMemo } from 'react';
import { useSessions } from './use-sessions';
import { useSettings } from './use-settings';
import { useAthlete } from './use-athlete';
import { groupFatigue, idealVolumes } from '@/lib/training-model';

/** Fatica per gruppo e volume ideale, calcolati dallo storico (sul telefono). */
export function useTrainingModel() {
  const { sessions, groupOf, nameOf } = useSessions();
  const { settings } = useSettings();
  const { report } = useAthlete();
  return useMemo(
    () => ({
      fatigue: groupFatigue(sessions, groupOf, report.pains),
      ideal: idealVolumes(sessions, groupOf, nameOf, [settings.weeklySetsMin, settings.weeklySetsMax]),
    }),
    [sessions, groupOf, nameOf, report.pains, settings.weeklySetsMin, settings.weeklySetsMax],
  );
}
