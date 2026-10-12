import { useState, type ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { SectionTitle } from '@/components/ui/Help';
import type { HelpId } from '@/lib/help';
import type { SavedAnalysis } from '@/lib/analysis';
import type { AIOptions } from '@/lib/ai';
import { AIBusy, AIPersona, useAITask, type Persona } from './AIBusy';

export interface AnalysisMode {
  key: string;
  /** etichetta del selettore (es. "Sessione") */
  label: string;
  /** di cosa parla, mostrato sopra il testo (es. "Lunedì 12 ottobre · Petto + Tricipiti") */
  subject: string | null;
  /** testo del pulsante (es. "Analizza l'ultima sessione") */
  action: string;
  saved?: SavedAnalysis;
  /** riferimento attuale: se diverso da quello salvato l'analisi è vecchia */
  ref: string | null;
  /** cosa fa vedere prima della prima analisi */
  intro: string;
  run: (o: AIOptions) => Promise<string>;
  save: (a: SavedAnalysis) => Promise<void>;
}

/** Analisi del coach con due pulsanti (es. sessione / settimana): ogni risultato resta salvato. */
export function PeriodAnalysis({ title, help, modes, persona = 'coach', footer }: { title: string; help: HelpId; modes: AnalysisMode[]; persona?: Persona; footer?: ReactNode }) {
  const [key, setKey] = useState(modes[0].key);
  const ai = useAITask();
  const mode = modes.find((m) => m.key === key) ?? modes[0];
  const fresh = mode.saved && mode.saved.ref === mode.ref;

  const go = async () => {
    if (!mode.ref) return;
    const text = await ai.run((o) => mode.run(o));
    if (text) await mode.save({ text, at: Date.now(), ref: mode.ref });
  };

  return (
    <Card className="border-violet-500/40 p-4" style={{ background: 'linear-gradient(135deg, var(--card-sheen), rgb(var(--rgb-surface) / 0.95))' }}>
      <h2 className="font-display text-lg font-extrabold text-fg">
        <SectionTitle help={help} isNew>
          {title}
        </SectionTitle>
      </h2>
      <div className="mt-3">
        <Segmented label={`${title}: periodo`} value={key} options={modes.map((m) => ({ value: m.key, label: m.label }))} onChange={setKey} />
      </div>
      {mode.subject && <div className="mt-3 text-sm font-semibold text-violet-300">{mode.subject}</div>}
      {ai.busy ? (
        <div className="mt-3">
          <AIBusy status={ai.status} onCancel={ai.cancel} persona={persona} />
        </div>
      ) : mode.saved ? (
        <>
          {!fresh && <p className="mt-2 text-xs text-warning">Analisi del {new Date(mode.saved.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: ci sono dati più recenti, aggiornala.</p>}
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-fg">{mode.saved.text}</p>
        </>
      ) : (
        <div className="mt-2 text-center">
          <AIPersona persona={persona} />
          <p className="text-sm text-fg-2">{mode.intro}</p>
        </div>
      )}
      {ai.error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {ai.error}
        </p>
      )}
      {!ai.busy && (
        <Button className="mt-3" fullWidth disabled={!mode.ref} icon={mode.saved ? <RefreshCw className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />} onClick={() => void go()}>
          {mode.saved && fresh ? 'Rifai l’analisi' : mode.action}
        </Button>
      )}
      {footer}
    </Card>
  );
}
