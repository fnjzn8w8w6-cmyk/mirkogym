/**
 * Memoria del coach: profilo dell'atleta calcolato da TUTTO lo storico salvato
 * (sessioni, resoconti post-allenamento, note, diario alimentare, check-in).
 * Il calcolo è locale (gratis, istantaneo); il testo risultante entra in ogni richiesta al coach AI.
 */
import type { BodyLog, Day, FoodLog, Session } from '@/types';
import { epley1RM, exerciseKey } from './analytics';

const DAY = 86400000;

export const PAIN_PARTS = ['Spalla', 'Ginocchio', 'Schiena', 'Gomito', 'Polso', 'Anca', 'Collo'] as const;
export type PainPart = (typeof PAIN_PARTS)[number];

/** "la spalla", "il ginocchio"… */
export const PAIN_LABEL: Record<PainPart, string> = {
  Spalla: 'la spalla',
  Ginocchio: 'il ginocchio',
  Schiena: 'la schiena',
  Gomito: 'il gomito',
  Polso: 'il polso',
  Anca: "l'anca",
  Collo: 'il collo',
};

const PAIN_WORDS: Record<PainPart, RegExp> = {
  Spalla: /spall/i,
  Ginocchio: /ginocch/i,
  Schiena: /schien|lombar|dorsal(e|i) (bass|alt)/i,
  Gomito: /gomit/i,
  Polso: /pols/i,
  Anca: /\banca\b|\banche\b|inguin/i,
  Collo: /collo|cervical/i,
};
const PAIN_HINT = /dolor|fastid|male|tira|infiamm|fitt|indolenz|scricchiol|bruci/i;

/** Esercizi che caricano di più ciascuna zona (per avvisi e sostituzioni). */
export const PAIN_EXERCISES: Record<PainPart, RegExp> = {
  Spalla: /panca|bench|press|lento|military|alzat|lateral|dip|croci|fly|push.?up|piegament|arnold/i,
  Ginocchio: /squat|leg press|pressa|affond|lunge|leg extension|bulgar|step.?up|hack/i,
  Schiena: /stacc|deadlift|rematore|row|good morning|squat|hyperext/i,
  Gomito: /curl|french|skull|push.?down|tricip|dip|estension/i,
  Polso: /curl|panca|bench|front squat|wrist/i,
  Anca: /squat|affond|lunge|stacc|hip thrust|abduct|adduct/i,
  Collo: /scrollat|shrug|lento|military|upright/i,
};

export interface PainInfo {
  part: PainPart;
  count: number;
  last: number;
  /** segnalato nelle ultime 3 settimane e non segnato come passato */
  active: boolean;
  quotes: string[];
}
export interface ExerciseTrend {
  name: string;
  group: string;
  sessions: number;
  /** variazione % del massimale stimato (prime vs ultime sessioni del periodo) */
  change: number;
  best: number;
}
export interface Insight {
  tone: 'good' | 'warn' | 'bad' | 'info';
  emoji: string;
  text: string;
}
export interface AthleteReport {
  totalSessions: number;
  weeks: number;
  perWeek: number;
  planned: number;
  avgRating: number | null;
  recentRating: number | null;
  avgEnergy: number | null;
  recentEnergy: number | null;
  avgDuration: number | null;
  pains: PainInfo[];
  stalls: ExerciseTrend[];
  progress: ExerciseTrend[];
  skipped: { day: string; done: number; expected: number }[];
  notes: { date: number; text: string }[];
  diet: {
    daysLogged: number;
    avgKcal: number;
    inTarget: number;
    avgProtein: number;
    avgAdherence: number | null;
    cheats: { date: string; text: string }[];
    weekendCheats: number;
    avgHunger: number | null;
  } | null;
  insights: Insight[];
}

const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const fmtDate = (t: number) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

function sessionText(s: Session): string[] {
  const out: string[] = [];
  if (s.recap?.note) out.push(s.recap.note);
  if (s.notes) out.push(s.notes);
  for (const l of s.logs) for (const st of l.sets) if (st.note) out.push(`${l.name ?? ''}: ${st.note}`);
  return out;
}

