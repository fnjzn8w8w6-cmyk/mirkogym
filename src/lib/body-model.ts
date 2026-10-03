/**
 * Modello del corpo: peso reale (tendenza), acqua vs grasso, metabolismo reale e previsione.
 * Tutto calcolato sul telefono dai dati che già registri (pesate e diario).
 */
import type { BodyLog, FoodLog, Session } from '@/types';
import { toISODate } from './date-utils';

const DAY = 86400000;
/** Reattività della media mobile esponenziale (0,15 ≈ "memoria" di circa 10 giorni). */
const ALPHA = 0.15;

const dayKey = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

export interface TrendPoint {
  date: string;
  t: number;
  /** pesata del giorno (se c'è) */
  weight?: number;
  /** peso reale (tendenza) */
  trend: number;
}

/** Peso reale giorno per giorno: media mobile esponenziale delle pesate (ignora gli sbalzi). */
export function weightTrend(logs: BodyLog[], until = Date.now()): TrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const l of logs) if (l.weight != null) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l.weight]);
  const days = [...byDay.keys()].sort();
  if (!days.length) return [];
  const out: TrendPoint[] = [];
  let trend = avg(byDay.get(days[0])!);
  for (let t = dayKey(days[0]); t <= until; t += DAY) {
    const date = toISODate(new Date(t));
    const w = byDay.get(date);
    if (w) trend += ALPHA * (avg(w) - trend);
    out.push({ date, t, trend: round1(trend), ...(w ? { weight: avg(w) } : {}) });
  }
  return out;
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const round1 = (v: number) => Math.round(v * 10) / 10;
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Peso reale di oggi. */
export function realWeight(logs: BodyLog[], fallback: number): number {
  const tr = weightTrend(logs);
  return tr.length ? tr[tr.length - 1].trend : fallback;
}

/* ---------- Diario ---------- */

const macrosOf = (l: FoodLog) =>
  l.entries.reduce(
    (a, e) => {
      const k = e.unit === 'g' ? e.qty / 100 : e.qty;
      return { kcal: a.kcal + e.per.kcal * k, carbs: a.carbs + e.per.carbs * k };
    },
    { kcal: 0, carbs: 0 },
  );

/** Giornate complete del diario: segnate come complete e non troppo sotto il tuo solito. */
export function completeDays(foodLogs: FoodLog[]) {
  const logged = foodLogs.filter((l) => l.entries.length).map((l) => ({ date: l.date, ...macrosOf(l), recap: l.recap }));
  const med = median(logged.map((d) => d.kcal));
  return logged.filter((d) => d.recap?.complete !== false && d.kcal >= med * 0.6 && d.kcal >= 800);
}

/* ---------- Acqua o grasso? ---------- */

export interface WaterEvent {
  date: string;
  /** kg sopra il peso reale */
  delta: number;
  /** grasso reale stimato in kg (dal surplus calorico) */
  fat: number;
  reason: string;
}

/**
 * Pesate "gonfiate": sopra il peso reale di almeno 0,6 kg dopo 1–2 giorni con molti carboidrati,
 * uno sgarro, calorie molto sopra il solito o un allenamento gambe pesante.
 */
export function waterEvents(
  logs: BodyLog[],
  foodLogs: FoodLog[],
  sessions: Session[],
  target: number | null,
  groupOf?: (l: Session['logs'][number]) => string,
  now = Date.now(),
): WaterEvent[] {
  const tr = weightTrend(logs, now);
  const food = new Map(foodLogs.filter((l) => l.entries.length || l.recap).map((l) => [l.date, l]));
  const days = completeDays(foodLogs);
  const avgCarbs = days.length ? avg(days.map((d) => d.carbs)) : 0;
  const out: WaterEvent[] = [];
  for (let i = 1; i < tr.length; i++) {
    const p = tr[i];
    if (p.weight == null) continue;
    const delta = round1(p.weight - tr[i - 1].trend);
    if (delta < 0.6) continue;
    const reasons: string[] = [];
    let carbsExcess = 0;
    let kcalExcess = 0;
    for (const back of [1, 2]) {
      const d = toISODate(new Date(p.t - back * DAY));
      const l = food.get(d);
      if (!l) continue;
      const m = macrosOf(l);
      if (avgCarbs && m.carbs - avgCarbs > 40) carbsExcess += m.carbs - avgCarbs;
      if (target && m.kcal > target) kcalExcess += m.kcal - target;
      if (l.recap?.cheat) reasons.push(l.recap.cheat);
    }
    if (carbsExcess > 0) reasons.push(`${Math.round(carbsExcess)} g di carboidrati sopra la media`);
    if (target && kcalExcess > target * 0.25 && !reasons.length) reasons.push(`${Math.round(kcalExcess)} kcal sopra l'obiettivo`);
    const legs = sessions.some(
      (s) => s.date >= p.t - 2.5 * DAY && s.date < p.t && s.logs.some((l) => (groupOf ? groupOf(l) : l.group) === 'Gambe' && l.sets.length >= 3),
    );
    if (legs) reasons.push('allenamento gambe (ritenzione da recupero muscolare)');
    if (!reasons.length) continue;
    out.push({ date: p.date, delta, fat: round1(Math.max(0, kcalExcess) / 7700), reason: reasons.slice(0, 2).join(' · ') });
  }
  return out;
}

