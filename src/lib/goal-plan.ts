/**
 * Obiettivo a fasi con scadenza (es. massa fino a 83 kg / 17% → cut fino a 79 kg / 10%).
 * - L'AI interpreta la richiesta libera in fasi; l'app controlla che i ritmi siano sicuri.
 * - Il ritmo necessario (kg/settimana) determina le calorie: 1 kg/sett ≈ 1100 kcal/giorno.
 * - Ogni settimana si confronta il peso reale (tendenza) con il percorso previsto.
 */
import type { BodyLog, FoodLog } from '@/types';
import { callAIJson, num, oneOf, str, type AIOptions } from './ai';
import { GOALS, type Goal, type UserProfile } from './metabolism';
import { toISODate } from './date-utils';
import { realWeight } from './body-model';

const DAY = 86400000;
const WEEK = 7 * DAY;
/** kcal al giorno per 1 kg/settimana di variazione di peso (7700 kcal/kg ÷ 7) */
export const KCAL_PER_KG_WEEK = 1100;

export interface GoalPhase {
  type: Goal;
  label: string;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  startWeight: number;
  weightMin: number;
  weightMax: number;
  targetBf?: number;
  /** nota del coach (es. data spostata perché il ritmo richiesto non era sicuro) */
  note?: string;
  doneAt?: string;
}
export interface GoalPlan {
  text: string;
  createdAt: number;
  summary: string;
  phases: GoalPhase[];
  current: number;
}

export const PHASE_EMOJI: Record<Goal, string> = { bulk: '💪', cut: '🔥', maintain: '⚖️', strength: '🏋️' };
export const phaseName = (t: Goal) => GOALS.find((g) => g.value === t)?.label ?? t;
export const targetWeight = (p: GoalPhase) => (p.weightMin + p.weightMax) / 2;

/** Ritmi sicuri in % del peso a settimana: [minimo sensato, consigliato, massimo]. */
const RATES: Record<Goal, [number, number, number]> = {
  bulk: [0.001, 0.0025, 0.005],
  strength: [0.0005, 0.0015, 0.004],
  cut: [0.0025, 0.007, 0.01],
  maintain: [0, 0, 0],
};

/** Settimane consigliate per passare da un peso all'altro con il ritmo consigliato. */
export function recommendedWeeks(type: Goal, from: number, to: number): number {
  const diff = Math.abs(to - from);
  if (type === 'maintain' || diff < 0.3) return 8;
  return Math.max(4, Math.ceil(diff / (from * RATES[type][1])));
}
const minWeeks = (type: Goal, from: number, to: number) => {
  const diff = Math.abs(to - from);
  return type === 'maintain' || diff < 0.3 ? 1 : Math.max(2, Math.ceil(diff / (from * RATES[type][2])));
};

const addWeeks = (iso: string, w: number) => toISODate(new Date(new Date(`${iso}T12:00:00`).getTime() + Math.round(w * 7) * DAY));
const weeksBetween = (a: string, b: string) => (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / WEEK;

/* ---------- Interpretazione della richiesta (1 richiesta AI) ---------- */

interface RawPhase {
  type: Goal;
  label: string;
  weightMin: number;
  weightMax: number;
  targetBf?: number;
  end?: string;
  weeks?: number;
}

export async function interpretGoal(
  text: string,
  profile: UserProfile,
  current: { weight: number; bf?: number },
  opts: AIOptions = {},
): Promise<GoalPlan> {
  const today = toISODate(new Date());
  const raw = await callAIJson(
    `Sei un coach di bodybuilding e nutrizione. Trasforma l'obiettivo descritto dall'utente in un piano a fasi.
Oggi è ${today}. Utente: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, ${profile.heightCm} cm, peso attuale ${current.weight} kg${current.bf ? `, massa grassa ~${current.bf}%` : ''}, livello ${profile.experience}.
OBIETTIVO DELL'UTENTE: """${text.slice(0, 800)}"""
Regole:
- Ogni fase ha "type": "bulk" (massa), "cut" (definizione), "maintain" (mantenimento/ricomposizione) o "strength" (forza).
- "weightMin"/"weightMax": peso obiettivo di fine fase (se l'utente dà un solo numero usa lo stesso valore; se non lo dà stimalo dalla massa grassa obiettivo mantenendo la massa magra).
- "targetBf": massa grassa obiettivo in % se indicata o deducibile, altrimenti null.
- "end": data di fine fase YYYY-MM-DD SOLO se l'utente indica una data o una durata, altrimenti null. "weeks": durata in settimane se indicata, altrimenti null.
- Ordina le fasi nell'ordine in cui vanno fatte, la prima parte da oggi.
- "summary": 2 frasi in italiano che riassumono il piano.
Rispondi SOLO con JSON: {"phases":[{"type":"bulk","label":"Massa pulita","weightMin":82,"weightMax":83,"targetBf":17,"end":null,"weeks":null}],"summary":""}`,
    (r) => r as { phases?: unknown; summary?: unknown },
    { prefer: 'flash', temperature: 0.2, label: 'Il coach costruisce il tuo piano…', ...opts },
  );
  const phases: RawPhase[] = (Array.isArray(raw.phases) ? raw.phases : [])
    .slice(0, 4)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const a = num(o.weightMin, 35, 250);
      const b = num(o.weightMax, 35, 250) ?? a;
      const end = typeof o.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.end) && o.end > today ? o.end : undefined;
      return {
        type: oneOf(o.type, ['bulk', 'cut', 'maintain', 'strength'] as const) ?? 'maintain',
        label: str(o.label, 40),
        weightMin: Math.min(a ?? current.weight, b ?? current.weight),
        weightMax: Math.max(a ?? current.weight, b ?? current.weight),
        targetBf: num(o.targetBf, 4, 40),
        end,
        weeks: num(o.weeks, 1, 104),
      };
    });
  if (!phases.length) throw new Error('Non ho capito l’obiettivo: prova a indicare peso e/o massa grassa da raggiungere');
  return buildPlan(text, str(raw.summary, 400), phases, current.weight, today);
}

