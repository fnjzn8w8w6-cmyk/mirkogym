/**
 * Coach adattivo: conta solo l'obiettivo finale (peso e % di grasso). Le fasi sono una conseguenza di come rispondi davvero.
 * 1) Dai tuoi dati (pesate, misure della massa grassa dei check-in) stima quanta massa magra e quanto grasso stai mettendo
 *    o perdendo, e quindi la tua risposta personale rispetto alla media.
 * 2) Ogni settimana ripianifica il percorso più rapido da oggi all'obiettivo: massa pulita, ricomposizione, definizione.
 *    La massa non ha un peso fisso: finisce quando hai il muscolo che serve.
 * 3) Propone il percorso aggiornato (si applica solo con la tua conferma) con una forchetta per la data di arrivo.
 */
import type { BodyLog } from '@/types';
import type { GoalPhase, GoalPlan } from './goal-plan';
import type { UserProfile } from './metabolism';
import { BULK_MAX, LEAN_SHARE, compOf, fromLean, leanGainPerWeek, minBf, type Comp } from './goal-feasibility';
import { robustSlope, settledFrom, weightTrend } from './body-model';
import { fromBmi } from './bodyfat-estimate';
import { toISODate } from './date-utils';

const DAY = 86400000;
const WEEK = 7 * DAY;
const r1 = (v: number) => Math.round(v * 10) / 10;
const itKg = (v: number) => r1(v).toString().replace('.', ',');
const pct = (v: number) => `${Math.round(v)}%`;
const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();
const iso = (t: number) => toISODate(new Date(t));
const fmtMonth = (t: number) => new Date(t).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

/** Obiettivo finale: l'unica cosa che conta. */
export interface GoalTarget {
  weight: number;
  bf: number;
  /** data desiderata (facoltativa): il coach dice se è realistica */
  date?: string;
  /** da dove sei partito (per l'avanzamento) */
  start?: { weight: number; bf: number; date: string };
}

/* ---------- 1) Come rispondi davvero ---------- */

export interface Response {
  /** settimane osservate (dopo la prima settimana di assestamento) */
  weeks: number;
  /** misure della massa grassa usate */
  bfPoints: number;
  /** kg a settimana (robusto) */
  weightRate: number | null;
  leanRate: number | null;
  fatRate: number | null;
  /** quota di massa magra sul peso che prendi (la media è 55%), già mescolata alla media secondo la fiducia */
  pRatio: number;
  /** ritmo del muscolo rispetto alla stima per il tuo profilo (1 = come previsto) */
  k: number;
  /** quanto il coach si fida dei tuoi dati (0–0,8): servono più misure della massa grassa distanziate */
  confidence: number;
}

