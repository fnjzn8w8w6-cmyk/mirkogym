import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Input';
import { SectionTitle } from '@/components/ui/Help';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useSessions } from '@/hooks/use-sessions';
import { useDayTarget } from '@/hooks/use-habits';
import { cn } from '@/lib/cn';
import { fromISODate, mondayISO, toISODate, todayISO } from '@/lib/date-utils';
import { sumMacros } from '@/lib/foods';
import { dayNutrition } from '@/lib/habits';
import type { UserProfile } from '@/lib/metabolism';
import type { DiaryMeal, FoodLog } from '@/types';
import { useSettings } from '@/hooks/use-settings';
import { settle } from '@/lib/firestore';
import { analyzeDietDay, analyzeDietWeek, dietDayData, dietWeekData, type DietDay } from '@/lib/analysis';
import { PeriodAnalysis } from '@/components/coach/PeriodAnalysis';
import { entryMacros } from './FoodDiary';
import { MacroBar } from './shared';

type Period = 7 | 30 | 90;
const WD = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const WD_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const MEALS: { key: DiaryMeal; label: string; color: string }[] = [
  { key: 'colazione', label: 'Colazione', color: 'var(--macro-protein)' },
  { key: 'pranzo', label: 'Pranzo', color: 'var(--macro-carbs)' },
  { key: 'cena', label: 'Cena', color: '#3B82F6' },
  { key: 'spuntini', label: 'Spuntini', color: 'var(--macro-fat)' },
];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Analisi della dieta: tutto calcolato dal diario (quello che hai mangiato davvero), niente da compilare. */
export function DietAnalysis({ profile }: { profile: UserProfile }) {
  const [period, setPeriod] = useState<Period>(7);
  const { sessions } = useSessions();
  const dayT = useDayTarget(profile);
  const logs = useRecentFoodLogs(period);
  const today = todayISO();

  const days = useMemo(() => {
    if (!dayT) return [];
    const trainedOn = new Set(sessions.map((s) => toISODate(s.date)));
    return logs
      .filter((l) => l.date < today && l.entries.length && l.recap?.complete !== false)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => {
        const wd = (fromISODate(l.date).getDay() + 6) % 7;
        const t = dayNutrition(dayT.base, wd, dayT.cycling, trainedOn.has(l.date));
        const m = sumMacros(l.entries.map(entryMacros));
        const byMeal = Object.fromEntries(MEALS.map(({ key }) => [key, l.entries.filter((e) => e.meal === key).reduce((a, e) => a + entryMacros(e).kcal, 0)])) as Record<DiaryMeal, number>;
        const inTarget = Math.abs(m.kcal - t.target) <= t.target * 0.1 && m.protein >= t.protein * 0.85;
        return { date: l.date, wd, m, t, byMeal, inTarget, kcalOk: Math.abs(m.kcal - t.target) <= t.target * 0.1 };
      });
  }, [logs, dayT, sessions, today]);

  const foods = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of logs) if (l.date < today) for (const e of l.entries) c.set(e.name, (c.get(e.name) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [logs, today]);

  if (!dayT) return null;
  const n = days.length;
  const hit = days.filter((d) => d.inTarget).length;
  const mean = {
    kcal: avg(days.map((d) => d.m.kcal)),
    protein: avg(days.map((d) => d.m.protein)),
    carbs: avg(days.map((d) => d.m.carbs)),
    fat: avg(days.map((d) => d.m.fat)),
  };
  const tMean = {
    kcal: avg(days.map((d) => d.t.target)),
    protein: avg(days.map((d) => d.t.protein)),
    carbs: avg(days.map((d) => d.t.carbs)),
    fat: avg(days.map((d) => d.t.fat)),
  };

  // barre: giorno per giorno (7 e 30 giorni), medie settimanali (90 giorni)
  const bars =
    period === 90
      ? Array.from(new Map(days.map((d) => [Math.floor((fromISODate(today).getTime() - fromISODate(d.date).getTime()) / (7 * 86400000)), d])).keys())
          .sort((a, b) => b - a)
          .map((w) => {
            const ds = days.filter((d) => Math.floor((fromISODate(today).getTime() - fromISODate(d.date).getTime()) / (7 * 86400000)) === w);
            const k = avg(ds.map((d) => d.m.kcal));
            const t = avg(ds.map((d) => d.t.target));
            return { key: `w${w}`, label: w === 0 ? 'ora' : `-${w}s`, kcal: k, target: t, ok: Math.abs(k - t) <= t * 0.1 };
          })
      : days.map((d) => ({ key: d.date, label: period === 7 ? WD[d.wd] : String(fromISODate(d.date).getDate()), kcal: d.m.kcal, target: d.t.target, ok: d.kcalOk }));
  const top = Math.max(1, ...bars.map((b) => Math.max(b.kcal, b.target))) * 1.1;

  // media per giorno della settimana (scostamento dall'obiettivo)
  const byWd = WD.map((_, wd) => {
    const ds = days.filter((d) => d.wd === wd);
    return ds.length ? avg(ds.map((d) => d.m.kcal - d.t.target)) : null;
  });
  const mealKcal = MEALS.map((m) => ({ ...m, kcal: avg(days.map((d) => d.byMeal[m.key])) }));
  const mealTot = mealKcal.reduce((a, m) => a + m.kcal, 0) || 1;

  // commento del coach (calcolato sul telefono)
  const tips: string[] = [];
  if (n >= 3) {
    const kcalOff = (mean.kcal - tMean.kcal) / tMean.kcal;
    if (hit / n >= 0.7) tips.push(`Ottimo: ${hit} giorni su ${n} in obiettivo. Continua così.`);
    else if (Math.abs(kcalOff) > 0.1) tips.push(`In media sei ${kcalOff > 0 ? 'sopra' : 'sotto'} di ${Math.abs(Math.round(mean.kcal - tMean.kcal))} kcal al giorno rispetto all'obiettivo.`);
    if (mean.protein < tMean.protein * 0.85) tips.push(`Proteine basse (${Math.round(mean.protein)} su ${Math.round(tMean.protein)} g): aggiungi una fonte proteica a colazione o negli spuntini.`);
    else tips.push('Proteine a posto 💪');
    if (mean.fat > tMean.fat * 1.15) tips.push('Grassi un po\' alti: occhio a condimenti, formaggi e frutta secca.');
    const worst = byWd.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null).sort((a, b) => b.v - a.v)[0];
    if (worst && worst.v > tMean.kcal * 0.15) tips.push(`Il ${WD_LONG[worst.i]} è il giorno in cui sfori di più (+${Math.round(worst.v)} kcal in media).`);
  }

  return (
    <div className="space-y-4">
      <DietCoachAnalysis profile={profile} />
      <div className="text-xs font-bold uppercase tracking-wider text-fg-3">Andamento</div>
      <Segmented<`${Period}`>
        label="Periodo"
        value={`${period}`}
        onChange={(v) => setPeriod(Number(v) as Period)}
        options={[
          { value: '7', label: '7 giorni' },
          { value: '30', label: '30 giorni' },
          { value: '90', label: '90 giorni' },
        ]}
      />

      {n === 0 ? (
        <Card className="p-4 text-center text-sm text-fg-2">
          I grafici partono dalla prima giornata completa già conclusa (quella di oggi conta da domani). Intanto puoi analizzare la giornata di oggi qui sopra.
        </Card>
      ) : (
        <>
          <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
            <SectionTitle help="diet-analysis" isNew>
              Riepilogo
            </SectionTitle>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              [`${hit}/${n}`, 'giorni in obiettivo'],
              [Math.round(mean.kcal).toLocaleString('it-IT'), 'kcal medie'],
              [`${Math.round(mean.protein)} g`, 'proteine medie'],
            ].map(([v, l]) => (
              <Card key={l} className="p-3 text-center">
                <div className="font-display text-xl font-extrabold text-accent-400">{v}</div>
                <div className="text-xs text-fg-3">{l}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="diet-analysis-chart">{period === 90 ? 'Calorie medie per settimana' : 'Calorie per giorno'}</SectionTitle>
            </div>
            <div className="mt-3 flex h-32 items-end gap-1">
              {bars.map((b) => (
                <div key={b.key} className="relative flex h-full flex-1 flex-col justify-end" title={`${Math.round(b.kcal)} / ${Math.round(b.target)} kcal`}>
                  <div className="absolute left-0 right-0 border-t border-dashed border-fg-3" style={{ bottom: `${(b.target / top) * 100}%` }} />
                  <div className={cn('mx-auto w-full max-w-[36px] rounded-t-sm', b.ok ? 'bg-accent-500' : 'bg-warning')} style={{ height: `${(b.kcal / top) * 100}%` }} />
                </div>
              ))}
            </div>
            {bars.length <= 14 && (
              <div className="mt-1 flex gap-1 text-center text-[10px] text-fg-3">
                {bars.map((b) => (
                  <span key={b.key} className="mx-auto max-w-[36px] flex-1">
                    {b.label}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-fg-3">Tratteggio = obiettivo del giorno · verde = entro ±10% · giallo = fuori</p>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="diet-analysis-macros">Media giornaliera vs obiettivo</SectionTitle>
            </div>
            <MacroBar label="Calorie" value={mean.kcal} target={Math.round(tMean.kcal)} unit="kcal" color="var(--text-primary)" />
            <MacroBar label="Proteine" value={mean.protein} target={Math.round(tMean.protein)} unit="g" color="var(--macro-protein)" />
            <MacroBar label="Carboidrati" value={mean.carbs} target={Math.round(tMean.carbs)} unit="g" color="var(--macro-carbs)" />
            <MacroBar label="Grassi" value={mean.fat} target={Math.round(tMean.fat)} unit="g" color="var(--macro-fat)" />
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="diet-analysis-meals">Come distribuisci le calorie</SectionTitle>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-3">
              {mealKcal.map((m) => (
                <div key={m.key} style={{ width: `${(m.kcal / mealTot) * 100}%`, backgroundColor: m.color }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-sm text-fg-2">
              {mealKcal.map((m) => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.label} {Math.round((m.kcal / mealTot) * 100)}% · {Math.round(m.kcal)} kcal
                </span>
              ))}
            </div>
            {byWd.filter((v) => v != null).length >= 4 && (
              <>
                <div className="mt-4 text-xs text-fg-3">Scostamento medio dall'obiettivo per giorno della settimana</div>
                <div className="mt-1 grid grid-cols-7 gap-1 text-center">
                  {byWd.map((v, i) => (
                    <div key={i} className="rounded-md bg-surface-2 py-1.5">
                      <div className="text-[10px] text-fg-3">{WD[i]}</div>
                      <div className={cn('text-xs font-semibold', v == null ? 'text-fg-3' : Math.abs(v) <= tMean.kcal * 0.1 ? 'text-accent-400' : 'text-warning')}>
                        {v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="diet-analysis-foods">Cosa mangi di più</SectionTitle>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-fg-2">
              {foods.map(([name, c]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 text-fg-3">×{c}</span>
                </li>
              ))}
            </ul>
          </Card>

          {tips.length > 0 && (
            <Card className="border-accent-500/40 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
                <SectionTitle help="diet-analysis-coach">💬 Il coach</SectionTitle>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-fg">
                {tips.map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const MEAL_LABEL: Record<DiaryMeal, string> = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena', spuntini: 'Spuntini' };

/** Analisi del dietologo: una giornata (oggi o l'ultima registrata) o la settimana in corso. Solo dieta. */
/** Giornata del diario → dati per il dietologo (obiettivo del giorno, mangiato, pasti, resoconto). */
export function useDietDay(profile: UserProfile) {
  const { sessions } = useSessions();
  const dayT = useDayTarget(profile);
  const today = todayISO();
  const trainedOn = useMemo(() => new Set(sessions.map((s) => toISODate(s.date))), [sessions]);
  return useMemo(
    () =>
      (l: FoodLog): DietDay | null => {
        if (!dayT) return null;
        const wd = (fromISODate(l.date).getDay() + 6) % 7;
        const trained = trainedOn.has(l.date) ? true : l.date < today ? false : undefined;
        const t = dayNutrition(dayT.base, wd, dayT.cycling, trained);
        const m = sumMacros(l.entries.map(entryMacros));
        return {
          date: l.date,
          target: { kcal: t.target, protein: t.protein, carbs: t.carbs, fat: t.fat },
          eaten: { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat },
          training: trained ?? null,
          meals: MEALS.map(({ key }) => {
            const es = l.entries.filter((e) => e.meal === key);
            return { meal: MEAL_LABEL[key], items: es.map((e) => `${e.name} ${e.unit === 'g' ? `${Math.round(e.qty)} g` : `×${e.qty}`}`), kcal: es.reduce((a, e) => a + entryMacros(e).kcal, 0) };
          }).filter((x) => x.items.length),
          complete: l.recap?.complete,
          hunger: l.recap?.hunger,
          cheat: l.recap?.cheat,
          note: l.recap?.note,
        };
      },
    [dayT, trainedOn, today],
  );
}

function DietCoachAnalysis({ profile }: { profile: UserProfile }) {
  const { settings, update } = useSettings();
  const dayT = useDayTarget(profile);
  const logs = useRecentFoodLogs(15);
  const today = todayISO();
  const week = mondayISO();
  const prevWeek = toISODate(fromISODate(week).getTime() - 7 * 86400000);
  const toDay = useDietDay(profile);

  const logged = logs.filter((l) => l.entries.length).sort((a, b) => b.date.localeCompare(a.date));
  const dayLog = logged.find((l) => l.date === today) ?? logged[0];
  const weekLogs = logged.filter((l) => l.date >= week).sort((a, b) => a.date.localeCompare(b.date));
  const saved = settings.dietAnalysis ?? {};
  const kcalOf = (l: FoodLog) => Math.round(sumMacros(l.entries.map(entryMacros)).kcal);
  if (!dayT) return null;

  return (
    <PeriodAnalysis
      title="Analisi del dietologo"
      help="diet-analysis-ai"
      persona="diet"
      modes={[
        {
          key: 'day',
          label: 'Giornata',
          subject: dayLog ? `${dayLog.date === today ? 'Oggi' : fromISODate(dayLog.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} · ${kcalOf(dayLog)} kcal registrate` : null,
          action: dayLog?.date === today ? 'Analizza la giornata di oggi' : "Analizza l'ultima giornata",
          saved: saved.day,
          // cambia quando aggiungi qualcosa al diario
          ref: dayLog ? `${dayLog.date}:${dayLog.entries.length}:${kcalOf(dayLog)}` : null,
          intro: dayLog
            ? 'Il dietologo guarda cosa hai mangiato nella giornata rispetto all’obiettivo (calorie, proteine, carboidrati, grassi) e ti dice cosa sistemare, anche cosa mangiare nel resto della giornata.'
            : 'Registra i pasti nel Diario: poi il dietologo potrà analizzare la giornata.',
          run: (o) => analyzeDietDay(dietDayData(toDay(dayLog!)!), profile, o),
          save: (a) => settle(update({ dietAnalysis: { ...saved, day: a } })),
        },
        {
          key: 'week',
          label: 'Settimana',
          subject: `Settimana dal ${fromISODate(week).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · ${weekLogs.length} ${weekLogs.length === 1 ? 'giorno registrato' : 'giorni registrati'}`,
          action: 'Analizza la settimana',
          saved: saved.week,
          ref: weekLogs.length ? `${week}:${weekLogs.map((l) => `${l.date}-${l.entries.length}`).join(',')}` : null,
          intro: weekLogs.length
            ? 'Il dietologo guarda i giorni registrati da lunedì a oggi: medie, giorni in obiettivo, proteine, cibi più frequenti, fame e sgarri. Non giudica la settimana come finita.'
            : 'Registra i pasti nel Diario: poi il dietologo potrà analizzare la settimana.',
          run: (o) =>
            analyzeDietWeek(
              dietWeekData(
                weekLogs.map((l) => toDay(l)!).filter(Boolean),
                logged.filter((l) => l.date >= prevWeek && l.date < week).map((l) => toDay(l)!).filter(Boolean),
              ),
              profile,
              o,
            ),
          save: (a) => settle(update({ dietAnalysis: { ...saved, week: a } })),
        },
      ]}
    />
  );
}
