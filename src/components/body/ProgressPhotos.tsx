import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { photoId } from '@/hooks/use-photos';
import type { PhotoImages, ProgressPhoto } from '@/types';

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Confronto prima/dopo di due foto con il cursore. */
export function CompareModal({ pair, load, onClose }: { pair: [ProgressPhoto, ProgressPhoto] | null; load: (d: string) => Promise<PhotoImages | null>; onClose: () => void }) {
  const [imgs, setImgs] = useState<[string, string] | null>(null);
  const [pos, setPos] = useState(50);
  useEffect(() => {
    setImgs(null);
    setPos(50);
    if (!pair) return;
    let alive = true;
    void Promise.all([load(photoId(pair[0])), load(photoId(pair[1]))]).then(([a, b]) => alive && a && b && setImgs([a.front, b.front]));
    return () => {
      alive = false;
    };
  }, [pair, load]);
  if (!pair) return null;
  const [a, b] = pair;
  const d = (x?: number, y?: number) => (x != null && y != null ? `${y - x >= 0 ? '+' : ''}${(y - x).toFixed(1).replace('.', ',')}` : '—');
  return (
    <Modal open onClose={onClose} title="Prima / dopo">
      {!imgs ? (
        <p className="py-10 text-center text-sm text-fg-3">Carico le foto…</p>
      ) : (
        <>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg bg-surface-2">
            <img src={imgs[1]} alt={`Dopo, ${fmt(b.date)}`} className="absolute inset-0 h-full w-full object-cover" />
            <img src={imgs[0]} alt={`Prima, ${fmt(a.date)}`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-500 shadow-glow" style={{ left: `${pos}%` }} />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 text-xs text-white">{fmt(a.date)}</span>
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 text-xs text-white">{fmt(b.date)}</span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Cursore prima/dopo" className="mt-3 w-full accent-[#3DDC84]" />
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
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
