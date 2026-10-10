import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MicButton, appendText } from '@/components/ui/MicButton';

/** Messaggio di una conversazione con il coach o il dietologo. */
export interface ThreadMsg<P> {
  role: 'user' | 'coach';
  text: string;
  /** proposta del coach (solo l'ultima si può applicare) */
  proposal?: P;
  applied?: boolean;
  at: number;
}

/** Conversazione salvata su questo dispositivo (così la ritrovi riaprendo l'app). */
export function useThread<P>(key: string) {
  const [msgs, setMsgs] = useState<ThreadMsg<P>[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ThreadMsg<P>[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      if (msgs.length) localStorage.setItem(key, JSON.stringify(msgs.slice(-20)));
      else localStorage.removeItem(key);
    } catch {
      /* spazio esaurito o navigazione privata: la conversazione resta solo in memoria */
    }
  }, [key, msgs]);
  return [msgs, setMsgs] as const;
}

/**
 * Testo della conversazione per l'AI: le risposte dell'utente correggono la proposta precedente.
 * `describe` riassume una proposta in una riga (cosa cambiava).
 */
export function threadContext<P>(msgs: ThreadMsg<P>[], next: string, describe: (p: P) => string): string {
  if (!msgs.length) return next;
  const lines = msgs.slice(-8).map((m) => (m.role === 'user' ? `Utente: ${m.text}` : `Tu (proposta${m.applied ? ' GIÀ APPLICATA' : ''}): ${m.text}${m.proposal ? ` — ${describe(m.proposal)}` : ''}`));
  return `CONVERSAZIONE FIN QUI (l'utente risponde alle tue proposte: tieni conto di cosa gli piace e cosa no, e correggi la proposta precedente invece di ripartire da zero):
${lines.join('\n')}
NUOVO MESSAGGIO DELL'UTENTE (è questo da soddisfare, insieme alle richieste precedenti ancora valide): ${next}`;
}

/** Conversazione: bolle utente/coach, la proposta più recente è attiva, le precedenti spente. */
export function CoachThread<P>({
  msgs,
  renderProposal,
  onSend,
  onReset,
  busy,
  busyView,
  placeholder,
}: {
  msgs: ThreadMsg<P>[];
  renderProposal: (p: P, active: boolean, msg: ThreadMsg<P>) => ReactNode;
  onSend: (text: string) => void;
  onReset: () => void;
  busy: boolean;
  busyView: ReactNode;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const lastProposal = [...msgs].reverse().find((m) => m.proposal);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length, busy]);
  const send = () => {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="space-y-3">
      {msgs.map((m, i) => {
        const active = m === lastProposal && !m.applied;
        return (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-base',
                m.role === 'user' ? 'rounded-br-md bg-accent-500/20 text-fg' : 'rounded-bl-md border border-line bg-surface-2 text-fg',
              )}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.proposal && (
                <div className={cn('mt-2', !active && !m.applied && 'opacity-55')}>
                  {!active && !m.applied && <div className="mb-1 text-xs font-bold uppercase tracking-wider text-fg-3">Proposta superata</div>}
                  {m.applied && <div className="mb-1 text-xs font-bold uppercase tracking-wider text-accent-400">✓ Applicata</div>}
                  {renderProposal(m.proposal, active, m)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {busy && busyView}
      <div ref={end} />
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="relative flex-1">
          <textarea
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="max-h-32 min-h-[48px] w-full resize-none rounded-3xl border border-line bg-surface-2 py-3 pl-4 pr-12 text-base text-fg outline-none placeholder:text-fg-disabled focus:border-accent-500"
          />
          <MicButton size="sm" className="absolute bottom-1.5 right-1.5" onText={(t) => setText((r) => appendText(r, t))} />
        </div>
        <button
          type="submit"
          disabled={busy || text.trim().length < 2}
          aria-label="Invia"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-500 text-onaccent disabled:opacity-40"
        >
          <Send className="h-5 w-5" aria-hidden />
        </button>
      </form>
      <button type="button" onClick={onReset} className="flex h-10 items-center gap-1.5 text-sm font-semibold text-fg-3">
        <RotateCcw className="h-4 w-4" aria-hidden /> Nuova conversazione
      </button>
    </div>
  );
}