/* ---------- Metabolismo reale ---------- */

export interface Metabolism {
  tdee: number;
  /** incertezza (± kcal) */
  sd: number;
  /** giornate complete usate */
  days: number;
  /** peso del dato reale rispetto alla formula (0–1) */
  confidence: number;
}

/**
 * Calorie consumate davvero = calorie medie mangiate − variazione del peso reale × 7700.
 * Si fonde con la formula finché i dati sono pochi (≥ 7 giornate complete negli ultimi 21 giorni).
 */
export function estimateMetabolism(foodLogs: FoodLog[], logs: BodyLog[], formulaTdee: number, now = Date.now()): Metabolism | null {
  const from = toISODate(new Date(now - 21 * DAY));
  const days = completeDays(foodLogs).filter((d) => d.date >= from);
  const tr = weightTrend(logs, now).filter((p) => p.date >= from);
  const weighs = tr.filter((p) => p.weight != null);
  if (days.length < 7 || weighs.length < 4 || tr.length < 7) return null;
  const slope = (tr[tr.length - 1].trend - tr[0].trend) / ((tr[tr.length - 1].t - tr[0].t) / DAY); // kg/giorno
  const intake = avg(days.map((d) => d.kcal));
  const est = intake - slope * 7700;
  const confidence = Math.min(1, days.length / 14);
  const tdee = Math.round((confidence * est + (1 - confidence) * formulaTdee) / 10) * 10;
  return { tdee: Math.max(1200, Math.min(5000, tdee)), sd: Math.round(250 / Math.sqrt(days.length / 7) / 10) * 10, days: days.length, confidence };
}

/** Il valore salvato si muove al massimo di 50 kcal al giorno verso la nuova stima. */
export function smoothMetabolism(prev: { tdee: number; date: string } | undefined | null, next: number, today = toISODate(new Date())): number {
  if (!prev) return next;
  const days = Math.max(1, Math.round((dayKey(today) - dayKey(prev.date)) / DAY));
  const max = 50 * days;
  return Math.round(prev.tdee + Math.max(-max, Math.min(max, next - prev.tdee)));
}

/* ---------- Previsione ---------- */

export interface Forecast {
  /** kg/settimana del peso reale (ultime 3 settimane) */
  rate: number;
  early?: string;
  late?: string;
  /** il ritmo attuale non porta all'obiettivo */
  wrongWay: boolean;
}

/** Quando arrivi al peso obiettivo al ritmo attuale: forchetta all'80%. */
export function forecast(logs: BodyLog[], target: number, now = Date.now()): Forecast | null {
  const from = toISODate(new Date(now - 21 * DAY));
  const tr = weightTrend(logs, now).filter((p) => p.date >= from);
  if (tr.filter((p) => p.weight != null).length < 4 || tr.length < 10) return null;
  const n = tr.length;
  const mx = avg(tr.map((_, i) => i));
  const my = avg(tr.map((p) => p.trend));
  const sxx = tr.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  const slope = tr.reduce((a, p, i) => a + (i - mx) * (p.trend - my), 0) / sxx; // kg/giorno
  const resid = Math.sqrt(tr.reduce((a, p, i) => a + (p.trend - (my + slope * (i - mx))) ** 2, 0) / Math.max(1, n - 2));
  // incertezza della pendenza, gonfiata perché i giorni della media mobile non sono indipendenti
  const se = Math.max(0.01, (resid / Math.sqrt(sxx)) * 2);
  const cur = tr[n - 1].trend;
  const need = target - cur;
  const rate = slope * 7;
  if (Math.abs(need) < 0.2) return { rate, wrongWay: false, early: toISODate(new Date(now)), late: toISODate(new Date(now)) };
  if (Math.sign(slope) !== Math.sign(need) || Math.abs(slope) < 0.003) return { rate, wrongWay: true };
  const fast = Math.abs(slope) + 1.28 * se;
  const slow = Math.max(0.003, Math.abs(slope) - 1.28 * se);
  const d = (s: number) => toISODate(new Date(now + (Math.abs(need) / s) * DAY));
  return { rate: Math.round(rate * 100) / 100, early: d(fast), late: d(slow), wrongWay: false };
}
