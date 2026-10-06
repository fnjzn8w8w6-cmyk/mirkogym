import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePhotos } from '@/hooks/use-photos';
import { cn } from '@/lib/cn';
import { SectionTitle } from '@/components/ui/Help';
import type { PhotoImages, ProgressPhoto } from '@/types';

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Galleria delle foto settimanali + confronto prima/dopo con cursore. */
export function ProgressPhotos() {
  const navigate = useNavigate();
  const { photos, images, remove } = usePhotos();
  const [pick, setPick] = useState<string[]>([]);
  const [compare, setCompare] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const toggle = (d: string) => setPick((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p.slice(-1), d]));
  const openCompare = () => {
    const sel = photos.filter((p) => pick.includes(p.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (sel.length === 2) setCompare([sel[0], sel[1]]);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title !mb-0">
          <SectionTitle help="body-photos">Foto dei progressi</SectionTitle>
        </h2>
        <span className="text-xs text-fg-3">{photos.length} foto</span>
      </div>
      {photos.length === 0 ? (
        <div className="mt-2 text-sm text-fg-2">
          <p>Ogni settimana, nel check-in, puoi aggiungere una foto: il coach stima la massa grassa e la confronta con quella precedente.</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => navigate('/food?tab=plan&checkin=1')}>
            📸 Fai il check-in con la foto
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-fg-3">Tocca due foto per confrontarle.</p>
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {photos.map((p) => (
              <button
                key={p.date}
                type="button"
                onClick={() => toggle(p.date)}
                aria-pressed={pick.includes(p.date)}
                className={cn('w-20 shrink-0 overflow-hidden rounded-md border-2 text-left', pick.includes(p.date) ? 'border-accent-500' : 'border-transparent')}
              >
                <img src={p.thumb} alt={`Foto del ${fmt(p.date)}`} className="aspect-[3/4] w-full object-cover" />
                <div className="bg-surface-2 px-1 py-0.5 text-[11px] leading-tight">
                  <div className="font-semibold text-fg">{fmt(p.date)}</div>
                  <div className="text-fg-3">
                    {p.bodyFat != null ? `${p.bodyFat}%` : '—'}
                    {p.weight ? ` · ${p.weight} kg` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {photos[0]?.comment && <p className="mt-2 text-sm text-fg-2">🧐 {photos[0].comment}</p>}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button size="sm" disabled={pick.length !== 2} onClick={openCompare}>
              Confronta prima / dopo
            </Button>
            <Button size="sm" variant="ghost" disabled={pick.length !== 1} icon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(pick[0])} aria-label="Elimina la foto selezionata" />
          </div>
        </>
      )}

      <CompareModal pair={compare} load={images} onClose={() => setCompare(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminare la foto?"
        message={toDelete ? `La foto del ${fmt(toDelete)} verrà eliminata definitivamente.` : ''}
        confirmLabel="Elimina"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await remove(toDelete);
          setPick([]);
          setToDelete(null);
        }}
      />
    </Card>
  );
}

function CompareModal({ pair, load, onClose }: { pair: [ProgressPhoto, ProgressPhoto] | null; load: (d: string) => Promise<PhotoImages | null>; onClose: () => void }) {
  const [imgs, setImgs] = useState<[string, string] | null>(null);
  const [pos, setPos] = useState(50);
  useEffect(() => {
    setImgs(null);
    setPos(50);
    if (!pair) return;
    let alive = true;
    void Promise.all([load(pair[0].date), load(pair[1].date)]).then(([a, b]) => alive && a && b && setImgs([a.front, b.front]));
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