/** Ultime 12 settimane: andamento di peso, massa magra e grasso dalle pesate e dalle misure della massa grassa. */
export function observeResponse(p: UserProfile, logs: BodyLog[], now = Date.now()): Response {
  const settled = settledFrom(logs) ?? '';
  const last = iso(now - 84 * DAY);
  const from = settled > last ? settled : last;
  const trend = weightTrend(
    logs.filter((l) => l.date >= from),
    now,
  );
  const wPts = trend.filter((x) => x.weight != null).map((x) => ({ t: x.t, w: x.weight! }));
  const spanW = wPts.length ? (wPts[wPts.length - 1].t - wPts[0].t) / WEEK : 0;
  const weightRate = wPts.length >= 4 && spanW >= 2 ? (robustSlope(wPts) ?? 0) * 7 : null;
  // massa magra a ogni misura della massa grassa (peso di tendenza di quel giorno: meno acqua di giornata)
  const trendAt = new Map(trend.map((x) => [x.date, x.trend]));
  const bf = logs
    .filter((l) => l.bodyFat != null && l.date >= from && !fromBmi(l))
    .map((l) => {
      const w = trendAt.get(l.date) ?? l.weight;
      return w ? { t: ts(l.date), lean: w * (1 - (l.bodyFat as number) / 100) } : null;
    })
    .filter((x): x is { t: number; lean: number } => x != null)
    .sort((a, b) => a.t - b.t);
  const spanBf = bf.length ? (bf[bf.length - 1].t - bf[0].t) / WEEK : 0;
  const leanRate = bf.length >= 3 && spanBf >= 3 ? (robustSlope(bf.map((x) => ({ t: x.t, w: x.lean }))) ?? 0) * 7 : null;
  const fatRate = leanRate != null && weightRate != null ? weightRate - leanRate : null;
  // fiducia: cresce con il numero di misure e le settimane coperte (una foto sbaglia di ±2–3%)
  const confidence = leanRate == null ? 0 : Math.min(0.8, Math.max(0, (bf.length - 2) / 4) * Math.min(1, spanBf / 8));
  let pRatio = LEAN_SHARE;
  let k = 1;
  if (leanRate != null && weightRate != null && weightRate > 0.05) {
    const pObs = Math.max(0.05, Math.min(0.95, leanRate / weightRate));
    pRatio = LEAN_SHARE + confidence * (pObs - LEAN_SHARE);
  }
  if (leanRate != null && (weightRate ?? 0) > -0.05) {
    const predicted = leanGainPerWeek(p, bf[0].lean);
    const kObs = Math.max(0.3, Math.min(2.5, leanRate / predicted));
    k = 1 + confidence * (kObs - 1);
  }
  return { weeks: Math.round(Math.max(spanW, spanBf)), bfPoints: bf.length, weightRate, leanRate, fatRate, pRatio, k, confidence };
}

/* ---------- 2) Percorso più rapido verso l'obiettivo ---------- */

export type Mode = 'bulk' | 'recomp' | 'cut' | 'maintain';
export interface Segment {
  mode: Mode;
  weeks: number;
  from: Comp;
  to: Comp;
}
export interface Path {
  segments: Segment[];
  weeks: number;
  end: Comp;
}

const MODE_LABEL: Record<Mode, string> = { bulk: 'Massa pulita', recomp: 'Ricomposizione', cut: 'Definizione', maintain: 'Mantenimento' };
export const modeLabel = (m: Mode) => MODE_LABEL[m];
/** Tetto di grasso in massa: oltre conviene fermarsi e definire prima. */
const bfCeiling = (p: UserProfile) => (p.sex === 'f' ? 32 : 22);
const cutRate = (p: UserProfile, bf: number) => (bf < (p.sex === 'f' ? 20 : 12) ? 0.005 : 0.007);

interface Params {
  k: number;
  pRatio: number;
}

/** Una settimana di massa pulita: il peso sale quanto serve al muscolo che metti (secondo la tua risposta). */
function bulkWeek(p: UserProfile, c: Comp, x: Params): Comp {
  const g = leanGainPerWeek(p, c.lean) * x.k;
  const dw = Math.min(g / x.pRatio, c.weight * BULK_MAX);
  return fromLean(c.lean + Math.min(g, dw * 0.95), c.weight + dw);
}
/** Una settimana di ricomposizione (calorie di mantenimento): un po' di muscolo al posto del grasso. */
function recompWeek(p: UserProfile, c: Comp, x: Params): Comp {
  const g = leanGainPerWeek(p, c.lean) * x.k * (c.bf > (p.sex === 'f' ? 28 : 18) ? 0.5 : 0.35);
  return fromLean(c.lean + g, c.weight);
}
/** Una settimana di definizione: si scende mantenendo la massa magra. */
const cutWeek = (p: UserProfile, c: Comp): Comp => fromLean(c.lean, c.weight * (1 - cutRate(p, c.bf)));

