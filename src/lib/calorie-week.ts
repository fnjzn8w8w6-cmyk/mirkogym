/**
 * Aggiornamento settimanale delle calorie (stile MacroFactor): un solo calcolo, il lunedì.
 * - Con il metabolismo reale (diario + peso, affidabile e plausibile) l'obiettivo è dispendio reale + ritmo dell'obiettivo.
 * - Senza, si parte dal consumo calcolato voce per voce (basale, movimento, allenamenti, digestione) e si corregge
 *   con l'andamento del peso (correzione entro ±15% del consumo, cambi di al massimo ±200 kcal a settimana).
 * Per tutta la settimana i numeri restano fissi: check-in, coach e analisi usano questi.
 */
import type { BodyLog, FoodLog, WeekCalories } from '@/types';
import { adaptiveCalories, metabolismReliable, userNutrition, type MetabolismState, type NutritionPrefs } from './coach';
import { energyModel } from './energy';
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
  energy?: { total: number } | null;
}

/** La correzione dall'andamento del peso non sposta il consumo di oltre il 15% (protegge da acqua e pesate strane). */
const MAX_ADJUST = 0.15;

/**
 * Calcolo della nuova settimana (da salvare in settings.weekCal).
 * `model` = consumo calcolato voce per voce oggi (basale + movimento + allenamenti + digestione).
 */
export function computeWeekCalories(profile: UserProfile, s: CalSettings, bodyLogs: BodyLog[], foodLogs: FoodLog[], now = new Date(), model?: number): WeekCalories {
  const week = mondayISO(now);
  const prev = s.weekCal;
  // obiettivo in vigore fino a ieri (stessa funzione, con i valori della settimana prima)
  const prevTarget = prev ? prev.target : null;
  const rate = s.goalPlan ? planRate(s.goalPlan, bodyLogs, profile.weightKg) : null;
  const from = toISODate(addDays(now, -7));
  const logged = foodLogs.filter((l) => l.date >= from && l.date < toISODate(now) && l.entries.length > 0).length;
  // se diario e peso non tornano (il peso cambia troppo in fretta per quello che mangi) è acqua/glicogeno:
  // per questa settimana l'andamento del peso non corregge le calorie, si segue il consumo calcolato
  const water = Boolean(s.metabolism?.anomalous) && logged >= 5;
  const trendData = adaptiveCalories(bodyLogs, profile, rate, now.getTime());
  const adaptive = water ? null : trendData;
  const formula = model ?? s.energy?.total ?? energyModel(profile).total;
  // il metabolismo reale si usa solo con dati affidabili (diario quasi completo, 2 settimane di diario e di pesate, valore plausibile):
  // con pasti non registrati sembrerebbe di consumare meno di quanto si consuma davvero
  const realOk = metabolismReliable(s.metabolism) && logged >= 5;
  const tdee = realOk ? s.metabolism!.tdee : null;
  const used = tdee ?? formula;
  // la correzione della settimana prima vale solo se calcolata sullo stesso tipo di consumo
  // (le settimane della vecchia formula, che non contava gli allenamenti, ripartono da zero)
  // (si usa la correzione voluta, non quella ridotta dal limite di 200 kcal a settimana, che si recupera nelle settimane dopo)
  const prevAdjust = prev ? (prev.formula != null && prev.tdee == null ? (prev.intent ?? prev.adjust) : 0) : (s.kcalAdjust ?? 0);
  // obiettivo con un consumo e una correzione precisi
  const baseOf = (t: number, adj: number) => userNutrition(profile, s, { tdee: t, adjust: adj }).target;
  const maxAdj = Math.round(formula * MAX_ADJUST);
  const clampAdj = (a: number) => Math.max(-maxAdj, Math.min(maxAdj, a));
  let target: number;
  // correzione voluta dall'andamento del peso (0 con il metabolismo reale, che la misura già)
  const intent = tdee ? 0 : clampAdj(prevAdjust + (prev ? (adaptive?.suggestion ?? 0) : 0));
  if (!prev) {
    // primo calcolo: si fissano i valori attuali (la prima vera correzione è il lunedì dopo)
    target = baseOf(used, intent);
  } else {
    // proposta: metabolismo reale, oppure consumo calcolato + correzione dall'andamento del peso
    let cand = baseOf(used, intent);
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
  // correzione da salvare: differenza tra l'obiettivo scelto e quello di base (entro ±15% del consumo)
  const adjust = clampAdj(target - baseOf(used, 0));
  target = baseOf(used, adjust);
  return {
    week,
    tdee,
    formula,
    adjust,
    intent,
    target,
    prevTarget,
    prevTdee: prev?.tdee ?? null,
    trend: trendData ? Math.round(trendData.actual * 100) / 100 : null,
    expected: trendData ? Math.round(trendData.expected * 100) / 100 : null,
    ...(water ? { water: true } : {}),
    logged,
    at: Date.now(),
    undo: prev ? { tdee: prev.tdee, adjust: prev.adjust, target: prev.target, formula: prev.formula } : undefined,
  };
}

/** Annulla l'aggiornamento: per questa settimana restano i valori della settimana prima. */
export function undoWeekCalories(w: WeekCalories): WeekCalories {
  if (!w.undo) return w;
  return { ...w, tdee: w.undo.tdee, adjust: w.undo.adjust, target: w.undo.target, formula: w.undo.formula, undone: true };
}

const pct = (kgWeek: number, weight: number) => `${((kgWeek / weight) * 100).toFixed(2).replace('.', ',')}%`;

/** Spiegazione in parole semplici (calcolata, niente AI). */
export function explainWeek(w: WeekCalories, weight: number, goal: UserProfile['goal']): string {
  const delta = w.prevTarget != null ? w.target - w.prevTarget : 0;
  if (w.undone) return 'Hai annullato l\'aggiornamento: questa settimana restano le calorie della settimana scorsa.';
  if (w.water)
    return `Il peso cambia troppo in fretta rispetto a quello che mangi${w.trend != null ? ` (${w.trend >= 0 ? '+' : ''}${String(w.trend).replace('.', ',')} kg a settimana)` : ''}: è soprattutto acqua e glicogeno, non grasso o muscolo. Per questa settimana non correggo: le calorie seguono il consumo calcolato.`;
  if (w.trend == null || w.expected == null)
    return 'Servono almeno 4 pesate in 2 settimane per capire come sta andando: per ora l\'obiettivo segue il consumo calcolato.';
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
