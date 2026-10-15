/**
 * Modello delle abitudini: impara dai tuoi dati
 * - in quali giorni della settimana ti alleni (per distribuire le calorie);
 * - quali ricette mangi davvero (per il piano);
 * - giorni a rischio (allenamenti saltati, sgarri ricorrenti) → proposte nel check-in.
 */
import type { Day, FoodLog, Session } from '@/types';
import type { Nutrition, UserProfile } from './metabolism';
import type { CoachPrefs } from './program-generator';
import type { AthleteReport } from './athlete';
import { PAIN_EXERCISES } from './athlete';
import { applyTrainingChange, type TrainingDiff, type TrainingEdit } from './training-edits';
import type { IdealVolume } from './training-model';
import type { GoalPhase } from './goal-plan';

const DAY = 86400000;
export const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const WD_SHORT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
/** 0 = lunedì */
export const weekdayOf = (t: number | Date) => (new Date(t).getDay() + 6) % 7;

/* ---------- Giorni di allenamento ---------- */

/** I giorni della settimana in cui ti alleni di solito (servono almeno 3 settimane di storico). */
export function trainingWeekdays(sessions: Session[], perWeek: number, now = Date.now()): number[] | null {
  const recent = sessions.filter((s) => now - s.date <= 56 * DAY);
  if (!recent.length || now - Math.min(...recent.map((s) => s.date)) < 21 * DAY) return null;
  const count = Array(7).fill(0) as number[];
  for (const s of recent) count[weekdayOf(s.date)]++;
  const top = count
    .map((c, d) => ({ c, d }))
    .filter((x) => x.c >= 2)
    .sort((a, b) => b.c - a.c)
    .slice(0, Math.max(1, Math.min(6, perWeek)))
    .map((x) => x.d)
    .sort((a, b) => a - b);
  return top.length >= 2 ? top : null;
}

/** Calorie extra nei giorni di allenamento (tutte da carboidrati): ~8% dell'obiettivo, tra 100 e 300 kcal. */
const bonusFor = (target: number) => Math.max(100, Math.min(300, Math.round((target * 0.08) / 10) * 10));

/** Giorni di allenamento di default se non ci sono abbastanza dati: distribuiti nella settimana. */
export function defaultTrainingDays(perWeek: number): number[] {
  const MAP: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
  return MAP[Math.max(1, Math.min(6, Math.round(perWeek)))];
}

/**
 * Giorni con più calorie: quelli scelti a mano (check-in), altrimenti quelli in cui ti alleni davvero,
 * altrimenti distribuiti in base agli allenamenti a settimana. null = calorie uguali tutti i giorni.
 */
export function resolveCycling(o: { enabled?: boolean; manual?: number[] | null; sessions: Session[]; perWeek: number }): number[] | null {
  if (o.enabled === false) return null;
  if (o.manual?.length) return o.manual;
  if (o.perWeek < 1 || o.perWeek >= 7) return null;
  return trainingWeekdays(o.sessions, o.perWeek) ?? defaultTrainingDays(o.perWeek);
}

/**
 * Obiettivo del giorno: più carboidrati nei giorni di allenamento, meno nel riposo, a parità di totale settimanale.
 * Se ti alleni in un giorno di riposo, quel giorno diventa "di allenamento" in automatico.
 */
export function dayNutrition(base: Nutrition, weekday: number, cycling: number[] | null | undefined, trained?: boolean): Nutrition & { delta: number; training: boolean } {
  if (!cycling?.length || cycling.length >= 7) return { ...base, delta: 0, training: Boolean(trained) };
  const training = trained ?? cycling.includes(weekday);
  const bonus = bonusFor(base.target);
  const rest = -Math.round((bonus * cycling.length) / (7 - cycling.length) / 10) * 10;
  const delta = training ? bonus : rest;
  return { ...base, target: base.target + delta, carbs: Math.max(60, base.carbs + Math.round(delta / 4)), delta, training };
}

export const weekTargets = (base: Nutrition, cycling: number[] | null | undefined): Nutrition[] => Array.from({ length: 7 }, (_, d) => dayNutrition(base, d, cycling));

/** Un giorno della settimana con il suo obiettivo vero (tipo deciso e compensazione). */
export interface WeekDay {
  date: string;
  target: Nutrition & { delta: number; training: boolean };
  /** tipo previsto dai giorni abituali */
  planned: boolean;
  /** chi ha deciso il tipo: tu (interruttore), allenamento fatto/in corso, giorni abituali */
  source: 'manual' | 'workout' | 'auto';
  /** kcal aggiunte (+) o tolte (−) per tenere la media della settimana */
  rebalance: number;
}

const WD_NAME = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
/** Un giorno al massimo 150 kcal sotto il suo obiettivo normale, e non più di 350 sopra. */
const MAX_CUT = 150;
const MAX_ADD = 350;

