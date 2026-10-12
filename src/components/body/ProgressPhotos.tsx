import { useEffect, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Segmented, Toggle } from '@/components/ui/Input';
import { NewBadge } from '@/components/ui/Help';
import { photoId } from '@/hooks/use-photos';
import { composeBody, pairTarget, type BodyResult, type PhotoBackground } from '@/lib/body-align';
import { loadImage } from '@/lib/share-card';
import type { PhotoImages, ProgressPhoto } from '@/types';

const ALIGN_KEY = 'vl.compare.align';
const BG_KEY = 'vl.compare.bg';
const BGS: { value: PhotoBackground; label: string }[] = [
  { value: 'orig', label: 'Originale' },
  { value: 'dark', label: 'Scuro' },
  { value: 'light', label: 'Chiaro' },
];
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* navigazione privata */
  }
};

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/**
 * Confronto prima/dopo: le due foto sovrapposte, una linea al centro da trascinare
 * (a sinistra la foto «prima», a destra quella «dopo»).
 * Se la foto grande non arriva in pochi secondi si usa la miniatura, così non resta mai in caricamento.
 */
export function CompareModal({
  pair,
  load,
  body,
  onClose,
}: {
  pair: [ProgressPhoto, ProgressPhoto] | null;
  load: (d: string) => Promise<PhotoImages | null>;
  body: (p: ProgressPhoto) => Promise<BodyResult | null>;
  onClose: () => void;
}) {
  const [imgs, setImgs] = useState<[string, string] | null>(null);
  // allineamento e sfondo (predefiniti: allineate su sfondo scuro), ricordati sul telefono
  const [align, setAlign] = useState(() => read(ALIGN_KEY) !== '0');
  const [bg, setBg] = useState<PhotoBackground>(() => (BGS.some((b) => b.value === read(BG_KEY)) ? (read(BG_KEY) as PhotoBackground) : 'dark'));
  const [shown, setShown] = useState<[string, string] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed' | 'partial'>('idle');
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
  // corpo riconosciuto nelle due foto (salvato: dalla seconda volta è immediato), poi foto ricomposte
  const full = imgs && pair && !imgs.some((u, i) => u === pair[i].thumb) ? imgs : null;
  useEffect(() => {
    setShown(null);
    if (!pair || !full || (!align && bg === 'orig')) return setState('idle');
    let alive = true;
    setState('busy');
    void (async () => {
      try {
        const [ra, rb] = await Promise.all(pair.map((p) => body(p)));
        const [ia, ib] = await Promise.all(full.map((u) => loadImage(u)));
        const [ma, mb] = await Promise.all([ra?.mask, rb?.mask].map((m) => (m ? loadImage(m) : Promise.resolve(null))));
        if (!alive) return;
        if (!ia || !ib || !ra || !rb) return setState('failed');
        const W = 900;
        const H = 1200;
        const target = align ? pairTarget([{ img: ia, body: ra.body }, { img: ib, body: rb.body }], W, H) : null;
        const out = [composeBody(ia, { body: ra.body, mask: ma }, { w: W, h: H, bg, target }), composeBody(ib, { body: rb.body, mask: mb }, { w: W, h: H, bg, target })].map((c) =>
          c.toDataURL('image/jpeg', 0.9),
        ) as [string, string];
        setShown(out);
        setState((align && !target) || (bg !== 'orig' && (!ma || !mb)) ? 'partial' : 'idle');
      } catch {
        if (alive) setState('failed');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, full?.[0], full?.[1], align, bg, body]);
  if (!pair) return null;
  const [a, b] = pair;
  const view = shown ?? imgs;
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
            <img src={view![1]} alt={`Dopo, ${fmt(b.date)}`} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={view![0]}
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
          {state === 'busy' && (
            <p className="mt-1 text-center text-xs text-accent-400" aria-live="polite">
              Riconosco il corpo nelle foto… La prima volta il telefono scarica i modelli (circa 30 MB), poi è immediato.
            </p>
          )}
          {state === 'failed' && <p className="mt-1 text-center text-xs text-warning">Non sono riuscito a riconoscere il corpo (serve la connessione la prima volta): vedi le foto originali.</p>}
          {state === 'partial' && <p className="mt-1 text-center text-xs text-warning">In una delle foto non vedo bene il corpo (spalle e fianchi): l'ho lasciata com'è.</p>}
          <div className="mt-3 rounded-md bg-surface-2 px-3">
            <Toggle
              checked={align}
              onChange={(v) => {
                setAlign(v);
                write(ALIGN_KEY, v ? '1' : '0');
              }}
              label={
                <>
                  Allinea il corpo <NewBadge />
                </>
              }
              description="Stessa grandezza e posizione in tutte e due le foto"
            />
          </div>
          <div className="mt-2">
            <div className="mb-1 text-xs font-semibold uppercase text-fg-3">Sfondo</div>
            <Segmented<PhotoBackground>
              label="Sfondo delle foto"
              value={bg}
              options={BGS}
              onChange={(v) => {
                setBg(v);
                write(BG_KEY, v);
              }}
            />
          </div>
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
