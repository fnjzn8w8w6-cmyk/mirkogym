import { RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useAthlete } from '@/hooks/use-athlete';
import { analyzeAthlete } from '@/lib/coach';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { AIBusy, AINote, AIPersona, useAITask } from './AIBusy';

/** Analisi del coach: osservazioni calcolate (sempre) + resoconto AI salvato, aggiornabile. */
export function CoachAnalysis() {
  const { settings, update } = useSettings();
  const { sessions } = useSessions();
  const { report, text } = useAthlete();
  const ai = useAITask();
  const saved = settings.coachAnalysis;
  const newSince = saved ? sessions.filter((s) => s.date > saved.at).length : sessions.length;

  const run = async () => {
    if (!settings.profile) return;
    const out = await ai.run((o) => analyzeAthlete(text, settings.profile!, o));
    if (out) await settle(update({ coachAnalysis: { text: out, at: Date.now(), sessions: sessions.length } }));
  };

  return (
    <div className="space-y-4">
      <Card className="border-violet-500/40 p-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(21,15,34,0.95))' }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold text-fg">Analisi del coach</h2>
          {saved && <span className="text-xs text-fg-3">{new Date(saved.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>}
        </div>
        {ai.busy ? (
          <div className="mt-3">
            <AIBusy status={ai.status} onCancel={ai.cancel} />
          </div>
        ) : saved ? (
          <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-fg">{saved.text}</p>
        ) : (
          <div className="mt-2 text-center">
            <AIPersona />
            <p className="text-sm text-fg-2">
              Il coach legge tutte le sessioni, i resoconti, le note e il diario e ti dice concretamente come stai andando e cosa migliorare.
            </p>
          </div>
        )}
        {ai.error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {ai.error}
          </p>
        )}
        {!ai.busy && (
          <Button className="mt-3" fullWidth icon={<RefreshCw className="h-5 w-5" />} onClick={() => void run()} disabled={!settings.profile}>
            {saved ? `Aggiorna analisi${newSince ? ` (${newSince} ${newSince === 1 ? 'sessione nuova' : 'sessioni nuove'})` : ''}` : 'Analizza il mio storico'}
          </Button>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="section-title">Cosa vede il coach nei tuoi dati</h2>
        {report.insights.length ? (
          <ul className="space-y-2">
            {report.insights.map((i) => (
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
