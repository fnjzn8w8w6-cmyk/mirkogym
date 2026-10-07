import { useEffect, useRef, useState } from 'react';
import { Flashlight, Keyboard } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/lib/haptics';

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** BarcodeDetector nativo (Android/Chrome) oppure lettore WebAssembly incluso nell'app (iPhone). */
async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector & { constructor: { getSupportedFormats?: () => Promise<string[]> } } })
    .BarcodeDetector;
  if (Native) {
    try {
      const supported = await (Native as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats();
      if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      /* uso il lettore incluso */
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
}

/** Cifra di controllo dei codici EAN-8, EAN-13, UPC-A (GTIN): scarta le letture storte. */
export function validGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const d = code.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E (8 cifre che iniziano con 0 o 1) → UPC-A, per controllarne la cifra. */
function upcEtoA(e: string): string | null {
  if (!/^[01]\d{7}$/.test(e)) return null;
  const [n, d1, d2, d3, d4, d5, d6, c] = e.split('');
  const mid =
    d6 === '0' || d6 === '1' || d6 === '2'
      ? `${d1}${d2}${d6}0000${d3}${d4}${d5}`
      : d6 === '3'
        ? `${d1}${d2}${d3}00000${d4}${d5}`
        : d6 === '4'
          ? `${d1}${d2}${d3}${d4}00000${d5}`
          : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${n}${mid}${c}`;
}
const isValidCode = (c: string) => validGtin(c) || (c.length === 8 && Boolean(upcEtoA(c) && validGtin(upcEtoA(c)!)));

export function BarcodeScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [torch, setTorch] = useState<{ on: boolean; set: (v: boolean) => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    // il codice è accettato solo se letto uguale due volte di fila e con la cifra di controllo giusta
    let last = '';
    let hits = 0;
    setError(null);
    setTorch(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        // messa a fuoco continua e torcia, dove il telefono le supporta
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
        if (caps.focusMode?.includes('continuous'))
          void track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
        if (caps.torch)
          setTorch({
            on: false,
            set: (v) => {
              void track.applyConstraints({ advanced: [{ torch: v } as MediaTrackConstraintSet] }).catch(() => undefined);
              setTorch((t) => (t ? { ...t, on: v } : t));
            },
          });
        const detector = await createDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const code = codes.map((c) => c.rawValue.trim()).find(isValidCode);
              if (code) {
                hits = code === last ? hits + 1 : 1;
                last = code;
              }
              if (code && hits >= 2 && !stopped) {
                stopped = true;
                haptics.setDone();
                onCode(code);
                return;
              }
            }
          } catch {
            /* fotogramma non leggibile */
          }
          timer = window.setTimeout(() => void tick(), 150);
        };
        void tick();
      } catch (e) {
        setShowManual(true);
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? "Accesso alla fotocamera negato: consentilo nelle impostazioni del browser oppure inserisci il codice a mano."
            : 'Fotocamera non disponibile: inserisci il codice a barre a mano.',
        );
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);

  return (
    <Modal open={open} onClose={onClose} title="Scansiona il codice a barre">
      <div className="space-y-3">
        {!error && (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-accent-500/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            {torch && (
              <button
                type="button"
                onClick={() => torch.set(!torch.on)}
                aria-pressed={torch.on}
                aria-label={torch.on ? 'Spegni la torcia' : 'Accendi la torcia'}
                className={`absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full ${torch.on ? 'bg-accent-500 text-onaccent' : 'bg-black/60 text-white'}`}
              >
                <Flashlight className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        )}
        {error ? (
          <p className="text-sm text-warning">{error}</p>
        ) : (
          <p className="text-center text-sm text-fg-2">Inquadra il codice a barre dentro il riquadro, a 10-15 cm: si legge da solo.</p>
        )}
        {showManual ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manual.replace(/\D/g, '');
              if (code.length >= 8) {
                if (!isValidCode(code)) setManualError('Il codice non è valido: controlla le cifre (sono quelle sotto le barre).');
                else onCode(code);
              }
            }}
          >
            <input
              inputMode="numeric"
              autoComplete="off"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                setManualError(null);
              }}
              placeholder="es. 8076809513753"
              aria-label="Codice a barre"
              className="h-12 flex-1 rounded-md border border-line bg-surface-2 px-3 text-base text-fg outline-none focus:border-accent-500"
            />
            <Button type="submit" disabled={manual.replace(/\D/g, '').length < 8}>
              Cerca
            </Button>
          </form>
        ) : null}
        {showManual && manualError && <p className="text-sm text-danger">{manualError}</p>}
        {!showManual && (
          <Button variant="ghost" fullWidth icon={<Keyboard className="h-5 w-5" />} onClick={() => setShowManual(true)}>
            Inserisci il codice a mano
          </Button>
        )}
        <p className="text-xs text-fg-3">Dati dei prodotti: Open Food Facts (database aperto, ODbL).</p>
      </div>
    </Modal>
  );
}
