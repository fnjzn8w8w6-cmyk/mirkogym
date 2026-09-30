import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Lock, Sparkles, X } from 'lucide-react';
import { estimateBodyFatFromPhotos, prepareImage, type BodyFatAIResult } from '@/lib/ai-bodyfat';
import type { Sex } from '@/lib/metabolism';
import { bfCategory } from '@/lib/metabolism';
import { formatKg } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  subject: { sex: Sex; age: number; heightCm: number; weightKg: number } | null;
  /** Salva il valore (es. nel diario "Corpo"). */
  onUse: (bodyFat: number, result: BodyFatAIResult) => void | Promise<void>;
}

type Photo = { base64: string; preview: string };

/** Stima della massa grassa da foto tramite AI (Gemini via Firebase AI Logic). */
export function BodyFatPhotoModal({ open, onClose, subject, onUse }: Props) {
  const [front, setFront] = useState<Photo | null>(null);
  const [side, setSide] = useState<Photo | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BodyFatAIResult | null>(null);
  const [status, setStatus] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    setFront(null);
    setSide(null);
    setResult(null);
    setError(null);
    setBusy(false);
  }, [open]);

  const analyze = async () => {
    if (!front || !subject) return;
    setBusy(true);
    setError(null);
    cancelRef.current = false;
    try {
      const images = [{ base64: front.base64, view: 'fronte' as const }, ...(side ? [{ base64: side.base64, view: 'profilo' as const }] : [])];
      const r = await estimateBodyFatFromPhotos(images, subject, setStatus, () => cancelRef.current);
      if (!cancelRef.current) setResult(r);
    } catch (e) {
      if (!cancelRef.current) setError(e instanceof Error ? e.message : 'Analisi non riuscita');
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Massa grassa da foto">
      {!subject ? (
        <p className="text-base text-fg-2">Completa prima il profilo (sesso, età, altezza, peso) per tarare la stima.</p>
      ) : result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-5 text-center">
            <div className="text-xs uppercase tracking-wide text-accent-400">Massa grassa stimata</div>
            <div className="mt-1 text-4xl text-fg">{formatKg(result.bodyFat)}%</div>
            <div className="mt-1 text-sm text-fg-2">
              Forbice {result.low}–{result.high}% · affidabilità {result.confidence} · {bfCategory(result.bodyFat, subject.sex)}
            </div>
            <div className="mt-1 text-sm text-fg-3">Massa magra ~{formatKg(subject.weightKg * (1 - result.bodyFat / 100))} kg</div>
          </div>
          {result.notes && <p className="text-base text-fg-2">{result.notes}</p>}
          <p className="text-xs text-fg-3">
            Le stime da foto hanno un errore tipico di 2–4 punti: sono utili soprattutto per seguire l'andamento, rifacendole con la stessa luce e
            posa.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setResult(null)}>
              Riprova
            </Button>
            <Button icon={<Check className="h-5 w-5" />} onClick={() => void onUse(result.bodyFat, result)}>
              Usa questo valore
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-1.5 text-sm text-fg-2">
            <li>📸 Busto scoperto o abbigliamento aderente, braccia rilassate lungo i fianchi</li>
            <li>💡 Luce frontale uniforme, sfondo semplice, corpo intero o almeno dal collo alle ginocchia</li>
            <li>🧍 Posa naturale, senza contrarre: la foto di profilo migliora la stima</li>
          </ul>

          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot label="Fronte" required photo={front} onPick={setFront} onError={setError} />
            <PhotoSlot label="Profilo (opzionale)" photo={side} onPick={setSide} onError={setError} />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-2 p-3 text-sm text-fg-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#39FF88]" />
            <span>
              <Lock className="mr-1 inline h-3.5 w-3.5 text-fg-3" aria-hidden />
              Acconsento all'invio delle foto a Google Gemini solo per questa analisi. HowToGym non le salva; con il piano gratuito Google può usare i
              contenuti per migliorare i propri servizi.
            </span>
          </label>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {busy ? (
            <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-4 text-center" role="status" aria-live="polite">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-t-transparent" aria-hidden />
              <div className="mt-2 text-base font-semibold text-fg">{status || 'Analisi in corso…'}</div>
              <div className="text-sm text-fg-3">{elapsed}s · di solito 5–20 secondi</div>
              <Button
                className="mt-3"
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancelRef.current = true;
                  setBusy(false);
                  setStatus('');
                }}
              >
                Annulla
              </Button>
            </div>
          ) : (
            <Button size="lg" fullWidth disabled={!front || !consent} icon={<Sparkles className="h-5 w-5" />} onClick={analyze}>
              Analizza
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

function PhotoSlot({
  label,
  photo,
  onPick,
  onError,
  required,
}: {
  label: string;
  photo: Photo | null;
  onPick: (p: Photo | null) => void;
  onError: (m: string) => void;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-3">
        {label}
        {required && ' *'}
      </div>
      <div className={cn('relative aspect-[3/4] overflow-hidden rounded-lg border border-dashed', photo ? 'border-line' : 'border-line-strong')}>
        {photo ? (
          <>
            <img src={photo.preview} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={`Rimuovi foto ${label}`}
              onClick={() => onPick(null)}
              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-fg-3 hover:text-fg"
          >
            {required ? <Camera className="h-8 w-8" aria-hidden /> : <ImagePlus className="h-8 w-8" aria-hidden />}
            <span className="text-sm font-semibold">Scatta o scegli</span>
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={`Foto ${label}`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            onPick(await prepareImage(f));
          } catch {
            onError('Impossibile leggere la foto');
          }
        }}
      />
    </div>
  );
}