/** Simula una strategia: le modalità in ordine, ognuna finché la sua condizione di arrivo non è raggiunta. */
function simulate(p: UserProfile, start: Comp, g: GoalTarget, plan: Mode[], x: Params): Path | null {
  const needLean = g.weight * (1 - g.bf / 100);
  const segments: Segment[] = [];
  let c = start;
  let total = 0;
  for (const mode of plan) {
    const from = c;
    let w = 0;
    const done = (cc: Comp) => {
      if (mode === 'bulk') return cc.lean >= needLean - 0.2;
      if (mode === 'recomp') return cc.lean >= needLean - 0.2 || cc.bf <= g.bf + 0.5;
      // definizione: fino al grasso obiettivo (o, in una definizione intermedia, a 2 punti sopra)
      return cc.bf <= (mode === 'cut' && plan.indexOf('cut') < plan.lastIndexOf('cut') && segments.every((s) => s.mode !== 'bulk') ? g.bf + 2 : g.bf) + 0.05;
    };
    while (!done(c) && w < 260) {
      c = mode === 'bulk' ? bulkWeek(p, c, x) : mode === 'recomp' ? recompWeek(p, c, x) : cutWeek(p, c);
      w++;
      if (mode === 'bulk' && c.bf > bfCeiling(p)) return null;
      if (mode === 'cut' && c.bf < minBf(p)) return null;
    }
    if (w >= 260) return null;
    if (w > 0) segments.push({ mode, weeks: w, from, to: c });
    total += w;
  }
  // arrivo: peso e grasso finali entro tolleranza
  if (c.bf > g.bf + 0.6 || c.lean < needLean - 0.6) return null;
  return { segments, weeks: total, end: c };
}

/** Il percorso più rapido tra le strategie possibili (massa → definizione, ricomposizione → ..., definizione → massa → definizione). */
export function bestPath(p: UserProfile, now: Comp, g: GoalTarget, x: Params): Path | null {
  const needLean = g.weight * (1 - g.bf / 100);
  const options: Mode[][] = [];
  if (now.lean >= needLean - 0.2) options.push(['cut']);
  else {
    options.push(['bulk', 'cut']);
    if (now.bf > g.bf + 2) {
      options.push(['recomp', 'bulk', 'cut']);
      options.push(['cut', 'bulk', 'cut']);
    }
  }
  let best: Path | null = null;
  for (const o of options) {
    const r = simulate(p, now, g, o, x);
    // a parità di tempo (±2 settimane) meglio meno cambi di peso
    if (r && (!best || r.weeks < best.weeks - 2 || (r.weeks <= best.weeks + 2 && r.segments.length < best.segments.length))) best = r;
  }
  // già all'obiettivo: mantenimento
  if (best && best.weeks === 0) return { segments: [{ mode: 'maintain', weeks: 4, from: now, to: now }], weeks: 0, end: now };
  return best;
}

export interface CoachPlan {
  path: Path;
  /** forchetta della data di arrivo (ottimista, centrale, pessimista) */
  early: number;
  mid: number;
  late: number;
  response: Response;
  now: Comp;
  goal: GoalTarget;
}

/** Percorso con la forchetta: più larga finché il coach non conosce la tua risposta. */
export function coachPlan(p: UserProfile, now: Comp, goal: GoalTarget, response: Response, today = Date.now()): CoachPlan | null {
  const base = { k: response.k, pRatio: response.pRatio };
  const path = bestPath(p, now, goal, base);
  if (!path) return null;
  // incertezza: più ampia finché il coach non conosce la tua risposta
  const u = 1 - response.confidence / 0.8;
  const dk = 0.2 * u + 0.08;
  const dp = 0.08 * u + 0.03;
  const opt = bestPath(p, now, goal, { k: base.k * (1 + dk), pRatio: Math.min(0.95, base.pRatio + dp) });
  const pes = bestPath(p, now, goal, { k: base.k * (1 - dk), pRatio: Math.max(0.25, base.pRatio - dp) });
  const mid = today + path.weeks * WEEK;
  return {
    path,
    early: Math.min(mid, today + (opt?.weeks ?? path.weeks) * WEEK),
    mid,
    late: Math.max(mid, today + (pes?.weeks ?? Math.round(path.weeks * 1.4)) * WEEK),
    response,
    now,
    goal,
  };
}

