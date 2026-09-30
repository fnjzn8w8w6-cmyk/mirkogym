import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, Library, Pencil, Play } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { MuscleFigure, GROUP_MUSCLES } from '@/components/library/MuscleFigure';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { useActiveSession } from '@/hooks/use-active-session';
import { muscleStatus } from '@/lib/analytics';
import { formatRelativeDay } from '@/lib/date-utils';
import { sessionMinutes } from '@/lib/program-generator';
import { cn } from '@/lib/cn';
import type { Day } from '@/types';
import History from './History';

type Tab = 'plan' | 'history';

/** Allenamento: scheda (giorni, mappa muscolare, strumenti) e storico. */
export default function Training() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'plan';
  const { days } = useSchedule();
  const { sessions, groupOf } = useSessions();
  const { settings } = useSettings();
  const meso = useMesocycle();
  const { activeSession, start } = useActiveSession();
  const toast = useToast();
  const [starting, setStarting] = useState<string | null>(null);

  const intensity = useMemo(() => {
    const groups = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))];
    const out: Record<string, number> = {};
    for (const m of muscleStatus(sessions, groupOf, groups)) for (const mm of GROUP_MUSCLES[m.group] ?? []) out[mm] = m.weekSets / settings.weeklySetsMax;
    return out;
  }, [sessions, groupOf, days, settings.weeklySetsMax]);

  const lastForDay = (id: string) => sessions.find((s) => s.dayId === id);
  const next = useMemo(() => {
    const last = sessions[0];
    if (!last) return days[0];
    const idx = days.findIndex((d) => d.id === last.dayId);
    return days[(idx + 1) % days.length] ?? days[0];
  }, [sessions, days]);

  const startDay = async (day: Day) => {
    if (activeSession) {
      if (activeSession.dayId === day.id) return navigate(`/session/${day.id}`);
      toast.info('Hai già un allenamento in corso: riprendilo o terminalo dalla Home');
      return;
    }
    setStarting(day.id);
    try {
      await start(day, meso.isDeloadWeek);
      navigate(`/session/${day.id}`);
    } catch {
      toast.error('Impossibile avviare la sessione');
    } finally {
      setStarting(null);
    }
  };

  return (
    <div>
      <TopBar title="Allenamento" subtitle={meso.mesocycle ? `Settimana ${meso.currentWeek} di ${meso.totalWeeks}${meso.isDeloadWeek ? ' · deload' : ''}` : undefined} large />
      <div className="page pt-3">
        <Segmented<Tab>
          label="Sezione allenamento"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'plan', label: 'Scheda' },
            { value: 'history', label: 'Storico' },
          ]}
        />
        <div className="mt-4 space-y-4">
          {tab === 'history' ? (
            <History embedded />
          ) : (
            <>
              <ul className="space-y-3">
                {days.map((d) => {
                  const last = lastForDay(d.id);
                  const isNext = d.id === next?.id;
                  return (
                    <li key={d.id}>
                      <Card className={cn('flex items-center gap-3 p-4', isNext && 'border-accent-500/50')}>
                        <span
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-md font-display text-lg font-extrabold',
                            isNext ? 'bg-accent-500 text-onaccent' : 'bg-surface-2 text-fg-2',
                          )}
                        >
                          {d.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-fg">{d.subtitle}</span>
                          <span className="block text-sm text-fg-3">
                            {d.exercises.length} esercizi · ~{sessionMinutes(d)} min · {last ? formatRelativeDay(last.date) : 'mai fatto'}
                          </span>
                        </span>
                        {activeSession?.dayId === d.id ? (
                          <Chip tone="accent">In corso</Chip>
                        ) : (
                          <Button size="sm" variant={isNext ? 'primary' : 'secondary'} loading={starting === d.id} icon={<Play className="h-4 w-4" />} onClick={() => void startDay(d)} aria-label={`Inizia ${d.subtitle}`}>
                            {isNext ? 'Inizia' : ''}
                          </Button>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate('/schedule')}>
                  Scheda
                </Button>
                <Button variant="secondary" size="sm" icon={<Library className="h-4 w-4" />} onClick={() => navigate('/exercises')}>
                  Esercizi
                </Button>
                <Button variant="secondary" size="sm" icon={<CalendarRange className="h-4 w-4" />} onClick={() => navigate('/mesocycle')}>
                  Mesociclo
                </Button>
              </div>
              <Card className="p-4">
                <h2 className="section-title">Muscoli allenati questa settimana</h2>
                <MuscleFigure intensity={intensity} labels className="mx-auto h-72 w-auto" />
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-fg-3">
                  Poco
                  <span className="h-2 w-24 rounded-full bg-gradient-to-r from-accent-500/25 to-accent-500" aria-hidden />
                  Obiettivo raggiunto
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
