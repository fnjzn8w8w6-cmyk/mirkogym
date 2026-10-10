/**
 * Aggiornamento settimanale delle calorie (stile MacroFactor): un solo calcolo, il lunedì.
 * - Con il metabolismo reale (diario + peso) l'obiettivo è dispendio reale + ritmo dell'obiettivo.
 * - Senza, si parte dalla formula e si corregge con l'andamento del peso (max ±300 kcal a settimana).
 * Per tutta la settimana i numeri restano fissi: check-in, coach e analisi usano questi.
 */
import type { BodyLog, FoodLog, WeekCalories } from '@/types';
import { adaptiveCalories, userNutrition, type MetabolismState, type NutritionPrefs } from './coach';
import { planRate, type GoalPlan } from './goal-plan';
import type { UserProfile } from './metabolism';
import { mondayISO, toISODate } from './date-utils';
import { addDays } from 'date-fns';

interface CalSettings {
  kcalAdjust?: number;
  nutritionPrefs?: NutritionPrefs;
  goalPlan?: GoalPlan | null;
  metabolism?: MetabolismState | null;
  weekCal?: WeekCalories;
}

/** Calcolo della nuova settimana (da salvare in settings.weekCal). */
export function computeWeekCalories(profile: UserProfile, s: CalSettings, bodyLogs: BodyLog[], foodLogs: FoodLog[], now = new Date()): WeekCalories {
  const week = mondayISO(now);
  const prev = s.weekCal;
  // obiettivo in vigore fino a ieri (stessa funzione, con i valori della settimana prima)
  const prevTarget = prev ? prev.target : null;
  const rate = s.goalPlan ? planRate(s.goalPlan, bodyLogs, profile.weightKg) : null;
  const adaptive = adaptiveCalories(bodyLogs, profile, rate);
  const from = toISODate(addDays(now, -7));
  const logged = foodLogs.filter((l) => l.date >= from && l.date < toISODate(now) && l.entries.length > 0).length;
  // il metabolismo reale si usa solo con dati affidabili (diario quasi completo e almeno 2 settimane):
  // con pasti non registrati sembrerebbe di consumare meno di quanto si consuma davvero
  const realOk = Boolean(s.metabolism?.tdee) && logged >= 5 && (s.metabolism?.days ?? 0) >= 14;
  const tdee = realOk ? s.metabolism!.tdee : null;
  const prevAdjust = prev ? prev.adjust : (s.kcalAdjust ?? 0);
  // obiettivo "di base" (dispendio + ritmo dell'obiettivo), senza correzioni
  const baseOf = (t: number | null, adj: number) =>
    userNutrition(profile, { ...s, weekCal: undefined, metabolism: t ? { ...s.metabolism!, tdee: t } : null, kcalAdjust: adj }).target;
  let target: number;
  if (!prev) {
    // primo calcolo: si fissano i valori attuali (la prima vera correzione è il lunedì dopo)
    target = baseOf(tdee, tdee ? 0 : prevAdjust);
  } else {
    // proposta: metabolismo reale, oppure correzione dall'andamento del peso
    let cand = tdee ? baseOf(tdee, 0) : prev.target + (adaptive?.suggestion ?? 0);
    // la correzione deve andare nella direzione giusta: se servono più calorie non si scende, e viceversa
    if (adaptive) {
      const need = adaptive.expected - adaptive.actual; // >0 = sei sotto il ritmo
      if (Math.abs(need) < 0.05) cand = prev.target;
      else if (need > 0 && cand < prev.target) cand = prev.target + Math.max(adaptive.suggestion, 0);
      else if (need < 0 && cand > prev.target) cand = prev.target + Math.min(adaptive.suggestion, 0);
    }
    // cambi graduali: al massimo ±200 kcal a settimana
    target = Math.round((prev.target + Math.max(-200, Math.min(200, cand - prev.target))) / 10) * 10;
  }
  // correzione da salvare: differenza tra l'obiettivo scelto e quello di base
  const adjust = Math.max(-800, Math.min(800, target - baseOf(tdee, 0)));
  return {
    week,
    tdee,
    adjust,
    target,
    prevTarget,
    prevTdee: prev?.tdee ?? null,
    trend: adaptive ? Math.round(adaptive.actual * 100) / 100 : null,
    expected: adaptive ? Math.round(adaptive.expected * 100) / 100 : null,
    logged,
    at: Date.now(),
    undo: prev ? { tdee: prev.tdee, adjust: prev.adjust, target: prev.target } : undefined,
  };
}

/** Annulla l'aggiornamento: per questa settimana restano i valori della settimana prima. */
export function undoWeekCalories(w: WeekCalories): WeekCalories {
  if (!w.undo) return w;
  return { ...w, tdee: w.undo.tdee, adjust: w.undo.adjust, target: w.undo.target, undone: true };
}

const pct = (kgWeek: number, weight: number) => `${((kgWeek / weight) * 100).toFixed(2).replace('.', ',')}%`;

/** Spiegazione in parole semplici (calcolata, niente AI). */
export function explainWeek(w: WeekCalories, weight: number, goal: UserProfile['goal']): string {
  const delta = w.prevTarget != null ? w.target - w.prevTarget : 0;
  if (w.undone) return 'Hai annullato l\'aggiornamento: questa settimana restano le calorie della settimana scorsa.';
  if (w.trend == null || w.expected == null)
    return 'Servono almeno 4 pesate in 10 giorni per capire come sta andando: per ora l\'obiettivo segue il calcolo iniziale.';
  const trendTxt = `${w.trend >= 0 ? '+' : ''}${String(w.trend).replace('.', ',')} kg a settimana (${pct(w.trend, weight)} del peso)`;
  const expTxt = `${w.expected >= 0 ? '+' : ''}${String(w.expected).replace('.', ',')} kg (${pct(w.expected, weight)})`;
  if (Math.abs(delta) < 50) return `Il peso va come previsto: ${trendTxt}, obiettivo ${expTxt}. Calorie invariate.`;
  const up = w.expected > w.trend;
  const why =
    goal === 'cut'
      ? up
        ? 'stai scendendo più in fretta del previsto: meglio non perdere muscolo'
        : 'stai scendendo più piano del previsto'
      : up
        ? 'stai salendo più piano del previsto'
        : 'stai salendo più in fretta del previsto: rischi di prendere grasso';
  return `Il peso va ${trendTxt} contro un obiettivo di ${expTxt}: ${why}. Con ${up ? '+' : ''}${delta} kcal al giorno torni nel ritmo giusto.`;
}