/**
 * Obiettivi veri dei 7 giorni della settimana (da lunedì `monday`):
 * - giorni passati: allenamento se c'è una sessione, altrimenti riposo;
 * - oggi: allenamento se c'è una sessione (anche in corso); altrimenti la tua scelta o i giorni abituali;
 * - giorni futuri: la tua scelta o i giorni abituali.
 * Se il numero di allenamenti cambia rispetto al previsto, la differenza di calorie si ridistribuisce su oggi e sui giorni
 * che restano, così la media della settimana resta quella fissata (con dei limiti per non avere giornate troppo basse).
 */
export function weekDays(
  base: Nutrition,
  cycling: number[] | null | undefined,
  monday: string,
  today: string,
  info: (date: string) => { trained: boolean; active?: boolean; choice?: 'training' | 'rest' },
): { days: WeekDay[]; reasons: string[] } {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${monday}T12:00:00`);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('sv-SE');
  });
  const days: WeekDay[] = dates.map((date, wd) => {
    const planned = Boolean(cycling?.includes(wd));
    const x = info(date);
    let training: boolean;
    let source: WeekDay['source'];
    if (date < today) [training, source] = [x.trained, x.trained ? 'workout' : 'auto'];
    else if (date === today && (x.trained || x.active)) [training, source] = [true, 'workout'];
    else if (x.choice) [training, source] = [x.choice === 'training', 'manual'];
    else [training, source] = [planned, 'auto'];
    return { date, target: dayNutrition(base, wd, cycling, training), planned, source, rebalance: 0 };
  });
  const reasons: string[] = [];
  if (!cycling?.length || cycling.length >= 7) return { days, reasons };
  // calorie previste per la settimana contro quelle con i giorni come sono davvero
  const plannedTotal = weekTargets(base, cycling).reduce((a, d) => a + d.target, 0);
  const actualTotal = days.reduce((a, d) => a + d.target.target, 0);
  let diff = plannedTotal - actualTotal;
  days.forEach((d, wd) => {
    if (d.target.training !== d.planned && (d.date <= today || d.source === 'manual'))
      reasons.push(d.target.training ? `allenamento in più ${WD_NAME[wd]}` : `allenamento saltato ${WD_NAME[wd]}`);
  });
  // compensano oggi e i giorni che restano (i giorni passati sono andati)
  const future = days.filter((d) => d.date >= today);
  if (!diff || !future.length) return { days, reasons };
  // si distribuisce in parti uguali, rispettando i limiti per giorno
  for (let round = 0; round < 3 && Math.abs(diff) >= 10; round++) {
    const open = future.filter((d) => (diff > 0 ? d.rebalance < MAX_ADD : d.rebalance > -MAX_CUT));
    if (!open.length) break;
    const each = diff / open.length;
    for (const d of open) {
      const next = Math.max(-MAX_CUT, Math.min(MAX_ADD, d.rebalance + each));
      diff -= next - d.rebalance;
      d.rebalance = next;
    }
  }
  for (const d of future) {
    const r = Math.round(d.rebalance / 10) * 10;
    d.rebalance = r;
    if (r) d.target = { ...d.target, target: d.target.target + r, carbs: Math.max(60, d.target.carbs + Math.round(r / 4)) };
  }
  return { days, reasons };
}

/* ---------- Gusti ---------- */

/** Ricette che registri spesso nel diario (almeno 2 volte), dalla più frequente. */
export function learnedFavorites(foodLogs: FoodLog[]): { id: string; name: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const l of foodLogs) for (const e of l.entries) if (e.recipeId) m.set(e.recipeId, { name: e.name, count: (m.get(e.recipeId)?.count ?? 0) + 1 });
  return [...m.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([id, v]) => ({ id, ...v }));
}

/* ---------- Proposte per la prossima settimana ---------- */

export type Proposal =
  | { id: string; kind: 'reorder'; emoji: string; title: string; detail: string; dayId: string }
  | { id: string; kind: 'cheat'; emoji: string; title: string; detail: string; weekday: number }
  | { id: string; kind: 'cycling'; emoji: string; title: string; detail: string; weekdays: number[] }
  | { id: string; kind: 'meso'; emoji: string; title: string; detail: string; days: Day[]; diff: TrainingDiff[] }
  | { id: string; kind: 'goal'; emoji: string; title: string; detail: string; phases: GoalPhase[]; summary: string; target?: { weight: number; bf: number; date?: string } };

export function buildProposals(ctx: {
  sessions: Session[];
  days: Day[];
  foodLogs: FoodLog[];
  report: AthleteReport;
  ideal: Map<string, IdealVolume>;
  profile: UserProfile;
  coachPrefs: CoachPrefs | null | undefined;
  cycling: number[] | null | undefined;
  hasPlan: boolean;
  mesoEnding: boolean;
  now?: number;
}): Proposal[] {
  const now = ctx.now ?? Date.now();
  const out: Proposal[] = [];

  // 1) Giorno della scheda saltato più spesso → diventa il primo della settimana
  const recent = ctx.sessions.filter((s) => now - s.date <= 28 * DAY);
  if (recent.length >= 4 && ctx.days.length >= 2) {
    const done = ctx.days.map((d) => ({ d, n: recent.filter((s) => s.dayId === d.id).length }));
    const max = Math.max(...done.map((x) => x.n));
    const worst = done.filter((x) => x.n <= max - 2).sort((a, b) => a.n - b.n)[0];
    if (worst && worst.d.order !== 1)
      out.push({
        id: `reorder-${worst.d.id}`,
        kind: 'reorder',
        emoji: '📅',
        title: `Metti "${worst.d.subtitle}" come primo allenamento della settimana`,
        detail: `Nelle ultime 4 settimane l'hai fatto ${worst.n} volte contro ${max} degli altri giorni: a inizio settimana è più difficile saltarlo. Gli esercizi non cambiano.`,
        dayId: worst.d.id,
      });
  }

  // 2) Sgarro ricorrente nello stesso giorno della settimana → pasto libero pianificato
  if (ctx.hasPlan) {
    const cheats = ctx.foodLogs.filter((l) => l.recap?.cheat && now - new Date(`${l.date}T12:00:00`).getTime() <= 35 * DAY);
    const byWd = Array(7).fill(0) as number[];
    for (const l of cheats) byWd[weekdayOf(new Date(`${l.date}T12:00:00`))]++;
    const wd = byWd.findIndex((c) => c >= 3);
    if (wd >= 0)
      out.push({
        id: `cheat-${wd}`,
        kind: 'cheat',
        emoji: '🍕',
        title: `Pasto libero pianificato il ${WEEKDAYS[wd]} sera`,
        detail: `Hai segnato uno sgarro ${byWd[wd]} ${WEEKDAYS[wd]} su 5: lo mettiamo nel piano (~900 kcal) e ricalcolo gli altri pasti della giornata, così resti nell'obiettivo.`,
        weekday: wd,
      });
  }

  // 3) Le calorie seguono già da sole i giorni in cui ti alleni (nessuna proposta da confermare)

  // 4) Fine mesociclo → aggiornamento mirato della scheda
  if (ctx.mesoEnding) {
    const edits: TrainingEdit[] = [];
    const touched = new Set<string>();
    const all = ctx.days.flatMap((d) => d.exercises);
    for (const p of ctx.report.pains.filter((x) => x.active))
      for (const e of all)
        if (PAIN_EXERCISES[p.part].test(e.name) && !touched.has(e.id) && edits.length < 4) {
          edits.push({ op: 'replace', exerciseId: e.id, reason: `fastidio: ${p.part.toLowerCase()}` });
          touched.add(e.id);
        }
    for (const st of ctx.report.stalls) {
      const e = all.find((x) => x.name.toLowerCase() === st.name.toLowerCase());
      if (e && !touched.has(e.id) && edits.length < 4) {
        edits.push({ op: 'replace', exerciseId: e.id, reason: 'fermo da 3 sessioni: nuovo stimolo' });
        touched.add(e.id);
      }
    }
    for (const [g, iv] of ctx.ideal) {
      if (!iv.personal) continue;
      const planned = all.filter((e) => e.group === g).reduce((a, e) => a + e.sets, 0);
      if (planned <= iv.max) continue;
      const e = all.filter((x) => x.group === g && x.sets > 2 && !touched.has(x.id)).sort((a, b) => b.sets - a.sets)[0];
      if (e && edits.length < 4) {
        edits.push({ op: 'sets', exerciseId: e.id, sets: e.sets - 1, reason: `${g}: ${planned} serie a settimana, il tuo ideale è ${iv.min}–${iv.max}` });
        touched.add(e.id);
      }
    }
    if (edits.length) {
      const prefs: CoachPrefs = ctx.coachPrefs ?? { request: '', summary: '', priorities: [], avoidSlots: [], avoidExercises: [], injuries: [] };
      const res = applyTrainingChange(ctx.days, { scope: 'edit', edits, prefs, summary: 'Aggiornamento di fine mesociclo' }, ctx.profile);
      if (res.diff.length)
        out.push({
          id: `meso-${res.diff.map((d) => d.before ?? d.after).join('|')}`,
          kind: 'meso',
          emoji: '🔁',
          title: `Nuovo mesociclo: ${res.diff.length} ${res.diff.length === 1 ? 'modifica' : 'modifiche'} alla scheda`,
          detail: res.diff.map((d) => `${d.before ?? ''}${d.after ? ` → ${d.after}` : ' (tolto)'}${d.reason ? ` (${d.reason})` : ''}`).join(' · '),
          days: res.days,
          diff: res.diff,
        });
    }
  }
  return out;
}
