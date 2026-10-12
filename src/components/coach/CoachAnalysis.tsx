import { useMemo } from 'react';
import { useTrainingMemory, useTrainingModel } from '@/hooks/use-training-model';
import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useSchedule } from '@/hooks/use-schedule';
import { useAthlete } from '@/hooks/use-athlete';
import { analyzeSession, analyzeTrainingWeek, sessionData, trainingWeekData } from '@/lib/analysis';
import { mondayISO, toISODate } from '@/lib/date-utils';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { AINote } from './AIBusy';
import { PeriodAnalysis } from './PeriodAnalysis';

/** Analisi del coach sull'allenamento: ultima sessione o settimana in corso (solo allenamento) + osservazioni calcolate. */
export function CoachAnalysis() {
  const { settings, update } = useSettings();
  const { sessions, nameOf, groupOf } = useSessions();
  const { days } = useSchedule();
  const { report } = useAthlete();
  const { ideal } = useTrainingModel();
  const memory = useTrainingMemory();
  const profile = settings.profile;
  const last = useMemo(() => [...sessions].sort((a, b) => b.date - a.date)[0], [sessions]);
  const lastDay = last ? days.find((d) => d.id === last.dayId) : undefined;
  const lastName = lastDay ? `${lastDay.name}${lastDay.subtitle ? ` · ${lastDay.subtitle}` : ''}` : 'Allenamento';
  const week = mondayISO();
  const saved = settings.trainAnalysis ?? {};
  const insights = report.insights.filter((i) => i.area !== 'diet');

  return (
    <div className="space-y-4">
      <PeriodAnalysis
        title="Analisi del coach"
        help="train-analysis"
        modes={[
          {
            key: 'session',
            label: 'Sessione',
            subject: last ? `${new Date(last.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} · ${lastName}` : null,
            action: "Analizza l'ultima sessione",
            saved: saved.session,
            ref: last?.id ?? null,
            intro: last
              ? "Il coach guarda l'ultimo allenamento esercizio per esercizio e lo confronta con le volte precedenti: cosa è andato bene, cosa migliorare e i carichi per la prossima volta."
              : 'Fai il primo allenamento: poi il coach potrà analizzarlo.',
            run: (o) => analyzeSession(sessionData(last!, sessions, lastName, nameOf, groupOf), memory, profile!, o),
            save: (a) => settle(update({ trainAnalysis: { ...saved, session: a } })),
          },
          {
            key: 'week',
            label: 'Settimana',
            subject: `Settimana dal ${new Date(`${week}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long' })}`,
            action: 'Analizza la settimana',
            saved: saved.week,
            // la settimana cambia quando aggiungi una sessione: l'analisi va rifatta
            ref: profile ? `${week}:${sessions.filter((s) => toISODate(s.date) >= week).length}` : null,
            intro: 'Il coach guarda la settimana in corso fino a oggi: allenamenti fatti e mancanti, serie per muscolo e cosa fare nei giorni che restano. Non giudica la settimana come finita.',
            run: (o) => analyzeTrainingWeek(trainingWeekData(sessions, days, groupOf, ideal), memory, profile!, o),
            save: (a) => settle(update({ trainAnalysis: { ...saved, week: a } })),
          },
        ]}
      />

      <Card className="p-4">
        <h2 className="section-title">Cosa vede il coach nei tuoi dati</h2>
        {insights.length ? (
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.text} className={cn('rounded-md px-3 py-2 text-sm', i.tone === 'good' ? 'bg-accent-glow text-fg' : i.tone === 'bad' ? 'bg-danger-bg text-fg' : 'bg-surface-2 text-fg-2')}>
                {i.emoji} {i.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-3">Ancora pochi dati: dopo qualche allenamento con il resoconto compilato qui compariranno stalli, progressi, giorni saltati e fastidi.</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Sessioni', String(report.totalSessions)],
            ['A settimana', `${report.perWeek}/${report.planned}`],
            ['Voto medio', report.avgRating != null ? `${report.avgRating}/5` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="rounded-md bg-surface-2 py-2">
              <div className="font-display text-lg font-extrabold text-fg">{v}</div>
              <div className="text-xs uppercase text-fg-3">{l}</div>
            </div>
          ))}
        </div>
      </Card>
      <AINote />
    </div>
  );
}
