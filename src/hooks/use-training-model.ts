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

/**
 * Memoria completa per il coach: profilo dell'atleta + modello di allenamento
 * (fatica per muscolo, volume ideale), così le proposte si basano sugli stessi numeri dell'app.
 */
export function useCoachMemory(): string {
  const { text } = useAthlete();
  const { fatigue, ideal } = useTrainingModel();
  return useMemo(() => {
    const lines: string[] = [text];
    const fat = [...fatigue.values()].filter((f) => f.score >= 40).sort((a, b) => b.score - a.score);
    if (fat.length)
      lines.push(`FATICA PER MUSCOLO (0-100, sopra 70 = settimana leggera): ${fat.map((f) => `${f.group} ${f.score}${f.light ? ' (LEGGERA)' : ''}`).join(', ')}.`);
    const vol = [...ideal.values()];
    if (vol.length)
      lines.push(`VOLUME IDEALE serie/settimana (${vol.some((v) => v.personal) ? 'in parte dai suoi dati' : 'fasce standard'}): ${vol.map((v) => `${v.group} ${v.min}-${v.max}`).join(', ')}.`);
    return lines.join('\n');
  }, [text, fatigue, ideal]);
}
