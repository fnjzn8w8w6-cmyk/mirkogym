import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, TrendingDown } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { settle } from '@/lib/firestore';
import { adaptiveCalories } from '@/lib/coach';
import { bfCategory, composition, type UserProfile } from '@/lib/metabolism';
import { formatKg } from '@/lib/analytics';
import { formatRelativeDay, fromISODate, mondayISO } from '@/lib/date-utils';
import { useDayTarget } from '@/hooks/use-habits';
import { explainWeek, undoWeekCalories } from '@/lib/calorie-week';
import { cn } from '@/lib/cn';
import { planRate } from '@/lib/goal-plan';
import { SectionTitle } from '@/components/ui/Help';
import type { BodyLog } from '@/types';
import { BF_SOURCE_IT, bodyFatNow, type BodyFatNow } from '@/lib/bodyfat-estimate';

/** Profilo con l'ultimo peso e l'ultima massa grassa registrati. */
function useCurrentProfile(): { p: UserProfile | null; bf: BodyFatNow | null } {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const prof = settings.profile;
    if (!prof) return { p: null, bf: null };
    const w = bodyLogs.find((b) => b.weight != null);
    // ultima misura affidabile, aggiornata col trend del peso
    const bf = bodyFatNow(bodyLogs);
    return { p: { ...prof, weightKg: w?.weight ?? prof.weightKg, bodyFatPct: bf?.value ?? prof.bodyFatPct }, bf };
  }, [settings.profile, bodyLogs]);
}