/** Calcola date e controlla i ritmi: se una scadenza non è sicura la sposta e lo spiega. */
export function buildPlan(text: string, summary: string, phases: RawPhase[], weight: number, today = toISODate(new Date())): GoalPlan {
  let start = today;
  let from = weight;
  const out: GoalPhase[] = phases.map((p) => {
    const to = (p.weightMin + p.weightMax) / 2;
    const rec = recommendedWeeks(p.type, from, to);
    const min = minWeeks(p.type, from, to);
    let weeks = p.end ? weeksBetween(start, p.end) : p.weeks ?? rec;
    let note: string | undefined;
    if (weeks < min) {
      note = `La scadenza richiesta era troppo stretta: con un ritmo sicuro servono almeno ${min} settimane, ho spostato la data.`;
      weeks = Math.max(min, rec);
    }
    const phase: GoalPhase = {
      type: p.type,
      label: p.label || phaseName(p.type),
      start,
      end: addWeeks(start, weeks),
      startWeight: Math.round(from * 10) / 10,
      weightMin: p.weightMin,
      weightMax: p.weightMax,
      ...(p.targetBf ? { targetBf: p.targetBf } : {}),
      ...(note ? { note } : {}),
    };
    start = phase.end;
    from = to;
    return phase;
  });
  return { text, summary, phases: out, current: 0, createdAt: Date.now() };
}

/** Ricalcola le date delle fasi successive dopo una modifica (es. data spostata). */
export function reflow(plan: GoalPlan): GoalPlan {
  const phases = [...plan.phases];
  for (let i = plan.current + 1; i < phases.length; i++) {
    const prev = phases[i - 1];
    const dur = Math.max(1, weeksBetween(phases[i].start, phases[i].end));
    phases[i] = { ...phases[i], start: prev.end, end: addWeeks(prev.end, dur), startWeight: Math.round(targetWeight(prev) * 10) / 10 };
  }
  return { ...plan, phases };
}

/* ---------- Andamento rispetto al piano ---------- */

/** Peso di tendenza: media delle pesate degli ultimi 7 giorni (più stabile della singola pesata). */
export function trendWeight(logs: BodyLog[], fallback: number): number {
  return realWeight(logs, fallback);
}

export interface PlanStatus {
  phase: GoalPhase;
  index: number;
  current: number;
  bf?: number;
  /** kg/settimana necessari da oggi alla scadenza (già limitati ai ritmi sicuri) */
  rate: number;
  rawRate: number;
  weeksLeft: number;
  /** peso previsto oggi sul percorso lineare inizio → fine */
  expectedToday: number;
  /** settimane di anticipo (+) o ritardo (−) rispetto al percorso */
  weeksOff: number;
  state: 'reached' | 'on-track' | 'ahead' | 'behind' | 'late' | 'expired';
  /** se il ritmo necessario non è sicuro: data realistica proposta */
  suggestedEnd?: string;
  progress: number;
  /** in massa: massa grassa sopra il tetto indicato (conviene anticipare il cut) */
  bfOver?: boolean;
}

