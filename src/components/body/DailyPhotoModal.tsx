import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Share2, Timer } from 'lucide-react';
import { TimerCamera } from './TimerCamera';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MuscleFigure, GROUP_MUSCLES } from '@/components/library/MuscleFigure';
import { usePhotos } from '@/hooks/use-photos';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { compressPhoto, thumbOf } from '@/lib/progress-photos';
import { renderDailyCard, svgToDataUrl } from '@/lib/daily-card';
import { shareImage } from '@/lib/share-card';
import { workingSets } from '@/lib/analytics';
import { daysBetween, fromISODate, toISODate, todayISO } from '@/lib/date-utils';

/**
 * Foto del giorno: scatti una foto, l'app ci mette sopra il giorno del percorso, l'allenamento e i muscoli allenati.
 * La foto resta nella galleria dei progressi; l'immagine composta si condivide (storie, chat…).
 * `date` + `photo`: riapre una foto già salvata per condividerla di nuovo.
 */
export function DailyPhotoModal({ open, onClose, date, photo: saved }: { open: boolean; onClose: () => void; date?: string; photo?: string | null }) {
  const toast = useToast();
  const { photos, save, images } = usePhotos();
  const { sessions, groupOf } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const day = date ?? todayISO();
  const [photo, setPhoto] = useState<string | null>(null);
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState(false);
  const [camera, setCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto(saved ?? null);
    setStored(Boolean(saved));
    setCard(null);
  }, [open, saved]);

  // dati del giorno: allenamento (l'ultimo di quel giorno), peso, giorno del percorso
  const info = useMemo(() => {
    const session = sessions.find((s) => toISODate(s.date) === day) ?? null;
    const sets = new Map<string, number>();
    for (const l of session?.logs ?? []) sets.set(groupOf(l), (sets.get(groupOf(l)) ?? 0) + workingSets(l.sets).length);
    const top = Math.max(1, ...sets.values());
    const intensity: Record<string, number> = {};
    for (const [g, n] of sets) for (const m of GROUP_MUSCLES[g] ?? []) intensity[m] = Math.max(intensity[m] ?? 0, 0.45 + (0.55 * n) / top);
    const weight = [...bodyLogs].filter((b) => b.weight && b.date <= day).sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? null;
    const first = [day, ...photos.map((p) => p.date)].sort()[0];
    return { session, intensity, weight, number: daysBetween(fromISODate(day), fromISODate(first)) + 1 };
  }, [sessions, groupOf, bodyLogs, photos, day]);

  // ricompone l'immagine quando c'è la foto
  useEffect(() => {
    if (!open || !photo) return;
    let alive = true;
    let url = '';
    const svg = mapRef.current?.querySelector('svg');
    const muscles = svg
      ? svgToDataUrl(svg, { '--accent-500': '#3DDC84', '--bg-surface-3': 'rgba(232,236,234,0.88)', '--bg-surface-2': 'rgba(190,196,193,0.7)', '--bg-base': 'rgba(18,20,19,0.9)' })
      : null;
    void renderDailyCard({ photo, day: info.number, session: info.session, muscles, weight: info.weight })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch(() => alive && toast.error("Non riesco a comporre l'immagine"));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photo, info, day]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPhoto(await compressPhoto(f, 1000, 0.78));
      setStored(false);
    } catch {
      toast.error('Foto non leggibile: prova con un’altra');
    }
  };

  /** Salva nella galleria (una foto al giorno: i dati già presenti, es. la massa grassa, restano). */
  const store = async () => {
    if (!photo || stored) return;
    const prev = photos.find((p) => p.date === day);
    const prevImgs = prev?.hasSide ? await images(day) : null;
    await save(
      {
        ...(prev ?? {}),
        date: day,
        thumb: await thumbOf(photo),
        ...(info.weight != null ? { weight: info.weight } : {}),
        daily: true,
        createdAt: prev?.createdAt ?? Date.now(),
      },
      { front: photo, ...(prevImgs?.side ? { side: prevImgs.side } : {}) },
    );
    setStored(true);
  };

  const run = async (share: boolean) => {
    if (!card) return;
    setBusy(true);
    try {
      await store();
      if (share) {
        const how = await shareImage(card.blob, `vulcanlift-giorno-${info.number}.jpg`);
        toast.success(how === 'downloaded' ? 'Foto salvata e scaricata' : 'Foto salvata nella galleria');
      } else toast.success('Foto salvata nella galleria dei progressi');
      onClose();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Non sono riuscito a salvare o condividere');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Foto del giorno">
      <div className="space-y-3">
        {/* mappa muscolare usata per comporre l'immagine (non visibile) */}
        <div ref={mapRef} className="pointer-events-none fixed -left-[9999px] top-0 w-[436px]" aria-hidden>
          <MuscleFigure intensity={info.intensity} />
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="daily-file" onChange={(e) => void pick(e.target.files?.[0])} />
        {!photo ? (
          <>
            <p className="text-sm text-fg-2">
              Una foto al giorno, sempre nella stessa posa e con la stessa luce: l'app aggiunge il giorno del percorso, durata, esercizi, serie, peso e i muscoli allenati. Resta
              nella galleria dei progressi e puoi condividerla.
            </p>
            <button
              type="button"
              onClick={() => setCamera(true)}
              className="flex h-[38vh] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-accent-500/50 bg-accent-glow"
            >
              <Timer className="h-10 w-10 text-accent-400" aria-hidden />
              <span className="text-lg font-semibold text-fg">Scatta con l’autoscatto</span>
              <span className="text-sm text-fg-2">Appoggia il telefono e mettiti in posa</span>
            </button>
            <Button variant="secondary" fullWidth icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Scegli dalla galleria
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto aspect-[9/16] max-h-[60vh] overflow-hidden rounded-lg bg-surface-2">
              {card ? <img src={card.url} alt={`Foto del giorno ${info.number}`} className="h-full w-full object-cover" /> : <p className="py-24 text-center text-sm text-fg-3">Preparo l'immagine…</p>}
            </div>
            <div className="grid grid-cols-[auto_auto_1fr] gap-2">
              <Button variant="secondary" icon={<Camera className="h-4 w-4" />} onClick={() => setCamera(true)} aria-label="Rifai la foto" />
              <Button variant="secondary" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()} aria-label="Scegli dalla galleria" />
              <Button loading={busy} disabled={!card} icon={<Share2 className="h-4 w-4" />} onClick={() => void run(true)}>
                {stored ? 'Condividi' : 'Salva e condividi'}
              </Button>
            </div>
            {!stored && (
              <Button variant="ghost" fullWidth disabled={!card || busy} onClick={() => void run(false)}>
                Salva soltanto
              </Button>
            )}
          </>
        )}
      </div>
      <TimerCamera
        open={camera}
        onClose={() => setCamera(false)}
        onShot={(url) => {
          setCamera(false);
          setPhoto(url);
          setStored(false);
        }}
      />
    </Modal>
  );
}