function Ring({ value, max }: { value: number; max: number }) {
  const size = 112;
  const w = 12;
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, value / max);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <linearGradient id="bf-ring" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent-500)" />
          <stop offset="1" stopColor="var(--accent-600)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg-surface-3)" strokeWidth={w} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#bf-ring)"
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/** Composizione corporea in cima alla sezione Corpo. */
export function CompositionCard() {
  const { p, bf: bfNow } = useCurrentProfile();
  if (!p) return null;
  const c = composition(p);
  const bf = c.bf.value;
  const fatKg = p.weightKg - c.lean;
  return (
    <Card variant="elevated" className="p-4">
      <div className="section-title">
        <SectionTitle help="body-composition">Composizione corporea</SectionTitle>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Ring value={bf} max={p.sex === 'm' ? 30 : 40} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-xl font-extrabold text-fg">{formatKg(bf)}%</span>
            <span className="text-[10px] uppercase text-fg-3">massa grassa</span>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2">
          {[
            ['Peso', `${formatKg(p.weightKg)} kg`],
            ['Massa magra', `${formatKg(c.lean)} kg`],
            ['Massa grassa', `${formatKg(fatKg)} kg`],
            ['FFMI', formatKg(c.ffmi)],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="text-xs text-fg-3">{l}</div>
              <div className="text-lg font-bold text-fg">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="accent">{bfCategory(bf, p.sex)}</Chip>
        <span className="text-xs text-fg-3">
          BMI {formatKg(c.bmi)} · {bfNow
            ? bfNow.estimated
              ? `massa grassa stimata dal peso · ultima misura (${BF_SOURCE_IT[bfNow.source]}) ${formatRelativeDay(fromISODate(bfNow.anchorDate)).toLowerCase()}`
              : `massa grassa misurata ${formatRelativeDay(fromISODate(bfNow.anchorDate)).toLowerCase()} (${BF_SOURCE_IT[bfNow.source]})`
            : 'massa grassa stimata dal questionario: fai il check-in con foto per una misura'}
        </span>
      </div>
    </Card>
  );
}

const nf = (n: number) => n.toLocaleString('it-IT');

/** Aggiornamento settimanale delle calorie: un solo numero, già applicato, con il perché. */
export function WeekCaloriesCard() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const prof = settings.profile;
  const dayT = useDayTarget(prof);
  const w = settings.weekCal;
  const [why, setWhy] = useState(false);
  if (!prof || !w || w.week !== mondayISO() || !dayT) return null;
  const weight = bodyLogs.find((b) => b.weight != null)?.weight ?? prof.weightKg;
  const delta = w.prevTarget != null && !w.undone ? w.target - w.prevTarget : 0;
  const changed = Math.abs(delta) >= 50;
  const train = Math.max(...dayT.week.map((d) => d.target));
  const rest = Math.min(...dayT.week.map((d) => d.target));
  const monday = fromISODate(w.week).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Card className={cn('p-4', changed ? 'border-accent-500/40' : '')}>
      <div className="flex items-center justify-between gap-2">
        <div className="section-title !mb-0 flex items-center gap-1.5 text-accent-400">
          <RefreshCw className="h-4 w-4" aria-hidden />
          <SectionTitle help="body-weekcal" isNew>
            Aggiornamento settimanale
          </SectionTitle>
        </div>
      </div>
      <div className="mt-2 text-lg font-bold text-fg">
        {changed ? (
          <>
            Da {monday}: <span className="text-accent-400">{delta > 0 ? '+' : ''}{delta} kcal</span> al giorno
          </>
        ) : w.undone ? (
          'Aggiornamento annullato'
        ) : w.prevTarget == null ? (
          'Calorie fissate per questa settimana'
        ) : (
          'Calorie confermate per questa settimana'
        )}
      </div>
      <p className="mt-1 text-sm text-fg-2">
        {changed ? 'Già applicato: obiettivo medio ' : 'Obiettivo medio '}
        {changed && w.prevTarget != null ? `da ${nf(w.prevTarget)} a ` : ''}
        <strong className="text-fg">{nf(w.target)} kcal</strong>
        {train !== rest ? ` (allenamento ${nf(train)} · riposo ${nf(rest)})` : ''}.
      </p>
      <div className="mt-3 grid gap-2">
        <Stat label="Peso (trend)" value={w.trend != null ? `${w.trend >= 0 ? '+' : ''}${String(w.trend).replace('.', ',')} kg/sett` : 'servono più pesate'} note={w.expected != null ? `atteso ${w.expected >= 0 ? '+' : ''}${String(w.expected).replace('.', ',')}` : undefined} />
        <Stat label={w.tdee ? 'Dispendio reale stimato' : 'Dispendio (formula)'} value={`${nf(w.tdee ?? dayT.base.tdee)} kcal`} note={w.prevTdee && w.tdee && w.prevTdee !== w.tdee ? `prima ${nf(w.prevTdee)}` : w.tdee ? 'dal diario e dal peso' : 'finché il diario non basta'} />
        <Stat label="Giorni registrati (ultimi 7)" value={`${w.logged} su 7`} note={w.logged >= 5 ? 'dati affidabili' : 'registra tutti i pasti'} />
      </div>
      <p className="mt-3 text-sm text-fg-2">
        {w.prevTarget == null ? 'Primo calcolo: da lunedì prossimo l\'app confronta peso e diario della settimana e aggiorna l\'obiettivo da sola.' : explainWeek(w, weight, prof.goal)}
      </p>
      {why && (
        <p className="mt-2 rounded-md bg-surface-2 p-3 text-xs text-fg-2">
          Ogni lunedì l'app confronta l'andamento del peso (media delle pesate) con le calorie che hai registrato e stima quanto consumi davvero. Poi fissa l'obiettivo della settimana: dispendio reale + quanto serve per il ritmo del tuo obiettivo. Check-in, coach e analisi usano questi stessi numeri.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setWhy(!why)}>
          {why ? 'Chiudi' : 'Perché?'}
        </Button>
        <Button
          variant="secondary"
          disabled={!changed || !w.undo}
          onClick={() => void settle(update({ weekCal: undoWeekCalories(w), kcalAdjust: w.undo?.adjust ?? settings.kcalAdjust }))}
        >
          Annulla
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
      <div>
        <div className="text-xs text-fg-3">{label}</div>
        <div className="text-base font-bold text-fg">{value}</div>
      </div>
      {note && <div className="text-xs text-fg-3">{note}</div>}
    </div>
  );
}

const fmtRate = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} kg`;

/** Avviso sull'andamento: nell'obiettivo, leggermente fuori (e come recuperare) o dati insufficienti. */
export function GoalStatus() {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const { p } = useCurrentProfile();
  const a = useMemo(
    () => (p ? adaptiveCalories(bodyLogs, p, settings.goalPlan ? planRate(settings.goalPlan, bodyLogs, p.weightKg) : null) : null),
    [bodyLogs, p, settings.goalPlan],
  );
  if (!p) return null;

  if (!a) {
    const n = bodyLogs.filter((b) => b.weight != null && Date.now() - fromISODate(b.date).getTime() < 14 * 86400000).length;
    return (
      <Card className="flex gap-3 border-info/30 p-4">
        <Info className="h-6 w-6 shrink-0 text-info" aria-hidden />
        <div>
          <div className="text-base font-bold text-fg">Pesati per ricevere il tuo giudizio</div>
          <p className="text-sm text-fg-2">
            Registra il peso 3–4 volte a settimana: dopo circa 2 settimane ti dico se sei nell'obiettivo. Pesate recenti: {n}.
          </p>
        </div>
      </Card>
    );
  }
  const ok = a.suggestion === 0;
  const cutting = p.goal === 'cut';
  const title = ok
    ? 'Sei nell’obiettivo 💪'
    : cutting && a.actual > a.expected
      ? 'Questa settimana hai sgarrato un po’'
      : cutting
        ? 'Stai scendendo troppo in fretta'
        : a.actual > a.expected
          ? 'Stai salendo più del previsto'
          : 'Stai salendo meno del previsto';
  const text = ok
    ? `${fmtRate(a.actual)} a settimana, in linea con l'atteso (${fmtRate(a.expected)}). Continua così.`
    : cutting && a.actual > a.expected
      ? `Nessun problema: recuperi la prossima settimana. Peso ${fmtRate(a.actual)} a settimana contro ${fmtRate(a.expected)} atteso: consiglio ${a.suggestion} kcal al giorno.`
      : `Peso ${fmtRate(a.actual)} a settimana contro ${fmtRate(a.expected)} atteso: consiglio ${a.suggestion > 0 ? '+' : ''}${a.suggestion} kcal al giorno.`;
  return (
    <Card className={cn('flex gap-3 p-4', ok ? 'border-success/40 bg-success-bg' : 'border-warning/40 bg-warning-bg')}>
      {ok ? <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden /> : cutting && a.actual > a.expected ? <AlertTriangle className="h-6 w-6 shrink-0 text-warning" aria-hidden /> : <TrendingDown className="h-6 w-6 shrink-0 text-warning" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-fg">
          <SectionTitle help="body-status">{title}</SectionTitle>
        </div>
        <p className="text-sm text-fg-2">
          {ok ? text : `Peso ${fmtRate(a.actual)} a settimana contro ${fmtRate(a.expected)} atteso. L'aggiornamento di lunedì correggerà le calorie in automatico: non devi fare niente.`}
        </p>
        <p className="mt-1 text-xs text-fg-3">
          Basato su {a.points} pesate in {a.days} giorni.
        </p>
      </div>
    </Card>
  );
}

const MEASURES: [keyof NonNullable<BodyLog['circumferences']>, string][] = [
  ['waist', 'Vita'],
  ['chest', 'Petto'],
  ['arm', 'Braccio'],
  ['thigh', 'Coscia'],
];

/** Ultime misurazioni (circonferenze) con la variazione rispetto alla precedente. */
export function Measurements({ logs }: { logs: BodyLog[] }) {
  const rows = MEASURES.map(([k, label]) => {
    const withK = logs.filter((l) => l.circumferences?.[k] != null);
    const cur = withK[0]?.circumferences?.[k];
    const prev = withK[1]?.circumferences?.[k];
    return { label, cur, delta: cur != null && prev != null ? cur - prev : null, good: k === 'waist' ? -1 : 1 };
  }).filter((r) => r.cur != null);
  if (!rows.length) return null;
  return (
    <Card className="p-4">
      <h2 className="section-title">
        <SectionTitle help="body-measurements">Misurazioni</SectionTitle>
      </h2>
      <ul className="divide-y divide-line-subtle">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2.5">
            <span className="text-base text-fg-2">{r.label}</span>
            <span className="text-base font-bold text-fg">
              {formatKg(r.cur as number)} cm
              {r.delta != null && (
                <span className={cn('ml-2 text-xs font-semibold', r.delta === 0 ? 'text-fg-3' : r.delta * r.good > 0 ? 'text-success' : 'text-warning')}>
                  {r.delta > 0 ? '+' : ''}
                  {formatKg(r.delta)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
