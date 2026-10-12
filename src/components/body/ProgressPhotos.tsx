import { useEffect, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { photoId } from '@/hooks/use-photos';
import type { PhotoImages, ProgressPhoto } from '@/types';

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/**
 * Confronto prima/dopo: le due foto sovrapposte, una linea al centro da trascinare
 * (a sinistra la foto «prima», a destra quella «dopo»).
 * Se la foto grande non arriva in pochi secondi si usa la miniatura, così non resta mai in caricamento.
 */
export function CompareModal({ pair, load, onClose }: { pair: [ProgressPhoto, ProgressPhoto] | null; load: (d: string) => Promise<PhotoImages | null>; onClose: () => void }) {
  const [imgs, setImgs] = useState<[string, string] | null>(null);
  const [lowRes, setLowRes] = useState(false);
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    setPos(50);
    setLowRes(false);
    if (!pair) return setImgs(null);
    // subito le miniature, poi ogni foto diventa nitida appena arriva
    setImgs([pair[0].thumb, pair[1].thumb]);
    let alive = true;
    let pending = 2;
    let failed = false;
    pair.forEach((p, i) =>
      void load(photoId(p))
        .catch(() => null)
        .then((r) => {
          pending--;
          if (!alive) return;
          if (r) setImgs((cur) => (cur ? (i === 0 ? [r.front, cur[1]] : [cur[0], r.front]) : cur));
          else failed = true;
          // l'avviso resta solo se una foto non è arrivata
          if (pending === 0) setLowRes(failed);
        }),
    );
    // avviso solo se dopo un bel po' non è ancora arrivato niente
    const t = window.setTimeout(() => alive && pending > 0 && setLowRes(true), 20000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [pair, load]);
  if (!pair) return null;
  const [a, b] = pair;
  const d = (x?: number, y?: number) => (x != null && y != null ? `${y - x >= 0 ? '+' : ''}${(y - x).toFixed(1).replace('.', ',')}` : '—');
  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <Modal open onClose={onClose} title="Prima / dopo">
      {!imgs ? (
        <p className="py-10 text-center text-sm text-fg-3">Carico le foto…</p>
      ) : (
        <>
          <div
            ref={box}
            className="relative mx-auto aspect-[3/4] w-full max-w-sm cursor-ew-resize select-none overflow-hidden rounded-lg bg-surface-2"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              moveTo(e.clientX);
            }}
            onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <img src={imgs[1]} alt={`Dopo, ${fmt(b.date)}`} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={imgs[0]}
              alt={`Prima, ${fmt(a.date)}`}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            />
            {/* linea con maniglia da trascinare */}
            <div className="pointer-events-none absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)]" style={{ left: `${pos}%` }}>
              <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/60 text-white">
                <ChevronsLeftRight className="h-5 w-5" aria-hidden />
              </span>
            </div>
            <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">PRIMA · {fmt(a.date)}</span>
            <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">DOPO · {fmt(b.date)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pos)}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Linea del confronto prima/dopo"
            className="sr-only"
          />
          <p className="mt-2 text-center text-xs text-fg-3">Trascina la linea a destra e a sinistra sulla foto.</p>
          {lowRes && <p className="mt-1 text-center text-xs text-warning">Le foto in alta qualità stanno arrivando lentamente (connessione?): intanto vedi le anteprime.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-surface-2 py-2">
              <div className="font-display text-lg font-extrabold text-fg">{d(a.weight, b.weight)} kg</div>
              <div className="text-xs uppercase text-fg-3">Peso</div>
            </div>
            <div className="rounded-md bg-surface-2 py-2">
              <div className="font-display text-lg font-extrabold text-fg">{d(a.bodyFat, b.bodyFat)}%</div>
              <div className="text-xs uppercase text-fg-3">Massa grassa</div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
