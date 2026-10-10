import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, RotateCcw, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { usePhotos } from '@/hooks/use-photos';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { renderReel, reelSeconds, type ReelPhoto, type ReelSummary } from '@/lib/reel';
import { shareFile } from '@/lib/share-card';
import { sessionSetCount, sessionTonnage } from '@/lib/analytics';
import { daysBetween, fromISODate, toISODate, todayISO } from '@/lib/date-utils';
import type { BodyLog } from '@/types';

type Period = 'tutto' | '365' | '90' | '30';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'tutto', label: 'Tutto' },
  { value: '365', label: '1 anno' },
  { value: '90', label: '90 g' },
  { value: '30', label: '30 g' },
];

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
  const { photos, images } = usePhotos();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const [period, setPeriod] = useState<Period>('tutto');
  const [progress, setProgress] = useState<number | null>(null);
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
    const all = [...photos].sort((a, b) => a.date.localeCompare(b.date));
    const firstEver = all[0]?.date;
    const from = period === 'tutto' ? '' : toISODate(Date.now() - (Number(period) - 1) * 86400000);
    const sel = all.filter((p) => p.date >= from && p.date <= todayISO());
    if (!firstEver || sel.length < 2) return { list: [] as ReelPhoto[], summary: null as ReelSummary | null };
    const list: ReelPhoto[] = sel.map((p) => ({
      date: p.date,
      day: daysBetween(fromISODate(p.date), fromISODate(firstEver)) + 1,
      weight: p.weight ?? nearest(bodyLogs, p.date, 'weight', 3),
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
      const res = await renderReel(
        data.list,
        data.summary,
        async (date) => (await images(date))?.front ?? null,
        (p) => setProgress(p.value),
        () => cancel.current,
      );
      setVideo({ blob: res.blob, url: URL.createObjectURL(res.blob), ext: res.ext });
    } catch (e) {
      if (!cancel.current) toast.error(e instanceof Error && e.message !== 'Annullato' ? 'Non sono riuscito a creare il video su questo telefono' : 'Creazione annullata');
    } finally {
      setProgress(null);
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
            <p className="text-xs text-fg-3">Il video è senza musica: puoi aggiungerla tu su Instagram o TikTok prima di pubblicarlo.</p>
          </>
        ) : progress != null ? (
          <div className="py-6 text-center">
            <Clapperboard className="mx-auto h-10 w-10 text-accent-400" aria-hidden />
            <p className="mt-3 text-base font-semibold text-fg">Creo il tuo reel… {Math.round(progress * 100)}%</p>
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
              Un video verticale con tutte le tue foto del giorno in sequenza, il confronto tra il primo e l'ultimo giorno e i numeri del percorso: giorni, allenamenti, serie, kg
              sollevati e cambio di peso.
            </p>
            <Segmented<Period> label="Periodo del reel" value={period} options={PERIODS} onChange={setPeriod} />
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