/** Le fasi del piano (usate da calorie, stato e grafico) dal percorso del coach. */
export function pathToPhases(path: Path, today = Date.now()): GoalPhase[] {
  let start = iso(today);
  return path.segments.map((s) => {
    const end = iso(ts(start) + s.weeks * WEEK);
    const ph: GoalPhase = {
      type: s.mode === 'bulk' ? 'bulk' : s.mode === 'cut' ? 'cut' : 'maintain',
      label: MODE_LABEL[s.mode],
      start,
      end,
      startWeight: r1(s.from.weight),
      weightMin: r1(s.to.weight - 0.5),
      weightMax: r1(s.to.weight + 0.5),
      targetBf: s.mode === 'bulk' ? Math.ceil(s.to.bf) : Math.round(s.to.bf),
    };
    start = end;
    return ph;
  });
}

/** Perché il coach ha scelto la fase di adesso (una frase). */
export function whyNow(cp: CoachPlan): string {
  const s = cp.path.segments[0];
  const needLean = cp.goal.weight * (1 - cp.goal.bf / 100);
  const missing = needLean - cp.now.lean;
  if (!s || s.mode === 'maintain') return 'Sei all’obiettivo: calorie di mantenimento per consolidare.';
  if (s.mode === 'bulk')
    return `Ti mancano circa ${itKg(missing)} kg di massa magra: massa pulita finché non ci arrivi (circa ${itKg(s.to.weight)} kg), poi definizione.`;
  if (s.mode === 'recomp') return `Hai grasso da perdere e muscolo da mettere: ricomposizione a calorie di mantenimento, il peso resta stabile.`;
  return missing > 0.3
    ? `Hai grasso in eccesso: definizione fino a circa ${itKg(s.to.weight)} kg al ${pct(s.to.bf)}, poi massa pulita.`
    : `Hai già il muscolo che serve: definizione fino a ${itKg(cp.goal.weight)} kg al ${pct(cp.goal.bf)}.`;
}

/** Cosa ha visto il coach nei tuoi dati (una frase). */
export function whatISee(r: Response): string {
  if (r.leanRate == null || r.weightRate == null)
    return r.bfPoints < 3
      ? `Per conoscere la tua risposta servono almeno 3 misure della massa grassa in 3 settimane (ora ${r.bfPoints}): fai la foto a ogni check-in. Intanto uso la media.`
      : 'Servono qualche settimana in più di pesate e misure: intanto uso la media.';
  const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')}`;
  const share = r.weightRate > 0.05 ? ` (${Math.round(Math.max(0, Math.min(1, r.leanRate / r.weightRate)) * 100)}% massa magra, la media è 55%)` : '';
  return `Nelle ultime ${r.weeks} settimane: peso ${sign(r.weightRate)} kg/sett, massa magra ${sign(r.leanRate)}, grasso ${sign(r.fatRate ?? 0)}${share}. Fiducia nei tuoi dati: ${Math.round((r.confidence / 0.8) * 100)}%.`;
}

/** Forchetta della data in parole. */
export function etaText(cp: CoachPlan): string {
  const a = fmtMonth(cp.early);
  const b = fmtMonth(cp.late);
  return a === b ? `a ${a}` : `tra ${a} e ${b}`;
}

/** Obiettivo finale ricavato da un piano a fasi (conversione dei piani vecchi). */
export function targetFromPlan(plan: GoalPlan): GoalTarget | null {
  if (plan.target) return plan.target;
  const last = plan.phases[plan.phases.length - 1];
  if (!last || last.targetBf == null) return null;
  return { weight: r1((last.weightMin + last.weightMax) / 2), bf: last.targetBf, date: last.end };
}