export function athleteReport(input: {
  sessions: Session[];
  days: Day[];
  foodLogs?: FoodLog[];
  bodyLogs?: BodyLog[];
  target?: { kcal: number; protein: number } | null;
  painResolved?: Record<string, number>;
  nameOf?: (l: Session['logs'][number]) => string;
  groupOf?: (l: Session['logs'][number]) => string;
  now?: number;
}): AthleteReport {
  const now = input.now ?? Date.now();
  const sessions = [...input.sessions].sort((a, b) => a.date - b.date);
  const nameOf = input.nameOf ?? ((l) => l.name ?? 'Esercizio');
  const groupOf = input.groupOf ?? ((l) => l.group ?? 'Altro');
  const first = sessions[0]?.date ?? now;
  const weeks = Math.max(1, Math.min(8, Math.ceil((now - first) / (7 * DAY))));
  const recentSessions = sessions.filter((s) => s.date >= now - weeks * 7 * DAY);
  const planned = Math.max(1, input.days.length);

  /* Resoconti */
  const recaps = sessions.filter((s) => s.recap);
  const last4 = recaps.slice(-4);

  /* Dolori: chip del resoconto + parole nelle note */
  const painMap = new Map<PainPart, PainInfo>();
  for (const s of sessions) {
    const found = new Set<PainPart>(((s.recap?.pain ?? []) as string[]).filter((p): p is PainPart => (PAIN_PARTS as readonly string[]).includes(p)));
    const quotes: string[] = [];
    for (const t of sessionText(s))
      for (const part of PAIN_PARTS)
        if (PAIN_WORDS[part].test(t) && PAIN_HINT.test(t)) {
          found.add(part);
          quotes.push(t.slice(0, 140));
        }
    for (const part of found) {
      const p = painMap.get(part) ?? { part, count: 0, last: 0, active: false, quotes: [] };
      p.count++;
      p.last = Math.max(p.last, s.date);
      p.quotes.push(...quotes.filter((q) => PAIN_WORDS[part].test(q)));
      painMap.set(part, p);
    }
  }
  const pains = [...painMap.values()]
    .map((p) => ({ ...p, quotes: [...new Set(p.quotes)].slice(-3), active: now - p.last <= 21 * DAY && (input.painResolved?.[p.part] ?? 0) < p.last }))
    .sort((a, b) => b.last - a.last);

  /* Andamento per esercizio */
  const byEx = new Map<string, { name: string; group: string; points: { date: number; e1: number }[] }>();
  for (const s of sessions)
    for (const l of s.logs) {
      const work = l.sets.filter((x) => x.type !== 'warmup' && x.weight > 0 && x.reps > 0);
      if (!work.length) continue;
      const name = nameOf(l);
      const key = exerciseKey(name);
      const e = byEx.get(key) ?? { name, group: groupOf(l), points: [] };
      e.points.push({ date: s.date, e1: Math.max(...work.map((x) => epley1RM(x.weight, x.reps))) });
      byEx.set(key, e);
    }
  const trends: ExerciseTrend[] = [];
  const stalls: ExerciseTrend[] = [];
  for (const e of byEx.values()) {
    const pts = e.points.filter((p) => p.date >= now - 42 * DAY);
    const best = Math.max(...e.points.map((p) => p.e1));
    if (pts.length >= 2) {
      const a = pts[0].e1;
      const b = Math.max(...pts.slice(-2).map((p) => p.e1));
      trends.push({ name: e.name, group: e.group, sessions: e.points.length, change: Math.round(((b - a) / a) * 100), best });
    }
    // stallo: le ultime 3 sessioni non superano il massimo precedente
    if (e.points.length >= 4) {
      const last3 = e.points.slice(-3);
      const before = Math.max(...e.points.slice(0, -3).map((p) => p.e1));
      if (Math.max(...last3.map((p) => p.e1)) <= before)
        stalls.push({ name: e.name, group: e.group, sessions: e.points.length, change: Math.round(((last3[2].e1 - before) / before) * 100), best });
    }
  }
  const progress = trends.filter((t) => t.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);

  /* Giorni della scheda saltati più spesso */
  const skipped: AthleteReport['skipped'] = [];
  if (sessions.length >= 3 && weeks >= 2) {
    const expected = weeks;
    for (const d of input.days) {
      const done = recentSessions.filter((s) => s.dayId === d.id).length;
      if (done <= expected - 2 || (done === 0 && expected >= 2)) skipped.push({ day: `${d.name} · ${d.subtitle}`, done, expected });
    }
  }

  /* Note recenti dell'atleta */
  const notes = sessions
    .flatMap((s) => sessionText(s).map((text) => ({ date: s.date, text: text.slice(0, 160) })))
    .slice(-8);

  /* Dieta */
  let diet: AthleteReport['diet'] = null;
  const logs = (input.foodLogs ?? []).filter((l) => l.entries.length || l.recap);
  if (logs.length) {
    const kcalOf = (l: FoodLog) =>
      l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.kcal * e.qty) / 100 : e.per.kcal * e.qty), 0);
    const protOf = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.protein * e.qty) / 100 : e.per.protein * e.qty), 0);
    const withFood = logs.filter((l) => l.entries.length);
    const kcals = withFood.map(kcalOf);
    const t = input.target;
    const cheats = logs.filter((l) => l.recap?.cheat).map((l) => ({ date: l.date, text: l.recap!.cheat! }));
    diet = {
      daysLogged: withFood.length,
      avgKcal: Math.round(avg(kcals) ?? 0),
      inTarget: t ? kcals.filter((k) => Math.abs(k - t.kcal) <= t.kcal * 0.1).length : 0,
      avgProtein: Math.round(avg(withFood.map(protOf)) ?? 0),
      avgAdherence: r1(avg(logs.filter((l) => l.recap).map((l) => l.recap!.adherence))),
      cheats: cheats.slice(-6),
      weekendCheats: cheats.filter((c) => [0, 5, 6].includes(new Date(`${c.date}T12:00:00`).getDay())).length,
      avgHunger: r1(avg(logs.filter((l) => l.recap).map((l) => l.recap!.hunger))),
    };
  }

  const report: AthleteReport = {
    totalSessions: sessions.length,
    weeks,
    perWeek: r1(recentSessions.length / weeks) ?? 0,
    planned,
    avgRating: r1(avg(recaps.map((s) => s.recap!.rating))),
    recentRating: r1(avg(last4.map((s) => s.recap!.rating))),
    avgEnergy: r1(avg(recaps.map((s) => s.recap!.energy))),
    recentEnergy: r1(avg(last4.map((s) => s.recap!.energy))),
    avgDuration: sessions.some((s) => s.duration) ? Math.round((avg(sessions.filter((s) => s.duration).map((s) => s.duration!)) ?? 0) / 60) : null,
    pains,
    stalls,
    progress,
    skipped,
    notes,
    diet,
    insights: [],
  };
  report.insights = buildInsights(report, input.target ?? null);
  return report;
}

