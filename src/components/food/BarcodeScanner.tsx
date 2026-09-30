import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
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

export function BarcodeScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const code = codes.find((c) => /^\d{8,14}$/.test(c.rawValue))?.rawValue;
              if (code && !stopped) {
                stopped = true;
                haptics.setDone();
                onCode(code);
                return;
              }
            }
          } catch {
            /* fotogramma non leggibile */
          }
          timer = window.setTimeout(() => void tick(), 220);
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
          </div>
        )}
        {error ? (
          <p className="text-sm text-warning">{error}</p>
        ) : (
          <p className="text-center text-sm text-fg-2">Inquadra il codice a barre della confezione: si legge da solo.</p>
        )}
        {showManual ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manual.replace(/\D/g, '');
              if (code.length >= 8) onCode(code);
            }}
          >
            <input
              inputMode="numeric"
              autoComplete="off"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="es. 8076809513753"
              aria-label="Codice a barre"
              className="h-12 flex-1 rounded-md border border-line bg-surface-2 px-3 text-base text-fg outline-none focus:border-accent-500"
            />
            <Button type="submit" disabled={manual.replace(/\D/g, '').length < 8}>
              Cerca
            </Button>
          </form>
        ) : (
          <Button variant="ghost" fullWidth icon={<Keyboard className="h-5 w-5" />} onClick={() => setShowManual(true)}>
            Inserisci il codice a mano
          </Button>
        )}
        <p className="text-xs text-fg-3">Dati dei prodotti: Open Food Facts (database aperto, ODbL).</p>
      </div>
    </Modal>
  );
}
