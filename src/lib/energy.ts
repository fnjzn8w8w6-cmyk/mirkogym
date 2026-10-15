/**
 * Consumo calorico giornaliero calcolato voce per voce (stime indicative, non mediche):
 * - Basale (BMR): Katch-McArdle dalla massa magra quando la massa grassa è affidabile, altrimenti Mifflin-St Jeor.
 * - Movimento non sportivo (NEAT): passi (lunghezza del passo dall'altezza, ~0,5 kcal/kg/km netti) + movimento di base.
 * - Allenamenti (EAT): da ogni sessione registrata (durata, serie all'ora, quota di esercizi per le gambe, consumo dopo l'allenamento).
 * - Digestione (TID): dai macro del diario (proteine 25%, carboidrati 7,5%, grassi 2%); senza diario il 10% del totale.
 * Il totale è la media giornaliera delle ultime 2 settimane (gli allenamenti contano anche nei giorni di riposo, divisi sulla settimana).
 */
import type { ExerciseLog, FoodLog, Session } from '@/types';
import { basal, type UserProfile } from './metabolism';

const DAY = 86400000;
/** giorni su cui si fa la media di allenamenti e digestione */
export const ENERGY_WINDOW = 14;

/** Passi stimati dal livello di attività scelto all'inizio (se non li hai inseriti). */
export const LEVEL_STEPS: Record<UserProfile['activity'], number> = { 1: 4000, 2: 6500, 3: 9000, 4: 12000, 5: 15000 };
/** Movimento di base oltre ai passi (postura, gesti, faccende, lavoro fisico), in frazione del basale. */
const BASE_NEAT: Record<UserProfile['activity'], number> = { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.15, 5: 0.3 };

/** kcal nette dei passi: lunghezza del passo ≈ 41,5% dell'altezza, camminare costa ~0,5 kcal per kg per km oltre al basale. */
export const stepsKcal = (steps: number, p: Pick<UserProfile, 'weightKg' | 'heightCm'>) => ((steps * 0.415 * p.heightCm) / 100000) * 0.5 * p.weightKg;

/** Gruppi muscolari delle gambe (gli esercizi più costosi). */
const LEGS = /gamb|glute|quadric|femor|polpacc|leg/i;

/**
 * kcal nette di un allenamento con i pesi (oltre al basale):
 * MET da 3,5 (sessione blanda) a 6 (molto densa) in base alle serie all'ora, +1 se sono tutti esercizi per le gambe,
 * più l'8% di consumo nelle ore dopo (EPOC). Durata reale della sessione (max 3 ore); se manca, ~2,5 minuti a serie.
 */
export function sessionKcal(s: Session, weightKg: number, groupOf: (l: ExerciseLog) => string = (l) => l.group ?? ''): number {
  let sets = 0;
  let legs = 0;
  for (const l of s.logs) {
    const n = l.sets.reduce((a, x) => a + (x.type === 'warmup' ? 0.5 : 1), 0);
    sets += n;
    if (LEGS.test(groupOf(l))) legs += n;
  }
  if (!sets) return 0;
  const hours = Math.min(3, s.duration && s.duration > 300 ? s.duration / 3600 : (sets * 150) / 3600);
  const perHour = sets / hours;
  const met = Math.max(3.5, Math.min(6, 3.5 + (perHour - 12) * 0.15)) + (legs / sets) * 1;
  return Math.round((met - 1) * weightKg * hours * 1.08);
}

/** Giorni di storico dopo cui gli allenamenti si contano dai dati veri (prima: allenamenti previsti dalla scheda). */
const MIN_HISTORY = 7;

/** Allenamento tipico quando non c'è ancora storico: 60 minuti, 20 serie, un terzo gambe. */
const typicalSessionKcal = (weightKg: number) => Math.round((3.5 + 8 * 0.15 + 0.33 - 1) * weightKg * 1 * 1.08);

/** kcal spese per digerire i macro di una giornata. */
export function tefOf(m: { protein: number; carbs: number; fat: number }): number {
  return m.protein * 4 * 0.25 + m.carbs * 4 * 0.075 + m.fat * 9 * 0.02;
}

