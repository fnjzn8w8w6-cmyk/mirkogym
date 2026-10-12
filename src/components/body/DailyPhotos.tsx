import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight, Clapperboard, Share2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NewBadge, SectionTitle } from '@/components/ui/Help';
import { photoId, usePhotos } from '@/hooks/use-photos';
import { useCheckIns } from '@/hooks/use-checkins';
import { checkInPhoto } from '@/components/coach/CheckInHistory';
import { cn } from '@/lib/cn';
import type { ProgressPhoto } from '@/types';
import { ReelModal } from './ReelModal';
import { DailyPhotoModal } from './DailyPhotoModal';
import { CompareModal } from './ProgressPhotos';

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Foto giornaliere (indipendenti dal check-in): scatto, reel, elenco con data e foto a schermo intero. */
export function DailyPhotos() {
  const { photos: all, images, remove } = usePhotos();
  const { checkIns } = useCheckIns();
  // le foto dei check-in stanno nel loro elenco
  const photos = useMemo(() => {
    const taken = new Set(checkIns.map((c) => checkInPhoto(c, all)).filter(Boolean).map((p) => photoId(p!)));
    return all.filter((p) => !taken.has(photoId(p)) && p.kind !== 'checkin');
  }, [all, checkIns]);
  const [daily, setDaily] = useState<{ date?: string; photo?: string } | null>(null);
  const [reel, setReel] = useState(false);
  const [list, setList] = useState(false);
  const [view, setView] = useState<ProgressPhoto | null>(null);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title !mb-0">
          <SectionTitle help="body-photos">Foto giornaliere</SectionTitle>
        </h2>
        <span className="text-xs text-fg-3">{photos.length} foto</span>
      </div>
      <div className="mt-3 space-y-2">
        <Button fullWidth variant="secondary" className="whitespace-nowrap" icon={<Camera className="h-4 w-4" />} onClick={() => setDaily({})}>
          Foto del giorno <NewBadge className="ml-1" />
        </Button>
        <Button fullWidth variant="secondary" className="whitespace-nowrap" icon={<Clapperboard className="h-4 w-4" />} onClick={() => setReel(true)}>
          Crea il reel <NewBadge className="ml-1" />
        </Button>
      </div>
      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-fg-2">Scatta una foto al giorno, sempre nella stessa posa: qui trovi l'elenco con le date di scatto e con tutte le foto l'app crea il reel.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {photos.slice(0, 4).map((p) => (
              <button key={photoId(p)} type="button" onClick={() => setView(p)} className="overflow-hidden rounded-md bg-surface-2 text-left" aria-label={`Apri la foto del ${fmt(p.date)}`}>
                <img src={p.thumb} alt="" className="aspect-[3/4] w-full object-cover" />
                <span className="block truncate px-1 py-0.5 text-[11px] font-semibold text-fg">{fmt(p.date).replace(/ \d{4}$/, '')}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setList(true)} className="mt-3 flex w-full items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-fg">Apri la lista delle foto</span>
              <span className="block text-sm text-fg-3">
                {photos.length} foto · ultima il {fmt(photos[0].date)}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-fg-3" aria-hidden />
          </button>
        </>
      )}

      <PhotoList open={list} photos={photos} onClose={() => setList(false)} onOpen={setView} loadImages={images} />
      <PhotoViewer
        photo={view}
        onClose={() => setView(null)}
        loadImages={images}
        onShare={(date, src) => {
          setView(null);
          setDaily({ date, photo: src });
        }}
        onDelete={async (date) => {
          await remove(date);
          setView(null);
        }}
      />
      <ReelModal open={reel} onClose={() => setReel(false)} />
      <DailyPhotoModal open={daily != null} onClose={() => setDaily(null)} date={daily?.date} photo={daily?.photo} />
    </Card>
  );
}

type Load = (d: string) => Promise<{ front: string; side?: string } | null>;

