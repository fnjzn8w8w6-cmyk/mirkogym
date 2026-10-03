import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, TrendingDown } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { settle } from '@/lib/firestore';
import { adaptiveCalories } from '@/lib/coach';
import { bfCategory, composition, type UserProfile } from '@/lib/metabolism';
import { formatKg } from '@/lib/analytics';
import { formatRelativeDay, fromISODate } from '@/lib/date-utils';
import { cn } from '@/lib/cn';
import { planRate } from '@/lib/goal-plan';
import { SectionTitle } from '@/components/ui/Help';
import type { BodyLog } from '@/types';

/** Profilo con l'ultimo peso e l'ultima massa grassa registrati. */
function useCurrentProfile(): { p: UserProfile | null; bfDate: string | null } {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const prof = settings.profile;
    if (!prof) return { p: null, bfDate: null };
    const w = bodyLogs.find((b) => b.weight != null);
    const bf = bodyLogs.find((b) => b.bodyFat != null);
    return { p: { ...prof, weightKg: w?.weight ?? prof.weightKg, bodyFatPct: bf?.bodyFat ?? prof.bodyFatPct }, bfDate: bf?.date ?? null };
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
          <stop offset="1" stopColor="#8B5CF6" />
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
  const { p, bfDate } = useCurrentProfile();
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
          BMI {formatKg(c.bmi)} · {bfDate ? `massa grassa misurata ${formatRelativeDay(fromISODate(bfDate)).toLowerCase()}` : 'massa grassa stimata dal questionario'}
        </span>
      </div>
    </Card>
  );
}

const fmtRate = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} kg`;

/** Avviso sull'andamento: nell'obiettivo, leggermente fuori (e come recuperare) o dati insufficienti. */
export function GoalStatus() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const toast = useToast();
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
  const adjust = settings.kcalAdjust ?? 0;
  return (
    <Card className={cn('flex gap-3 p-4', ok ? 'border-success/40 bg-success-bg' : 'border-warning/40 bg-warning-bg')}>
      {ok ? <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden /> : cutting && a.actual > a.expected ? <AlertTriangle className="h-6 w-6 shrink-0 text-warning" aria-hidden /> : <TrendingDown className="h-6 w-6 shrink-0 text-warning" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-fg">
          <SectionTitle help="body-status">{title}</SectionTitle>
        </div>
        <p className="text-sm text-fg-2">
          {settings.metabolism && !ok
            ? `Peso reale ${fmtRate(a.actual)} a settimana contro ${fmtRate(a.expected)} atteso. Le calorie si correggono già da sole ogni giorno (metabolismo reale ${settings.metabolism.tdee} kcal).`
            : text}
        </p>
        <p className="mt-1 text-xs text-fg-3">
          Basato su {a.points} pesate in {a.days} giorni.
        </p>
        {!ok && !settings.metabolism && (
          <Button
            className="mt-2"
            size="sm"
            onClick={() => {
              void settle(update({ kcalAdjust: Math.max(-600, Math.min(600, adjust + a.suggestion)) }));
              toast.success('Calorie aggiornate');
            }}
          >
            Applica {a.suggestion > 0 ? '+' : ''}
            {a.suggestion} kcal
          </Button>
        )}
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
