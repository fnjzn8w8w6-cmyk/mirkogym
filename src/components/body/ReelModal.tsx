import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, RotateCcw, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { photoId, usePhotos } from '@/hooks/use-photos';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { pickFrames, renderReel, reelSeconds, type ReelPhoto, type ReelSummary } from '@/lib/reel';
import { composeBody, groupTarget, type BodyTarget, type PhotoBackground } from '@/lib/body-align';
import { loadImage } from '@/lib/share-card';
import { Toggle } from '@/components/ui/Input';
import { NewBadge } from '@/components/ui/Help';
import { shareFile } from '@/lib/share-card';
import { sessionSetCount, sessionTonnage } from '@/lib/analytics';
import { daysBetween, fromISODate, toISODate, todayISO } from '@/lib/date-utils';
import type { BodyLog, BodyPoints } from '@/types';
import { MuscleFigure } from '@/components/library/MuscleFigure';
import { dayIntensity, muscleMapFor } from '@/lib/daily-card';

type Period = 'tutto' | '365' | '90' | '30';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'tutto', label: 'Tutto' },
  { value: '365', label: '1 anno' },
  { value: '90', label: '90 g' },
  { value: '30', label: '30 g' },
];

const ALIGN_KEY = 'vl.reel.align';
const BG_KEY = 'vl.reel.bg';
/** vecchio interruttore unico (sfondo scuro + allineamento): spento = sfondo originale */
const OLD_KEY = 'vl.reel.neutral';
type ReelBg = Extract<PhotoBackground, 'orig' | 'dark' | 'blur'>;
const BGS: { value: ReelBg; label: string }[] = [
  { value: 'orig', label: 'Originale' },
  { value: 'dark', label: 'Scuro' },
  { value: 'blur', label: 'Sfocato' },
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
// dove sta il corpo: a destra della colonna dei dati nel timelapse, al centro nei riquadri 3:4
const FRAME: BodyTarget = { torso: 1920 * 0.2, x: 1080 * 0.6, y: 1920 * 0.52 };
const PANEL: BodyTarget = { torso: 1000 * 0.25, x: 375, y: 1000 * 0.38 };

/** Valore del diario "Corpo" più vicino a una data (entro `maxDays` giorni). */
function nearest(logs: BodyLog[], date: string, field: 'weight' | 'bodyFat', maxDays: number): number | null {
  let best: { v: number; d: number } | null = null;
  for (const l of logs) {
    const v = l[field];
    if (v == null) continue;
    const d = Math.abs(daysBetween(fromISODate(l.date), fromISODate(date)));
    if (d <= maxDays && (!best || d < best.d)) best = { v, d };
  }
  return best?.v ?? null;
}

/** Reel dei progressi: un video con tutte le foto, il confronto primo/ultimo giorno e i numeri del percorso. */
export function ReelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { photos, images, body } = usePhotos();
  const { sessions, groupOf } = useSessions();
  const mapRef = useRef<HTMLDivElement>(null);
  const { bodyLogs } = useBodyLogs();
  const [period, setPeriod] = useState<Period>('tutto');
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<'body' | 'video'>('video');
  // corpo allineato e sfondo, scelti separatamente (predefiniti: allineato su sfondo scuro)
  const [align, setAlign] = useState(() => read(ALIGN_KEY) !== '0');
  const [bg, setBg] = useState<ReelBg>(() => {
    const v = read(BG_KEY);
    if (BGS.some((b) => b.value === v)) return v as ReelBg;
    return read(OLD_KEY) === '0' ? 'orig' : 'dark';
  });
  const [video, setVideo] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const cancel = useRef(false);

  useEffect(() => {
    if (open) return;
    cancel.current = true;
    setProgress(null);
    setVideo((v) => {
      if (v) URL.revokeObjectURL(v.url);
      return null;
    });
  }, [open]);

  const data = useMemo(() => {
    // foto giornaliere (non quelle del check-in), in ordine di scatto
    const all = photos.filter((p) => p.kind !== 'checkin').sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const firstEver = all[0]?.date;
    const from = period === 'tutto' ? '' : toISODate(Date.now() - (Number(period) - 1) * 86400000);
    const sel = all.filter((p) => p.date >= from && p.date <= todayISO());
    if (!firstEver || sel.length < 2) return { list: [] as Omit<ReelPhoto, 'muscles'>[], summary: null as ReelSummary | null };
    const list: Omit<ReelPhoto, 'muscles'>[] = sel.map((p) => ({
      id: photoId(p),
      date: p.date,
      day: daysBetween(fromISODate(p.date), fromISODate(firstEver)) + 1,
      weight: p.weight ?? nearest(bodyLogs, p.date, 'weight', 3),
      session: sessions.find((s) => toISODate(s.date) === p.date) ?? null,
    }));
    const a = sel[0].date;
    const b = sel[sel.length - 1].date;
    const inRange = sessions.filter((s) => toISODate(s.date) >= a && toISODate(s.date) <= b);
    const summary: ReelSummary = {
      days: daysBetween(fromISODate(b), fromISODate(a)) + 1,
      workouts: inRange.length,
      sets: inRange.reduce((x, s) => x + sessionSetCount(s), 0),
      tonnage: inRange.reduce((x, s) => x + sessionTonnage(s), 0),
      weightFirst: list[0].weight,
      weightLast: list[list.length - 1].weight,
      bfFirst: sel[0].bodyFat ?? nearest(bodyLogs, a, 'bodyFat', 10),
      bfLast: sel[sel.length - 1].bodyFat ?? nearest(bodyLogs, b, 'bodyFat', 10),
    };
    return { list, summary };
  }, [photos, sessions, bodyLogs, period]);

  const create = async () => {
    if (!data.summary) return;
    cancel.current = false;
    setProgress(0);
    try {
      // manichino di ogni giorno con i muscoli allenati
      const svg = mapRef.current?.querySelector('svg');
      const list: ReelPhoto[] = data.list.map((p) => ({ ...p, muscles: svg && p.session ? muscleMapFor(svg, dayIntensity(p.session, groupOf)) : null }));
      // allineamento o sfondo: prima si riconosce il corpo nelle foto del video (salvato: la volta dopo è immediato)
      const byId = new Map(photos.map((p) => [photoId(p), p]));
      const edit = align || bg !== 'orig';
      const used = edit ? pickFrames(list) : [];
      const found: { img: { width: number; height: number }; body: BodyPoints | null }[] = [];
      if (edit) {
        setPhase('body');
        for (let i = 0; i < used.length; i++) {
          if (cancel.current) throw new Error('Annullato');
          const p = byId.get(used[i].id);
          const info = p ? await body(p).catch(() => null) : null;
          // grandezza della foto: serve a calcolare quanto ingrandire con lo sfondo originale
          const src = info?.body && bg === 'orig' ? (await images(used[i].id))?.front : null;
          const img = src ? await loadImage(src) : null;
          if (img && info) found.push({ img: { width: img.width, height: img.height }, body: info.body });
          setProgress((i + 1) / used.length);
        }
        setPhase('video');
        setProgress(0);
      }
      const origFrame = groupTarget(found, 1080, 1920);
      const origPanel = groupTarget(found, 750, 1000);
      const load = async (id: string, use: 'frame' | 'panel') => {
        const src = (await images(id))?.front ?? null;
        const p = byId.get(id);
        if (!src || !edit || !p) return src;
        const info = await body(p).catch(() => null);
        if (!info) return src;
        const [img, mask] = await Promise.all([loadImage(src), info.mask ? loadImage(info.mask) : Promise.resolve(null)]);
        if (!img) return src;
        const [w, h, fixed] = use === 'frame' ? [1080, 1920, FRAME] : [750, 1000, PANEL];
        // sfondo originale: si ingrandisce il meno possibile; scuro/sfocato: corpo sempre nello stesso punto
        const target = bg === 'orig' ? (use === 'frame' ? origFrame : origPanel) : fixed;
        return composeBody(img, { body: info.body, mask }, { w, h, bg, target: align ? target : null }).toDataURL('image/jpeg', 0.9);
      };
      const res = await renderReel(
        list,
        data.summary,
        load,
        (p) => setProgress(p.value),
        () => cancel.current,
      );
      setVideo({ blob: res.blob, url: URL.createObjectURL(res.blob), ext: res.ext });
    } catch (e) {
      if (!cancel.current) toast.error(e instanceof Error && e.message !== 'Annullato' ? 'Non sono riuscito a creare il video su questo telefono' : 'Creazione annullata');
    } finally {
      setProgress(null);
      setPhase('video');
    }
  };

  const share = async () => {
    if (!video) return;
    setSharing(true);
    try {
      const how = await shareFile(video.blob, `vulcanlift-reel-${todayISO()}.${video.ext}`, 'Il mio percorso');
      if (how === 'downloaded') toast.success('Video salvato');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Condivisione non riuscita');
    } finally {
      setSharing(false);
    }
  };

  const n = data.list.length;
  return (
    <Modal open={open} onClose={onClose} title="Reel dei progressi" dismissible={progress == null}>
      <div className="space-y-3">
        {/* figura vuota da cui si colorano i manichini di ogni giorno (non visibile) */}
        <div ref={mapRef} className="pointer-events-none fixed -left-[9999px] top-0 w-[436px]" aria-hidden>
          <MuscleFigure />
        </div>
        {video ? (
          <>
            <video src={video.url} controls playsInline autoPlay muted loop className="mx-auto aspect-[9/16] max-h-[60vh] rounded-lg bg-black" aria-label="Anteprima del reel" />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button
                variant="secondary"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() =>
                  setVideo((v) => {
                    if (v) URL.revokeObjectURL(v.url);
                    return null;
                  })
                }
              >
                Rifai
              </Button>
              <Button loading={sharing} icon={<Share2 className="h-4 w-4" />} onClick={() => void share()}>
                Condividi
              </Button>
            </div>
            {video.ext !== 'mp4' && (
              <p className="text-sm text-warning">Questo telefono ha creato il video in formato WebM: alcune app (es. Instagram su iPhone) potrebbero non accettarlo.</p>
            )}
            <p className="text-xs text-fg-3">Il video è senza musica: puoi aggiungerla tu su Instagram o TikTok prima di pubblicarlo.</p>
          </>
        ) : progress != null ? (
          <div className="py-6 text-center">
            <Clapperboard className="mx-auto h-10 w-10 text-accent-400" aria-hidden />
            <p className="mt-3 text-base font-semibold text-fg">
              {phase === 'body' ? 'Riconosco il corpo nelle foto…' : 'Creo il tuo reel…'} {Math.round(progress * 100)}%
            </p>
            <div className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-accent-500 transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-3 text-sm text-fg-3">Tieni l'app aperta: il video si crea sul telefono, senza inviare le foto a nessuno.</p>
            <Button className="mt-4" variant="ghost" onClick={() => (cancel.current = true)}>
              Annulla
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-2">
              Un video verticale con tutte le tue foto del giorno in sequenza (ognuna con giorno, allenamento, peso e muscoli allenati), il confronto tra il primo e l'ultimo giorno e i numeri del percorso: giorni, allenamenti, serie, kg
              sollevati e cambio di peso.
            </p>
            <Segmented<Period> label="Periodo del reel" value={period} options={PERIODS} onChange={setPeriod} />
            <div className="rounded-md bg-surface-2 px-3">
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
                description="Stessa grandezza e posizione del corpo in tutte le foto."
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-fg-3">Sfondo</div>
              <Segmented<ReelBg>
                label="Sfondo del reel"
                value={bg}
                options={BGS}
                onChange={(v) => {
                  setBg(v);
                  write(BG_KEY, v);
                }}
              />
            </div>
            {(align || bg !== 'orig') && <p className="text-xs text-fg-3">La prima volta il telefono scarica i modelli per riconoscere il corpo (circa 30 MB), poi restano salvati.</p>}
            {n >= 2 ? (
              <p className="text-sm text-fg-3">
                {n} foto · video di circa {reelSeconds(Math.min(n, 140))} secondi
              </p>
            ) : (
              <p className="text-sm text-warning">Servono almeno 2 foto in questo periodo. Scatta la foto del giorno ogni giorno: più foto, più bello il reel.</p>
            )}
            <Button fullWidth size="lg" disabled={n < 2} icon={<Clapperboard className="h-5 w-5" />} onClick={() => void create()}>
              Crea il reel
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