/**
 * Proposta del coach: il percorso ricalcolato dai dati reali, se cambia qualcosa che conta
 * (fase di adesso, data di arrivo di almeno 3 settimane, peso di fine massa di almeno 1,5 kg). Si applica solo con conferma.
 */
export function coachProposal(
  p: UserProfile,
  now: Comp,
  plan: GoalPlan,
  logs: BodyLog[],
  today = Date.now(),
): { id: string; title: string; detail: string; phases: GoalPhase[]; target: GoalTarget; summary: string } | null {
  const target = targetFromPlan(plan);
  if (!target) return null;
  const cp = coachPlan(p, now, target, observeResponse(p, logs, today), today);
  if (!cp) return null;
  const rest = plan.phases.slice(plan.current);
  const cur = rest[0];
  const last = plan.phases[plan.phases.length - 1];
  const next = cp.path.segments[0];
  const modeOf = (t: string) => (t === 'bulk' || t === 'strength' ? 'bulk' : t === 'cut' ? 'cut' : 'recomp');
  const changedMode = !cur || !next || modeOf(cur.type) !== (next.mode === 'maintain' ? 'recomp' : next.mode);
  const diffWeeks = last ? Math.round((cp.mid - ts(last.end)) / WEEK) : 99;
  const peakNew = cp.path.segments.find((s) => s.mode === 'bulk')?.to.weight;
  const peakOld = rest.find((x) => x.type === 'bulk');
  const peakDiff = peakNew != null && peakOld ? Math.abs(peakNew - (peakOld.weightMin + peakOld.weightMax) / 2) : 0;
  const converted = !plan.target;
  if (!converted && !changedMode && Math.abs(diffWeeks) < 3 && peakDiff < 1.5) return null;
  const steps = cp.path.segments.map((s) => `${MODE_LABEL[s.mode].toLowerCase()} ${s.weeks} sett. (fino a ${itKg(s.to.weight)} kg al ${pct(s.to.bf)})`).join(', poi ');
  const title = converted
    ? `Coach adattivo: obiettivo unico ${itKg(target.weight)} kg al ${pct(target.bf)}`
    : changedMode
      ? `Cambio di fase: ${MODE_LABEL[next.mode].toLowerCase()}`
      : diffWeeks < 0
        ? `Vai più veloce del previsto: arrivo ${etaText(cp)}`
        : `Percorso aggiornato: arrivo ${etaText(cp)}`;
  const detail = `${whatISee(cp.response)} ${whyNow(cp)} Percorso: ${steps}. Arrivo stimato ${etaText(cp)}.${target.date ? ` Data desiderata: ${fmtDate(target.date)}.` : ''}`;
  return {
    id: `coach-${cp.path.segments.map((s) => `${s.mode}${s.weeks}`).join('-')}-${iso(cp.mid)}`,
    title,
    detail,
    phases: pathToPhases(cp.path, today),
    target,
    summary: `${title}. ${whyNow(cp)}`,
  };
}

/** Testo per il coach (chat, check-in): obiettivo finale, fase di adesso, risposta reale e arrivo stimato. */
export function goalCoachText(p: UserProfile, plan: GoalPlan, logs: BodyLog[]): string | null {
  const target = targetFromPlan(plan);
  if (!target) return null;
  const bfLog = logs.find((l) => l.bodyFat != null && !fromBmi(l));
  const now = compOf(p.weightKg, p.bodyFatPct ?? bfLog?.bodyFat ?? 18);
  const cp = coachPlan(p, now, target, observeResponse(p, logs));
  if (!cp) return `COACH ADATTIVO: obiettivo finale ${target.weight} kg al ${target.bf}%: nessun percorso realistico trovato.`;
  return `COACH ADATTIVO (calcolato dall'app, NON proporre altre fasi o date): obiettivo finale ${target.weight} kg al ${target.bf}%. ${whyNow(cp)} Arrivo stimato ${etaText(cp)}. ${whatISee(cp.response)}`;
}

export { compOf };
