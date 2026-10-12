import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Chip } from '@/components/ui/Chip';
import { usePhotos } from '@/hooks/use-photos';
import { formatTonnage } from '@/lib/analytics';
import type { CheckIn } from '@/lib/checkin';
import { QUESTIONS } from './checkin-questions';

const longDate = (t: number) => new Date(t).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (t: number) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const kg = (n: number) => `${n.toFixed(1).replace('.', ',')} kg`;
const isoOf = (t: number) => new Date(t).toLocaleDateString('sv-SE');

/** Foto del check-in: quella salvata con il check-in, oppure una foto (non del giorno) dello stesso giorno. */
export function checkInPhoto<P extends { date: string; daily?: boolean }>(c: CheckIn, photos: P[]): P | undefined {
  return c.photoDate ? photos.find((p) => p.date === c.photoDate) : photos.find((p) => p.date === isoOf(c.date) && !p.daily);
}

/**
 * Storico dei check-in: elenco di tutti quelli fatti e dettaglio completo di ognuno
 * (risposte, numeri della settimana, analisi del coach, foto e modifiche applicate).
 * `open`: 'list' = elenco, numero = data del check-in da aprire.
 */
export function CheckInHistory({ checkIns, open, onClose }: { checkIns: CheckIn[]; open: number | 'list' | null; onClose: () => void }) {
  const [view, setView] = useState<number | 'list'>('list');
  useEffect(() => {
    if (open != null) setView(open);
  }, [open]);
  const selected = typeof view === 'number' ? checkIns.find((c) => c.date === view) : undefined;
  const { photos } = usePhotos();
  return (
    <Modal open={open != null} onClose={onClose} title={selected ? 'Check-in' : 'I tuoi check-in'}>
      {selected ? (
        <Detail c={selected} checkIns={checkIns} onBack={checkIns.length > 1 ? () => setView('list') : undefined} />
      ) : (
        <ul className="space-y-2">
          {checkIns.map((c, i) => {
            const prev = checkIns[i + 1];
            const dw = c.weight != null && prev?.weight != null ? c.weight - prev.weight : null;
            const ph = checkInPhoto(c, photos);
            return (
              <li key={c.date}>
                <button type="button" onClick={() => setView(c.date)} className="flex w-full items-center gap-3 rounded-md border border-line-subtle bg-surface-2 p-3 text-left">
                  {ph ? (
                    <img src={ph.thumb} alt="" className="h-20 w-16 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-3" aria-hidden>
                      <ClipboardCheck className="h-6 w-6" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-fg">{shortDate(c.date)}</span>
                    <span className="mt-0.5 block text-sm text-fg-3">
                      {c.stats.sessions}/{c.stats.planned} allenamenti
                      {c.weight != null ? ` · ${kg(c.weight)}` : ''}
                      {dw != null ? ` (${dw > 0 ? '+' : ''}${dw.toFixed(1).replace('.', ',')})` : ''}
                      {c.kcalChange ? ` · ${c.kcalChange > 0 ? '+' : ''}${c.kcalChange} kcal` : ''}
                      {c.deload ? ' · scarico' : ''}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-fg-2">{c.summary}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-fg-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Detail({ c, checkIns, onBack }: { c: CheckIn; checkIns: CheckIn[]; onBack?: () => void }) {
  const { photos, images } = usePhotos();
  const photo = checkInPhoto(c, photos);
  // foto a piena risoluzione (la miniatura si vede subito, poi arriva quella grande)
  const [full, setFull] = useState<string | null>(null);
  useEffect(() => {
    setFull(null);
    if (!photo) return;
    let alive = true;
    void images(photo.date).then((i) => alive && i && setFull(i.front));
    return () => {
      alive = false;
    };
  }, [photo, images]);
  const idx = checkIns.findIndex((x) => x.date === c.date);
  const prev = checkIns[idx + 1];
  const dw = c.weight != null && prev?.weight != null ? c.weight - prev.weight : null;
  const s = c.stats;
  return (
    <div className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className="-mt-2 flex h-9 items-center gap-1 text-sm font-semibold text-accent-400">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Tutti i check-in
        </button>
      )}
      {photo && (
        <figure className="space-y-2">
          <img src={full ?? photo.thumb} alt={`Foto del check-in del ${shortDate(c.date)}`} className="mx-auto aspect-[3/4] w-full max-w-xs rounded-lg bg-surface-2 object-cover" />
          {(c.photoComment || photo.comment) && <figcaption className="text-sm text-fg-2">🧐 {c.photoComment ?? photo.comment}</figcaption>}
        </figure>
      )}
      <div>
        <div className="text-lg font-semibold text-fg first-letter:uppercase">{longDate(c.date)}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.weight != null && (
            <Chip>
              Peso {kg(c.weight)}
              {dw != null ? ` (${dw > 0 ? '+' : ''}${dw.toFixed(1).replace('.', ',')})` : ''}
            </Chip>
          )}
          {(c.bodyFat ?? photo?.bodyFat) != null && <Chip>Massa grassa {String(c.bodyFat ?? photo?.bodyFat).replace('.', ',')}%</Chip>}
          <Chip>
            {s.sessions}/{s.planned} allenamenti
          </Chip>
          {s.tonnage > 0 && <Chip>Volume {formatTonnage(s.tonnage)}</Chip>}
          {s.prs > 0 && <Chip tone="warning">🏆 {s.prs} record</Chip>}
          {c.kcalTarget != null && <Chip>Obiettivo {c.kcalTarget.toLocaleString('it-IT')} kcal</Chip>}
          {c.kcalChange !== 0 && (
            <Chip tone="accent">
              {c.kcalChange > 0 ? '+' : ''}
              {c.kcalChange} kcal
            </Chip>
          )}
          {c.deload && <Chip tone="info">Settimana di scarico</Chip>}
        </div>
      </div>

      <section>
        <h3 className="section-title">Come stavi</h3>
        <dl className="grid grid-cols-2 gap-2">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="rounded-md bg-surface-2 px-3 py-2">
              <dt className="text-xs text-fg-3">{q.label}</dt>
              <dd className="text-base font-semibold text-fg">{q.scale[(c.answers[q.key] ?? 3) - 1]}</dd>
            </div>
          ))}
        </dl>
        {c.answers.note && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm italic text-fg-2">“{c.answers.note}”</p>}
      </section>

      <section>
        <h3 className="section-title">Analisi del coach</h3>
        <p className="whitespace-pre-wrap text-base text-fg-2">{c.summary}</p>
        {c.points && c.points.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-fg-2">
            {c.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {c.applied && c.applied.length > 0 && (
        <section>
          <h3 className="section-title">Modifiche applicate</h3>
          <ul className="space-y-1 text-sm text-fg-2">
            {c.applied.map((a) => (
              <li key={a}>✓ {a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