const macrosOf = (l: FoodLog) =>
  l.entries.reduce(
    (a, e) => {
      const k = e.unit === 'g' ? e.qty / 100 : e.qty;
      return { kcal: a.kcal + e.per.kcal * k, protein: a.protein + e.per.protein * k, carbs: a.carbs + e.per.carbs * k, fat: a.fat + e.per.fat * k };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

export interface EnergyBreakdown {
  bmr: number;
  bmrMethod: 'katch' | 'mifflin';
  /** movimento non sportivo (passi + movimento di base) */
  neat: number;
  steps: number;
  stepsSource: 'user' | 'level';
  /** allenamenti, media al giorno */
  eat: number;
  /** allenamenti contati e da dove: registrati (ultimi 14 giorni) o previsti dalla scheda */
  eatSessions: number;
  /** giorni di storico usati per gli allenamenti registrati (fino a 14) */
  eatDays: number;
  eatSource: 'sessions' | 'planned';
  /** digestione, media al giorno */
  tef: number;
  tefSource: 'diary' | 'estimate';
  /** consumo medio giornaliero */
  total: number;
}

/**
 * Consumo medio giornaliero. `p` deve avere peso e massa grassa attuali (ultima pesata).
 * Allenamenti: quelli registrati negli ultimi 14 giorni se lo storico copre almeno 14 giorni, altrimenti quelli previsti a settimana.
 */
export function energyModel(
  p: UserProfile,
  sessions: Session[] = [],
  foodLogs: FoodLog[] = [],
  opts: { now?: number; groupOf?: (l: ExerciseLog) => string } = {},
): EnergyBreakdown {
  const now = opts.now ?? Date.now();
  const b = basal(p);
  const stepsSource: EnergyBreakdown['stepsSource'] = p.stepsPerDay && p.stepsPerDay > 0 ? 'user' : 'level';
  const steps = stepsSource === 'user' ? p.stepsPerDay! : LEVEL_STEPS[p.activity] ?? LEVEL_STEPS[2];
  const neat = Math.round(stepsKcal(steps, p) + b.value * (BASE_NEAT[p.activity] ?? 0.1));

  const from = now - ENERGY_WINDOW * DAY;
  const oldest = sessions.length ? Math.min(...sessions.map((s) => s.date)) : now;
  // giorni di storico usati: gli ultimi 14, o meno se hai iniziato da poco (almeno 7 per usare i dati veri)
  const histDays = Math.min(ENERGY_WINDOW, (now - oldest) / DAY);
  const recent = sessions.filter((s) => s.date >= now - Math.max(histDays, 0) * DAY - 1 && s.date <= now);
  let eat: number;
  let eatSource: EnergyBreakdown['eatSource'];
  let eatSessions: number;
  let eatDays = Math.round(histDays);
  if (histDays >= MIN_HISTORY) {
    eat = recent.reduce((a, s) => a + sessionKcal(s, p.weightKg, opts.groupOf), 0) / histDays;
    eatSource = 'sessions';
    eatSessions = recent.length;
  } else {
    eatDays = 0;
    // storico corto: allenamenti previsti a settimana, con il consumo medio delle sessioni già fatte
    const per = recent.length ? recent.reduce((a, s) => a + sessionKcal(s, p.weightKg, opts.groupOf), 0) / recent.length : typicalSessionKcal(p.weightKg);
    eat = (per * Math.max(0, Math.min(7, p.daysPerWeek))) / 7;
    eatSource = 'planned';
    eatSessions = p.daysPerWeek;
  }

  // digestione: giornate del diario abbastanza piene (≥ 60% della mediana e ≥ 800 kcal)
  const fromIso = new Date(from).toLocaleDateString('sv-SE');
  // oggi è ancora in corso (diario a metà): contano solo i giorni finiti
  const todayIso = new Date(now).toLocaleDateString('sv-SE');
  const logged = foodLogs.filter((l) => l.date >= fromIso && l.date < todayIso && l.entries.length && l.recap?.complete !== false).map(macrosOf);
  const kcals = logged.map((m) => m.kcal).sort((x, y) => x - y);
  const med = kcals.length ? kcals[Math.floor(kcals.length / 2)] : 0;
  const full = logged.filter((m) => m.kcal >= 800 && m.kcal >= med * 0.6);
  const without = b.value + neat + eat;
  let tef: number;
  let tefSource: EnergyBreakdown['tefSource'];
  if (full.length >= 3) {
    tef = full.reduce((a, m) => a + tefOf(m), 0) / full.length;
    tefSource = 'diary';
  } else {
    // il 10% del totale: totale = resto / 0,9
    tef = without / 9;
    tefSource = 'estimate';
  }
  const round10 = (v: number) => Math.round(v / 10) * 10;
  return {
    bmr: b.value,
    bmrMethod: b.method,
    neat: round10(neat),
    steps,
    stepsSource,
    eat: round10(eat),
    eatSessions,
    eatDays,
    eatSource,
    tef: round10(tef),
    tefSource,
    total: round10(without + tef),
  };
}

/** Testo breve per il coach e le spiegazioni. */
export const energyText = (e: EnergyBreakdown) =>
  `consumo stimato ${e.total} kcal/giorno (basale ${e.bmr}, movimento ${e.neat} con ~${e.steps} passi, allenamenti ${e.eat}, digestione ${e.tef})`;