export function planStatus(plan: GoalPlan, logs: BodyLog[], fallbackWeight: number, now = Date.now()): PlanStatus | null {
  const phase = plan.phases[plan.current];
  if (!phase) return null;
  const current = trendWeight(logs, fallbackWeight);
  const bf = logs.find((l) => l.bodyFat != null)?.bodyFat;
  const to = targetWeight(phase);
  const t0 = new Date(`${phase.start}T12:00:00`).getTime();
  const t1 = new Date(`${phase.end}T12:00:00`).getTime();
  const weeksLeft = Math.max(0, (t1 - now) / WEEK);
  const dir = Math.sign(to - phase.startWeight);
  const total = to - phase.startWeight;
  const progress = total === 0 ? 1 : Math.max(0, Math.min(1, (current - phase.startWeight) / total));
  const expectedToday = phase.startWeight + total * Math.max(0, Math.min(1, (now - t0) / Math.max(1, t1 - t0)));
  const plannedRate = total / Math.max(0.5, (t1 - t0) / WEEK);
  const [, , maxPct] = RATES[phase.type];
  const rawRate = weeksLeft > 0.5 ? (to - current) / weeksLeft : to - current;
  const rate = dir === 0 ? 0 : Math.sign(rawRate) * Math.min(Math.abs(rawRate), current * maxPct);
  const weightOk = phase.type === 'cut' ? current <= phase.weightMax : phase.type === 'bulk' ? current >= phase.weightMin : Math.abs(current - to) <= 1;
  const bfOk = phase.targetBf == null || bf == null || (phase.type === 'cut' ? bf <= phase.targetBf + 1 : true);
  const weeksOff = plannedRate !== 0 ? Math.round(((current - expectedToday) / plannedRate) * 10) / 10 : 0;
  let state: PlanStatus['state'];
  let suggestedEnd: string | undefined;
  if (weightOk && bfOk) state = 'reached';
  else if (now > t1) state = 'expired';
  else if (Math.abs(rawRate) > current * maxPct * 1.05 && Math.sign(rawRate) === dir) {
    state = 'late';
    suggestedEnd = toISODate(new Date(now + (Math.abs(to - current) / (current * RATES[phase.type][1])) * WEEK));
  } else if (Math.abs(current - expectedToday) <= 0.5) state = 'on-track';
  else state = (current - expectedToday) * dir > 0 ? 'ahead' : 'behind';
  const bfOver = phase.type !== 'cut' && phase.targetBf != null && bf != null && bf > phase.targetBf + 1;
  return { phase, index: plan.current, current, bf, rate, rawRate, weeksLeft, expectedToday, weeksOff, state, suggestedEnd, progress: state === 'reached' ? 1 : progress, bfOver };
}

/** Variazione di peso settimanale prevista per la fase attiva (per calorie e controlli). */
export function planRate(plan: GoalPlan | null | undefined, logs: BodyLog[], fallbackWeight: number): number | null {
  if (!plan) return null;
  const st = planStatus(plan, logs, fallbackWeight);
  if (!st || st.state === 'reached') return st ? 0 : null;
  return Math.round(st.rate * 100) / 100;
}

/* ---------- Fabbisogno reale dal diario ---------- */

/**
 * Fabbisogno reale stimato: calorie medie mangiate − variazione di peso × 7700.
 * Serve un diario abbastanza completo (≥ 10 giornate da almeno 1000 kcal negli ultimi 21 giorni) e ≥ 4 pesate.
 */
export function estimateTdee(foodLogs: FoodLog[], bodyLogs: BodyLog[], now = Date.now()): { tdee: number; days: number } | null {
  const from = now - 21 * DAY;
  const kcal = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.kcal * e.qty) / 100 : e.per.kcal * e.qty), 0);
  const days = foodLogs.filter((l) => new Date(`${l.date}T12:00:00`).getTime() >= from).map(kcal).filter((k) => k >= 1000);
  const pts = bodyLogs
    .filter((l) => l.weight != null && new Date(l.date).getTime() >= from)
    .map((l) => ({ x: new Date(l.date).getTime() / DAY, y: l.weight as number }));
  if (days.length < 10 || pts.length < 4) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den;
  const intake = days.reduce((a, b) => a + b, 0) / days.length;
  return { tdee: Math.round((intake - slope * 7700) / 10) * 10, days: days.length };
}

/** Testo del piano per la memoria del coach. */
export function planText(plan: GoalPlan, st: PlanStatus | null): string {
  const phases = plan.phases
    .map(
      (p, i) =>
        `${i + 1}) ${p.label} (${phaseName(p.type)}) ${p.start} → ${p.end}: da ${p.startWeight} a ${p.weightMin === p.weightMax ? p.weightMin : `${p.weightMin}-${p.weightMax}`} kg${p.targetBf ? `, massa grassa ${p.targetBf}%` : ''}${i === plan.current ? ' [IN CORSO]' : p.doneAt ? ' [completata]' : ''}`,
    )
    .join('; ');
  const s = st
    ? `${st.bfOver ? ` ATTENZIONE: massa grassa ${st.bf}% sopra il tetto della fase.` : ''} Stato fase attuale: peso di tendenza ${st.current} kg (previsto oggi ${st.expectedToday.toFixed(1)}), ${STATE_LABEL[st.state]}, ritmo necessario ${st.rate >= 0 ? '+' : ''}${st.rate.toFixed(2)} kg/sett, ${Math.round(st.weeksLeft)} settimane alla scadenza.`
    : '';
  return `OBIETTIVO A FASI (richiesta: "${plan.text.slice(0, 200)}"): ${phases}.${s}`;
}

export const STATE_LABEL: Record<PlanStatus['state'], string> = {
  reached: 'obiettivo della fase raggiunto',
  'on-track': 'in linea',
  ahead: 'in anticipo',
  behind: 'in ritardo',
  late: 'scadenza non raggiungibile con un ritmo sicuro',
  expired: 'scadenza superata',
};