function buildInsights(r: AthleteReport, target: { kcal: number; protein: number } | null): Insight[] {
  const out: Insight[] = [];
  for (const p of r.pains.filter((x) => x.active))
    out.push({
      tone: 'bad',
      emoji: '🩹',
      text: `${p.part}: fastidio segnalato ${p.count === 1 ? 'una volta' : `${p.count} volte`} (ultima il ${fmtDate(p.last)}). Teniamola d'occhio.`,
    });
  for (const s of r.skipped.slice(0, 2))
    out.push({ tone: 'warn', emoji: '📅', text: `${s.day}: fatto ${s.done} volte su ${s.expected} settimane. È il giorno che salti di più.` });
  for (const s of r.stalls.slice(0, 2))
    out.push({ tone: 'warn', emoji: '⏸️', text: `${s.name} è fermo da 3 sessioni: è il momento di cambiare stimolo (ripetizioni, variante o mini-deload).` });
  if (r.recentRating != null && r.avgRating != null && r.recentRating <= r.avgRating - 0.7)
    out.push({ tone: 'warn', emoji: '😮‍💨', text: `Le ultime sessioni le hai votate peggio del solito (${r.recentRating} vs ${r.avgRating}): sonno e recupero ok?` });
  if (r.diet && r.diet.cheats.length >= 2)
    out.push({
      tone: 'warn',
      emoji: '🍕',
      text: `${r.diet.cheats.length} sgarri nelle ultime settimane${r.diet.weekendCheats >= 2 ? ', quasi tutti nel weekend' : ''}.`,
    });
  if (r.diet && target && r.diet.daysLogged >= 3 && r.diet.avgProtein < target.protein * 0.8)
    out.push({ tone: 'warn', emoji: '🥩', text: `Proteine medie ${r.diet.avgProtein} g contro ${target.protein} g di obiettivo.` });
  for (const p of r.progress.slice(0, 2)) out.push({ tone: 'good', emoji: '📈', text: `${p.name}: +${p.change}% di forza nelle ultime settimane.` });
  if (r.totalSessions >= 3 && r.perWeek >= r.planned) out.push({ tone: 'good', emoji: '🔥', text: `Costanza top: ${r.perWeek} allenamenti a settimana su ${r.planned} previsti.` });
  return out;
}

