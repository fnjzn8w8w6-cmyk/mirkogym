import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { MuscleFigure, GROUP_MUSCLES } from '@/components/library/MuscleFigure';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { useAthlete } from '@/hooks/use-athlete';
import { PAIN_LABEL } from '@/lib/athlete';
import { muscleStatus } from '@/lib/analytics';

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);

/** Muscoli allenati questa settimana + commento del coach (calcolato dai tuoi dati, senza AI). */
export function MuscleWeekCard() {
  const { days } = useSchedule();
  const { sessions, groupOf } = useSessions();
  const { settings } = useSettings();
  const { report } = useAthlete();

  const { intensity, comment } = useMemo(() => {
    const groups = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.group)))];
    const status = muscleStatus(sessions, groupOf, groups);
    const out: Record<string, number> = {};
    for (const m of status) for (const mm of GROUP_MUSCLES[m.group] ?? []) out[mm] = m.weekSets / settings.weeklySetsMax;

    const planned = status.filter((m) => groups.includes(m.group));
    const done = planned.filter((m) => m.weekSets >= settings.weeklySetsMin).map((m) => m.group);
    const partial = planned.filter((m) => m.weekSets > 0 && m.weekSets < settings.weeklySetsMin).map((m) => `${m.group} (${m.weekSets} serie su ${settings.weeklySetsMin})`);
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
      if (missing.length) lines.push(`${weekday >= 4 ? '⚠️ La settimana sta finendo e mancano' : '📅 Ancora da allenare:'} ${list(missing)}.`);
      if (tired.length) lines.push(`😮‍💨 ${list(tired)} ${tired.length === 1 ? 'è' : 'sono'} ancora in recupero: meglio non ${tired.length === 1 ? 'caricarlo' : 'caricarli'} oggi.`);
      if (!missing.length && !partial.length) lines.push('🔥 Settimana completa: tutti i gruppi della scheda sono a posto. Ottimo lavoro!');
    }
    const pain = report.pains.find((p) => p.active);
    if (pain) lines.push(`🩹 Occhio ${PAIN_LABEL[pain.part].replace(/^(la|il) /, (m) => (m === 'la ' ? 'alla ' : 'al ')).replace(/^l'/, "all'")}: l'hai segnalato il ${new Date(pain.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}.`);
    return { intensity: out, comment: lines };
  }, [days, sessions, groupOf, settings.weeklySetsMin, settings.weeklySetsMax, report.pains]);

  return (
    <Card className="p-4">
      <h2 className="section-title">Muscoli allenati questa settimana</h2>
      <MuscleFigure intensity={intensity} labels className="mx-auto h-72 w-auto" />
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-fg-3">
        Poco
        <span className="h-2 w-24 rounded-full bg-gradient-to-r from-accent-500/25 to-accent-500" aria-hidden />
        Obiettivo raggiunto
      </div>
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
