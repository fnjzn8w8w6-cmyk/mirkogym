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

/** Calorie extra nei giorni di allenamento (tutte da carboidrati). */
const BONUS = 130;

/**
 * Obiettivo del giorno: più carboidrati nei giorni di allenamento, meno nel riposo, a parità di totale settimanale.
 * Se ti alleni in un giorno di riposo, quel giorno diventa "di allenamento" in automatico.
 */
export function dayNutrition(base: Nutrition, weekday: number, cycling: number[] | null | undefined, trained?: boolean): Nutrition & { delta: number; training: boolean } {
  if (!cycling?.length || cycling.length >= 7) return { ...base, delta: 0, training: Boolean(trained) };
  const training = trained ?? cycling.includes(weekday);
  const rest = -Math.round((BONUS * cycling.length) / (7 - cycling.length) / 10) * 10;
  const delta = training ? BONUS : rest;
  return { ...base, target: base.target + delta, carbs: Math.max(60, base.carbs + Math.round(delta / 4)), delta, training };
}

export const weekTargets = (base: Nutrition, cycling: number[] | null | undefined): Nutrition[] => Array.from({ length: 7 }, (_, d) => dayNutrition(base, d, cycling));

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
  | { id: string; kind: 'meso'; emoji: string; title: string; detail: string; days: Day[]; diff: TrainingDiff[] };

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

  // 3) Calorie che seguono la scheda (quando l'app ha imparato i tuoi giorni di allenamento)
  const wds = trainingWeekdays(ctx.sessions, ctx.profile.daysPerWeek, now);
  if (wds && ctx.hasPlan && (!ctx.cycling || ctx.cycling.join() !== wds.join()))
    out.push({
      id: `cycling-${wds.join('')}`,
      kind: 'cycling',
      emoji: '🏋️',
      title: 'Più carboidrati nei giorni di allenamento',
      detail: `Ti alleni di solito ${wds.map((d) => WEEKDAYS[d]).join(', ')}: in quei giorni +${BONUS} kcal di carboidrati, meno nei giorni di riposo. Il totale settimanale non cambia.`,
      weekdays: wds,
    });

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