/** Testo compatto del profilo da inserire nelle richieste al coach AI. */
export function athleteText(r: AthleteReport): string {
  const lines: string[] = [];
  lines.push(
    `Storico: ${r.totalSessions} sessioni, media ${r.perWeek}/settimana (previste ${r.planned}) nelle ultime ${r.weeks} settimane${r.avgDuration ? `, durata media ${r.avgDuration} min` : ''}.`,
  );
  if (r.avgRating != null) lines.push(`Voto medio sessioni ${r.avgRating}/5 (ultime 4: ${r.recentRating}), energia media ${r.avgEnergy}/5 (ultime 4: ${r.recentEnergy}).`);
  if (r.pains.length)
    lines.push(
      'DOLORI/FASTIDI SEGNALATI: ' +
        r.pains
          .map((p) => `${p.part} ${p.count}x, ultima ${fmtDate(p.last)}${p.active ? ' (ATTIVO)' : ' (passato)'}${p.quotes.length ? ` — "${p.quotes.join('"; "')}"` : ''}`)
          .join(' | '),
    );
  if (r.skipped.length) lines.push(`Giorni saltati spesso: ${r.skipped.map((s) => `${s.day} (${s.done}/${s.expected})`).join(', ')}.`);
  if (r.stalls.length) lines.push(`Esercizi in stallo (3 sessioni senza miglioramenti): ${r.stalls.map((s) => s.name).join(', ')}.`);
  if (r.progress.length) lines.push(`Migliori progressi (6 settimane): ${r.progress.map((p) => `${p.name} +${p.change}%`).join(', ')}.`);
  if (r.notes.length) lines.push(`Note dell'atleta: ${r.notes.map((n) => `[${fmtDate(n.date)}] ${n.text}`).join(' | ')}`);
  if (r.diet)
    lines.push(
      `Dieta (ultimi giorni registrati: ${r.diet.daysLogged}): media ${r.diet.avgKcal} kcal, ${r.diet.inTarget} giorni in target, proteine medie ${r.diet.avgProtein} g` +
        (r.diet.avgAdherence != null ? `, aderenza al piano ${r.diet.avgAdherence}/5, fame ${r.diet.avgHunger}/5` : '') +
        (r.diet.cheats.length ? `, sgarri: ${r.diet.cheats.map((c) => `${c.date} ${c.text}`).join('; ')}` : ', nessuno sgarro segnalato') +
        '.',
    );
  return lines.join('\n');
}

/** Esercizi di un giorno che caricano una zona dolorante. */
export const exercisesStressing = (part: PainPart, names: string[]) => names.filter((n) => PAIN_EXERCISES[part].test(n));