/** Elenco di tutte le foto con data di scatto; «Confronta» per scegliere due foto. */
function PhotoList({ open, photos, onClose, onOpen, loadImages }: { open: boolean; photos: ProgressPhoto[]; onClose: () => void; onOpen: (p: ProgressPhoto) => void; loadImages: Load }) {
  const [comparing, setComparing] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [pair, setPair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);
  useEffect(() => {
    if (!open) {
      setComparing(false);
      setPick([]);
    }
  }, [open]);
  const tap = (p: ProgressPhoto) => {
    if (!comparing) return onOpen(p);
    const id = photoId(p);
    setPick((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));
  };
  return (
    <>
      <Modal open={open && !pair} onClose={onClose} title="Foto giornaliere">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-fg-3">{comparing ? 'Scegli due foto da confrontare.' : 'Tocca una foto per vederla.'}</p>
            <Button size="sm" variant="secondary" onClick={() => (setComparing((c) => !c), setPick([]))}>
              {comparing ? 'Annulla' : 'Confronta'}
            </Button>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <li key={photoId(p)}>
                <button
                  type="button"
                  onClick={() => tap(p)}
                  aria-pressed={comparing ? pick.includes(photoId(p)) : undefined}
                  className={cn('w-full overflow-hidden rounded-md border-2 bg-surface-2 text-left', comparing && pick.includes(photoId(p)) ? 'border-accent-500' : 'border-transparent')}
                >
                  <img src={p.thumb} alt={`Foto del ${fmt(p.date)}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="block px-1.5 py-1 text-xs leading-tight">
                    <span className="block font-semibold text-fg">{fmt(p.date)}</span>
                    <span className="block text-fg-3">
                      {p.weight ? `${String(p.weight).replace('.', ',')} kg` : '—'}
                      {p.bodyFat != null ? ` · ${String(p.bodyFat).replace('.', ',')}%` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {comparing && (
            <Button
              fullWidth
              disabled={pick.length !== 2}
              onClick={() => {
                const sel = photos.filter((p) => pick.includes(photoId(p))).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
                if (sel.length === 2) setPair([sel[0], sel[1]]);
              }}
            >
              Confronta prima / dopo
            </Button>
          )}
        </div>
      </Modal>
      <CompareModal pair={pair} load={loadImages} onClose={() => setPair(null)} />
    </>
  );
}

/** Una foto a schermo intero con data e dati del giorno. */
function PhotoViewer({
  photo,
  onClose,
  loadImages,
  onShare,
  onDelete,
}: {
  photo: ProgressPhoto | null;
  onClose: () => void;
  loadImages: Load;
  onShare: (date: string, src: string) => void;
  onDelete: (date: string) => Promise<void>;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setFull(null);
    if (!photo) return;
    let alive = true;
    void loadImages(photoId(photo)).then((i) => alive && i && setFull(i.front));
    return () => {
      alive = false;
    };
  }, [photo, loadImages]);
  if (!photo) return null;
  return (
    <>
      <Modal open onClose={onClose} title={fmtLong(photo.date).replace(/^./, (c) => c.toUpperCase())}>
        <div className="space-y-3">
          <img src={full ?? photo.thumb} alt={`Foto del ${fmt(photo.date)}`} className="mx-auto aspect-[3/4] max-h-[60vh] w-full max-w-sm rounded-lg bg-surface-2 object-cover" />
          <div className="flex flex-wrap gap-1.5 text-sm">
            {photo.weight != null && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2">Peso <strong className="text-fg">{String(photo.weight).replace('.', ',')} kg</strong></span>}
            {photo.bodyFat != null && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2">Massa grassa <strong className="text-fg">{String(photo.bodyFat).replace('.', ',')}%</strong></span>}
          </div>
          {photo.comment && <p className="text-sm text-fg-2">🧐 {photo.comment}</p>}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button icon={<Share2 className="h-4 w-4" />} disabled={!full} onClick={() => full && onShare(photo.date, full)}>
              Condividi
            </Button>
            <Button variant="secondary" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)} aria-label="Elimina la foto" />
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Eliminare la foto?"
        message={`La foto del ${fmt(photo.date)} verrà eliminata definitivamente.`}
        confirmLabel="Elimina"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await onDelete(photoId(photo));
        }}
      />
    </>
  );
}
