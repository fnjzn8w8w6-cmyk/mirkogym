import { useData } from '@/hooks/data-context';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { useTrainingMemory } from '@/hooks/use-training-model';
import { analyzeSession, sessionData, type SavedAnalysis } from '@/lib/analysis';
import { saveSessionAnalysis, settle } from '@/lib/firestore';
import type { Session } from '@/types';
import { AutoRecap } from './AutoRecap';

/** Recap del coach su una sessione: si fa da solo e resta salvato nella sessione. */
export function SessionRecap({ session, auto, waiting, onSaved }: { session: Session; auto: boolean; waiting: string; onSaved?: (a: SavedAnalysis) => void }) {
  const { uid } = useData();
  const { settings } = useSettings();
  const { sessions, nameOf, groupOf } = useSessions();
  const { getDay } = useSchedule();
  const memory = useTrainingMemory();
  const profile = settings.profile;
  // il recap va rifatto se arriva (o cambia) il tuo resoconto
  const refKey = profile ? `${session.id}:${session.recap?.at ?? 0}` : null;
  return (
    <AutoRecap
      title="Recap del coach"
      help="session-recap"
      persona="coach"
      saved={session.analysis}
      refKey={refKey}
      auto={auto}
      waiting={profile ? waiting : 'Completa il tuo profilo (Profilo → dati personali): poi il coach potrà fare il recap delle sessioni.'}
      action="Fai il recap adesso"
      run={(o) => {
        const day = getDay(session.dayId);
        const name = day ? `${day.name}${day.subtitle ? ` · ${day.subtitle}` : ''}` : 'Allenamento';
        const all = sessions.some((x) => x.id === session.id) ? sessions : [...sessions, session];
        return analyzeSession(sessionData(session, all, name, nameOf, groupOf), memory, profile!, o);
      }}
      save={async (a) => {
        onSaved?.(a);
        if (uid) await settle(saveSessionAnalysis(uid, session.id, a));
      }}
    />
  );
}
