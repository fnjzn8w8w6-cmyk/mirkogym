import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { MuscleFigure, GROUP_MUSCLES } from '@/components/library/MuscleFigure';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { useAthlete } from '@/hooks/use-athlete';
import { PAIN_LABEL } from '@/lib/athlete';
import { useTrainingModel } from '@/hooks/use-training-model';
import { usePhotos } from '@/hooks/use-photos';
import { Segmented } from '@/components/ui/Input';
import { SectionTitle } from '@/components/ui/Help';
import { muscleStatus } from '@/lib/analytics';

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);

/** Muscoli allenati questa settimana + commento del coach (calcolato dai tuoi dati, senza AI). */
export function MuscleWeekCard() {
  const { days } = useSchedule();
  const { sessions, groupOf } = useSessions();
  const { settings } = useSettings();
  const { report } = useAthlete();
  const { ideal } = useTrainingModel();
  const { photos } = usePhotos();
  const [view, setView] = useState<'volume' | 'change'>('volume');
  const lastChange = photos.find((p) => p.regions);

  const { intensity, comment, rows } = useMemo(() => {
    const groups = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))];
    const status = muscleStatus(sessions, groupOf, groups);
    const out: Record<string, number> = {};
    for (const m of status) for (const mm of GROUP_MUSCLES[m.group] ?? []) out[mm] = m.weekSets / settings.weeklySetsMax;

    const planned = status.filter((m) => groups.includes(m.group));
    const minOf = (g: string) => ideal.get(g)?.min ?? settings.weeklySetsMin;
    const maxOf = (g: string) => ideal.get(g)?.max ?? settings.weeklySetsMax;
    const done = planned.filter((m) => m.weekSets >= minOf(m.group) && m.weekSets <= maxOf(m.group)).map((m) => m.group);
    const over = planned.filter((m) => m.weekSets > maxOf(m.group)).map((m) => `${m.group} (${m.weekSets} serie, il tuo ideale ${minOf(m.group)}–${maxOf(m.group)})`);
    const partial = planned.filter((m) => m.weekSets > 0 && m.weekSets < minOf(m.group)).map((m) => `${m.group} (${m.weekSets} serie su ${minOf(m.group)})`);
    const missing = planned.filter((m) => m.weekSets === 0).map((m) => m.group);
    const tired = planned.filter((m) => m.weekSets > 0 && m.recovery < 0.5).map((m) => m.group);
    const weekday = (new Date().getDay() + 6) % 7; // 0 = lunedì

    const lines: string[] = [];
    if (!done.length && !partial.length) {
      lines.push(
        weekday <= 1
          ? 'Settimana appena iniziata: la mappa si colora man mano che ti alleni.'
          : `Questa settimana non ti sei ancora allenato. Recuperiamo: oggi è un buon giorno per ${missing[0] ? `allenare ${missing.slice(0, 2).join(' e ')}` : 'ripartire'}.`,
      );
    } else {
      if (done.length) lines.push(`💪 ${list(done)} ${done.length === 1 ? 'ha' : 'hanno'} già il volume giusto per la settimana.`);
      if (partial.length) lines.push(`📈 Da completare: ${list(partial)}.`);
      if (over.length) lines.push(`⚠️ Oltre il tuo volume ideale: ${list(over)}. Più serie non ti fanno progredire di più.`);
      if (missing.length) lines.push(`${weekday >= 4 ? '⚠️ La settimana sta finendo e mancano' : '📅 Ancora da allenare:'} ${list(missing)}.`);
      if (tired.length) lines.push(`😮‍💨 ${list(tired)} ${tired.length === 1 ? 'è' : 'sono'} ancora in recupero: meglio non ${tired.length === 1 ? 'caricarlo' : 'caricarli'} oggi.`);
      if (!missing.length && !partial.length) lines.push('🔥 Settimana completa: tutti i gruppi della scheda sono a posto. Ottimo lavoro!');
    }
    const pain = report.pains.find((p) => p.active);
    if (pain) lines.push(`🩹 Occhio ${PAIN_LABEL[pain.part].replace(/^(la|il) /, (m) => (m === 'la ' ? 'alla ' : 'al ')).replace(/^l'/, "all'")}: l'hai segnalato il ${new Date(pain.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}.`);
    const rows = planned.map((m) => ({ group: m.group, sets: m.weekSets, ideal: ideal.get(m.group) }));
    return { intensity: out, comment: lines, rows };
  }, [days, sessions, groupOf, settings.weeklySetsMin, settings.weeklySetsMax, report.pains, ideal]);

  // Vista "Cambiamento": zone migliorate secondo il confronto tra le ultime foto
  const changeIntensity = useMemo(() => {
    const out: Record<string, number> = {};
    const zones: Record<string, string[]> = { Spalle: ['Spalle'], Petto: ['Petto'], Braccia: ['Bicipiti', 'Tricipiti'], Dorso: ['Dorso'], Addome: ['Core'], Gambe: ['Gambe'] };
    for (const [z, v] of Object.entries(lastChange?.regions ?? {})) if (v > 0) for (const g of zones[z] ?? []) for (const mm of GROUP_MUSCLES[g] ?? []) out[mm] = v / 2;
    return out;
  }, [lastChange]);

  return (
    <Card className="p-4">
      <h2 className="section-title">
        <SectionTitle help="body-muscles" isNew>Muscoli allenati questa settimana</SectionTitle>
      </h2>
      <Segmented<'volume' | 'change'>
        label="Vista della mappa"
        value={view}
        onChange={setView}
        options={[
          { value: 'volume', label: 'Volume' },
          { value: 'change', label: 'Cambiamento ✨' },
        ]}
      />
      <MuscleFigure intensity={view === 'volume' ? intensity : changeIntensity} labels className="mx-auto mt-2 h-72 w-auto" />
      {view === 'volume' ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-fg-3">
          Poco
          <span className="h-2 w-24 rounded-full bg-gradient-to-r from-accent-500/25 to-accent-500" aria-hidden />
          Obiettivo raggiunto
        </div>
      ) : (
        <p className="mt-2 text-center text-xs text-fg-3">
          {lastChange
            ? `Zone migliorate secondo il confronto delle foto (${new Date(`${lastChange.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}). ${Object.entries(lastChange.regions!)
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => `${v > 0 ? '▲' : '▼'} ${k.toLowerCase()}`)
                .join(' · ') || 'Nessun cambiamento evidente.'}`
            : 'Servono almeno due foto settimanali (dal check-in) per vedere dove stai cambiando.'}
        </p>
      )}
      {view === 'volume' && rows.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-fg-3">
              <th className="py-1 text-left font-semibold">Gruppo</th>
              <th className="py-1 text-right font-semibold">Serie</th>
              <th className="py-1 text-right font-semibold">
                <SectionTitle help="body-ideal-volume" isNew>
                  Il tuo ideale
                </SectionTitle>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const min = r.ideal?.min ?? settings.weeklySetsMin;
              const max = r.ideal?.max ?? settings.weeklySetsMax;
              const tone = r.sets > max ? 'text-warning' : r.sets >= min ? 'text-accent-400' : 'text-fg-2';
              return (
                <tr key={r.group} className="border-t border-line-subtle">
                  <td className="py-1.5 text-fg">{r.group}</td>
                  <td className="py-1.5 text-right font-semibold text-fg">{r.sets}</td>
                  <td className={`py-1.5 text-right ${tone}`}>
                    {min}–{max}
                    {r.sets > max ? ' · troppe' : r.sets >= min ? ' ✓' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {view === 'volume' && rows.some((r) => !r.ideal?.personal) && (
        <p className="mt-1 text-xs text-fg-3">Fasce standard finché non ci sono circa 6 settimane di dati: poi diventano le tue.</p>
      )}
      <div className="mt-4 flex gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
        <span className="inline-block h-fit animate-think text-3xl" aria-hidden>
          🏋️
        </span>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-violet-400">Il coach</div>
          <ul className="mt-1 space-y-1 text-sm text-fg-2">
            {comment.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
