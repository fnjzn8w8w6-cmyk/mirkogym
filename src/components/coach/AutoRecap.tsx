import { useEffect, useRef } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/Help';
import type { HelpId } from '@/lib/help';
import type { SavedAnalysis } from '@/lib/analysis';
import type { AIOptions } from '@/lib/ai';
import { AIBusy, AIPersona, useAITask, type Persona } from './AIBusy';

// recap già avviati in questa apertura dell'app (niente doppie richieste se la pagina si ridisegna)
const started = new Set<string>();

/**
 * Recap del coach/dietologo su UNA sessione o UNA giornata: si fa da solo quando `auto` è vero
 * (sessione finita, giornata chiusa) e resta salvato lì. Se i dati cambiano si rifà.
 */
export function AutoRecap({
  title,
  help,
  persona,
  saved,
  refKey,
  auto,
  waiting,
  action,
  run,
  save,
}: {
  title: string;
  help: HelpId;
  persona: Persona;
  saved?: SavedAnalysis;
  /** cosa descrive l'analisi (cambia se cambiano i dati) */
  refKey: string | null;
  /** fallo da solo adesso */
  auto: boolean;
  /** testo mostrato finché non parte (es. "Quando chiudi la giornata…") */
  waiting: string;
  /** pulsante per farlo subito */
  action: string;
  run: (o: AIOptions) => Promise<string>;
  save: (a: SavedAnalysis) => Promise<void> | void;
}) {
  const ai = useAITask();
  const fresh = Boolean(saved && saved.ref === refKey);
  const runRef = useRef(run);
  runRef.current = run;
  const saveRef = useRef(save);
  saveRef.current = save;

  const go = async () => {
    if (!refKey) return;
    const key = refKey;
    const text = await ai.run((o) => runRef.current(o));
    if (text) await saveRef.current({ text, at: Date.now(), ref: key });
    else started.delete(key);
  };

  useEffect(() => {
    if (!auto || !refKey || fresh || started.has(refKey)) return;
    started.add(refKey);
    void go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, refKey, fresh]);

  return (
    <Card className="border-violet-500/40 p-4" style={{ background: 'linear-gradient(135deg, var(--card-sheen), rgb(var(--rgb-surface) / 0.95))' }}>
      <h2 className="font-display text-lg font-extrabold text-fg">
        <SectionTitle help={help} isNew>
          {title}
        </SectionTitle>
      </h2>
      {ai.busy ? (
        <div className="mt-3">
          <AIBusy status={ai.status} onCancel={ai.cancel} persona={persona} />
        </div>
      ) : saved ? (
        <>
          {!fresh && <p className="mt-2 text-xs text-warning">Ci sono dati nuovi dopo questo recap: aggiornalo.</p>}
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-fg">{saved.text}</p>
        </>
      ) : (
        <div className="mt-2 text-center">
          <AIPersona persona={persona} />
          <p className="text-sm text-fg-2">{waiting}</p>
        </div>
      )}
      {ai.error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {ai.error}
        </p>
      )}
      {!ai.busy && (!saved || !fresh || ai.error) && (
        <Button className="mt-3" fullWidth disabled={!refKey} icon={saved ? <RefreshCw className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />} onClick={() => void go()}>
          {saved ? 'Aggiorna il recap' : action}
        </Button>
      )}
      {!ai.busy && saved && fresh && !ai.error && (
        <button type="button" onClick={() => void go()} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-fg-3">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Rifai il recap
        </button>
      )}
    </Card>
  );
}
