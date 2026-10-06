import { useCallback, useEffect, useRef, useState } from 'react';
import { CANCELLED } from '@/lib/ai';
import { Barbell, Camera, Carrot, ChartLineUp, ClipboardText, ForkKnife, Scan, type Icon as IconType } from '@phosphor-icons/react';
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

export type Persona = 'coach' | 'diet' | 'both' | 'photo' | 'scan';

const RING_ICONS: Record<'diet' | 'photo' | 'scan', IconType[]> = {
  diet: [ForkKnife, Carrot, ChartLineUp],
  photo: [Camera, Scan, ChartLineUp],
  scan: [ClipboardText, Scan, Barbell],
};
const HINTS: Record<Persona, string[]> = {
  coach: ['Carico i tuoi dati…', 'Conto serie e ripetizioni…', 'Calcolo il volume…'],
  diet: ['Leggo il tuo diario…', 'Bilancio calorie e macro…', 'Preparo la proposta…'],
  both: ['Leggo le tue sessioni…', 'Controllo il recupero…', 'Trovo i progressi…'],
  photo: ['Analizzo la foto…', 'Riconosco i dettagli…', 'Calcolo i valori…'],
  scan: ['Leggo il documento…', 'Riconosco gli esercizi…', 'Preparo la scheda…'],
};

/** Bilanciere: i dischi si caricano uno alla volta, poi si solleva (coach allenamento). */
function BarbellLoader() {
  const plates = [
    [52, 70, '#3DDC84'],
    [65, 56, '#2BB56B'],
    [76, 40, '#1B8A4E'],
  ] as const;
  return (
    <svg viewBox="0 0 200 120" className="mx-auto h-20 w-36" aria-hidden>
      <g className="vl-bar">
        <rect x="10" y="56" width="180" height="8" rx="4" fill="#CFD6D2" />
        <rect x="36" y="51" width="6" height="18" rx="2" fill="#7D8A83" />
        <rect x="158" y="51" width="6" height="18" rx="2" fill="#7D8A83" />
        {plates.map(([dx, h, c], i) =>
          [-1, 1].map((sgn) => (
            <rect
              key={`${i}${sgn}`}
              className="vl-plate"
              style={{ ['--fx' as string]: `${sgn * 60}px`, animationDelay: `${i * 0.25}s` }}
              x={100 + sgn * dx - (12 - i * 2) / 2}
              y={60 - h / 2}
              width={12 - i * 2}
              height={h}
              rx="3"
              fill={c}
            />
          )),
        )}
      </g>
      <ellipse cx="100" cy="112" rx="64" ry="4" fill="#3DDC84" opacity=".12" />
    </svg>
  );
}

/** Anello che si riempie con le icone che si alternano (dietologo, foto, documenti). */
function RingLoader({ icons }: { icons: IconType[] }) {
  return (
    <div className="relative mx-auto h-24 w-24" aria-hidden>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#1D2420" strokeWidth="9" />
        <circle className="vl-ring" cx="60" cy="60" r="52" fill="none" stroke="#3DDC84" strokeWidth="9" strokeLinecap="round" />
        <circle cx="60" cy="60" r="38" fill="#11261A" />
      </svg>
      {icons.map((I, i) => (
        <span key={i} className="vl-ic absolute inset-0 flex items-center justify-center" style={{ animationDelay: `${i * 1.2}s` }}>
          <I size={34} weight="fill" color="#F4F6F5" />
        </span>
      ))}
    </div>
  );
}

/** Battito che diventa la curva dei progressi (analisi). */
function PulseLoader() {
  return (
    <svg viewBox="0 0 200 110" className="mx-auto h-20 w-40" aria-hidden>
      <path d="M0 70 H200 M0 40 H200 M0 100 H200" stroke="#151A17" strokeWidth="1" />
      <path
        className="vl-ecg"
        d="M0 70 L50 70 L62 40 L74 100 L86 14 L98 92 L110 70 L130 70 L140 62 L160 50 L180 36 L200 20"
        fill="none"
        stroke="#3DDC84"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Frasi che si alternano durante l'attesa. */
function Hints({ lines }: { lines: string[] }) {
  return (
    <div className="relative mx-auto mt-1 h-5 w-full" aria-hidden>
      {lines.map((l, i) => (
        <span key={l} className="vl-hint absolute inset-x-0 text-center text-sm text-fg-2" style={{ animationDelay: `${i * 1.2}s` }}>
          {l}
        </span>
      ))}
    </div>
  );
}

/** Animazioni mostrate mentre l'AI lavora (al posto della rotellina). */
export function AIPersona({ persona = 'coach', className }: { persona?: Persona; className?: string }) {
  return (
    <div className={className}>
      {persona === 'coach' ? <BarbellLoader /> : persona === 'both' ? <PulseLoader /> : <RingLoader icons={RING_ICONS[persona]} />}
      <Hints lines={HINTS[persona]} />
    </div>
  );
}

export function AIBusy({ status, onCancel, persona = 'coach' }: { status: string; onCancel: () => void; persona?: Persona }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-4 text-center" role="status" aria-live="polite">
      <AIPersona persona={persona} />
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
