import { useCallback, useEffect, useRef, useState } from 'react';
import { CANCELLED } from '@/lib/ai';
import { Button } from '../ui/Button';

/** Stato di un'operazione AI: avanzamento, secondi trascorsi, annullamento. */
export function useAITask() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const run = useCallback(async <T,>(fn: (o: { onProgress: (s: string) => void; isCancelled: () => boolean }) => Promise<T>): Promise<T | null> => {
    cancelRef.current = false;
    setBusy(true);
    setError(null);
    try {
      const r = await fn({ onProgress: setStatus, isCancelled: () => cancelRef.current });
      return cancelRef.current ? null : r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Operazione non riuscita';
      if (!cancelRef.current && msg !== CANCELLED) setError(msg);
      return null;
    } finally {
      setBusy(false);
      setStatus('');
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setBusy(false);
    setStatus('');
  }, []);

  return { busy, status, error, setError, run, cancel };
}

export function AIBusy({ status, onCancel }: { status: string; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-4 text-center" role="status" aria-live="polite">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-t-transparent" aria-hidden />
      <div className="mt-2 text-base font-semibold text-fg">{status || 'Elaborazione in corso…'}</div>
      <div className="text-sm text-fg-3">{elapsed}s</div>
      <Button className="mt-2" variant="ghost" size="sm" onClick={onCancel}>
        Annulla
      </Button>
    </div>
  );
}

export function AINote() {
  return (
    <p className="text-xs text-fg-3">
      Le richieste vengono elaborate da Google Gemini (piano gratuito: Google può usarle per migliorare i propri servizi). Indicazioni generali, non
      sostituiscono medico o nutrizionista.
    </p>
  );
}
