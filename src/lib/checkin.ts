import type { BodyLog, Session } from '@/types';
import { callAI, type AIOptions } from './ai';
import { adaptiveCalories } from './coach';
import { sessionTonnage } from './analytics';
import { GOALS, type UserProfile } from './metabolism';

/**
 * Check-in settimanale: 5 domande veloci + dati raccolti dall'app (allenamenti, volume, record, peso).
 * Le raccomandazioni (calorie, deload) sono calcolate dall'app; l'AI scrive solo il commento finale.
 */

export interface CheckInAnswers {
  /** 1 = pessimo … 5 = ottimo */
  energy: number;
  /** 1 = nessuna fame … 5 = fame costante */
  hunger: number;
  sleep: number;
  /** 1 = rilassato … 5 = molto stressato */
  stress: number;
  /** aderenza alla dieta: 1 = quasi mai … 5 = sempre */
  adherence: number;
  /** 1 = nessun dolore muscolare … 5 = sempre indolenzito */
  soreness: number;
  note?: string;
}

export interface CheckInStats {
  sessions: number;
  planned: number;
  tonnage: number;
  prevTonnage: number;
  prs: number;
  /** kg/settimana misurati (null se non ci sono abbastanza pesate) */
  weightRate: number | null;
  expectedRate: number | null;
  weightSuggestion: number;
  /** fabbisogno reale stimato dal diario (se abbastanza completo) */
  diaryTdee?: number;
  diaryDays?: number;
  /** stato dell'obiettivo a fasi (testo pronto) */
  goalLine?: string;
}

export interface CheckInResult {
  kcalChange: number;
  deload: boolean;
  /** 0–100: più alto = più affaticato */
  fatigue: number;
  points: string[];
}

export interface CheckIn {
  date: number;
  answers: CheckInAnswers;
  stats: CheckInStats;
  kcalChange: number;
  deload: boolean;
  summary: string;
}

const WEEK = 7 * 86400000;

export function weekStats(
  sessions: Session[],
  bodyLogs: BodyLog[],
  profile: UserProfile,
  now = Date.now(),
  extra: { expectedRate?: number | null; diary?: { tdee: number; days: number; desired: number; current: number } | null; goalLine?: string } = {},
): CheckInStats {
  const inRange = (from: number, to: number) => sessions.filter((s) => s.date >= from && s.date < to);
  const cur = inRange(now - WEEK, now + 1);
  const prev = inRange(now - 2 * WEEK, now - WEEK);
  const vol = (l: Session[]) => Math.round(l.reduce((a, s) => a + sessionTonnage(s), 0));
  const adaptive = adaptiveCalories(bodyLogs, profile, extra.expectedRate ?? null);
  const d = extra.diary;
  // Con un diario completo la correzione si basa sul fabbisogno reale (più preciso della sola bilancia)
  const diaryFix = d ? Math.max(-300, Math.min(300, Math.round((d.desired - d.current) / 50) * 50)) : null;
  return {
    sessions: cur.length,
    planned: profile.daysPerWeek,
    tonnage: vol(cur),
    prevTonnage: vol(prev),
    prs: cur.reduce((a, s) => a + s.logs.reduce((b, l) => b + l.sets.filter((x) => x.isPersonalRecord).length, 0), 0),
    weightRate: adaptive ? Math.round(adaptive.actual * 100) / 100 : null,
    expectedRate: adaptive ? Math.round(adaptive.expected * 100) / 100 : null,
    weightSuggestion: diaryFix != null ? (Math.abs(diaryFix) < 100 ? 0 : diaryFix) : (adaptive?.suggestion ?? 0),
    ...(d ? { diaryTdee: d.tdee, diaryDays: d.days } : {}),
    ...(extra.goalLine ? { goalLine: extra.goalLine } : {}),
  };
}

export function evaluate(a: CheckInAnswers, s: CheckInStats, deloadAvailable: boolean): CheckInResult {
  const points: string[] = [];
  if (s.goalLine) points.push(s.goalLine);
  if (s.diaryTdee) points.push(`🍽️ Dal tuo diario (${s.diaryDays} giornate) il tuo fabbisogno reale è circa ${s.diaryTdee} kcal: uso questo dato per correggere le calorie.`);
  // Fatica: energia e sonno bassi, stress e indolenzimento alti
  const fatigue = Math.round((((5 - a.energy) + (5 - a.sleep) + (a.stress - 1) + (a.soreness - 1)) / 16) * 100);
  const volDrop = s.prevTonnage > 0 ? (s.tonnage - s.prevTonnage) / s.prevTonnage : 0;

  // Allenamenti
  if (s.sessions >= s.planned) points.push(`💪 Hai completato tutti gli allenamenti previsti (${s.sessions}/${s.planned}).`);
  else if (s.sessions > 0) points.push(`📅 Allenamenti: ${s.sessions} su ${s.planned}. Prova a fissare in agenda i giorni della prossima settimana.`);
  else points.push('📅 Nessun allenamento registrato negli ultimi 7 giorni: ripartiamo con calma, anche 2 sedute fanno la differenza.');
  if (s.prs > 0) points.push(`🏆 ${s.prs} record personali questa settimana: la progressione funziona.`);
  if (s.prevTonnage > 0 && s.tonnage > 0) {
    if (volDrop > 0.05) points.push(`📈 Volume totale in crescita del ${Math.round(volDrop * 100)}% rispetto alla settimana prima.`);
    else if (volDrop < -0.15) points.push(`📉 Volume in calo del ${Math.round(-volDrop * 100)}% rispetto alla settimana prima.`);
  }

  // Deload: fatica alta e prestazioni in calo, oppure fatica molto alta
  const deload = deloadAvailable && s.sessions > 0 && (fatigue >= 70 || (fatigue >= 55 && (volDrop < -0.1 || s.prs === 0)));
  if (deload) points.push('🛌 Segnali di fatica accumulata (energia, sonno, stress, dolori): ti consiglio una settimana di scarico (deload).');
  else if (fatigue >= 55) points.push('😴 Fatica sopra la media: cura il sonno (7–9 ore) e non forzare le ultime serie a cedimento.');
  else if (fatigue <= 25) points.push('⚡ Energia e recupero ottimi: puoi spingere sulla progressione dei carichi.');
  if (a.sleep <= 2) points.push('🌙 Il sonno è il primo fattore di recupero: prova a coricarti 30 minuti prima.');

  // Calorie: si corregge solo se la dieta è stata seguita (altrimenti i dati del peso non sono affidabili)
  let kcalChange = 0;
  if (a.adherence <= 2) {
    points.push('🍽️ Dieta seguita poco: prima di cambiare le calorie punta a rispettare il piano. Scegli dalla galleria ricette che ti ispirano davvero.');
  } else if (s.weightRate != null) {
    kcalChange = s.weightSuggestion;
    // In definizione con fame alta non scendere oltre: meglio una correzione più morbida
    if (kcalChange < 0 && a.hunger >= 4) kcalChange = Math.max(kcalChange, -100);
    if (kcalChange !== 0)
      points.push(
        `⚖️ Peso ${fmtRate(s.weightRate)} contro ${fmtRate(s.expectedRate ?? 0)} atteso: consiglio ${kcalChange > 0 ? '+' : ''}${kcalChange} kcal al giorno.`,
      );
    else points.push(`⚖️ Peso in linea con l'obiettivo (${fmtRate(s.weightRate)}): calorie invariate.`);
  } else {
    points.push('⚖️ Pesati 3–4 volte a settimana (in "Corpo") per permettere al coach di correggere le calorie.');
  }
  if (a.hunger >= 4 && kcalChange <= 0)
    points.push('🥗 Fame alta: aumenta verdure, proteine e fibre ai pasti principali e bevi di più; sposta carboidrati attorno all\'allenamento.');
  return { kcalChange, deload, fatigue, points };
}

const fmtRate = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} kg/sett.`;

/** Commento del coach (1 richiesta Lite). In caso di errore si usa il riepilogo calcolato dall'app. */
export async function checkInSummary(
  a: CheckInAnswers,
  s: CheckInStats,
  r: CheckInResult,
  profile: UserProfile,
  opts: AIOptions = {},
  memory = '',
): Promise<string> {
  const goal = GOALS.find((g) => g.value === profile.goal)?.label ?? profile.goal;
  const prompt = `Sei il personal trainer e dietologo di un utente e lo segui da tempo: conosci il suo storico (sotto). Scrivi il commento al suo check-in settimanale: 5-8 frasi in italiano, seconda persona, tono da coach vero, diretto e concreto, niente elenchi puntati, niente markdown.
REGOLE: consigli SPECIFICI per questa persona, mai generici. Se nello storico ci sono dolori o fastidi ATTIVI devi parlarne per primi: chiedi come va, indica quali esercizi della sua scheda alleggerire o sostituire e quando consultare un professionista. Cita con i numeri giorni saltati, esercizi in stallo, progressi e sgarri se presenti. Collega le note che ha scritto dopo gli allenamenti.
STORICO DELL'ATLETA:
${memory || 'nessun dato storico'}
Obiettivo: ${goal}. Allenamenti ${s.sessions}/${s.planned}, volume ${s.tonnage} kg (settimana prima ${s.prevTonnage} kg), record ${s.prs}.
Risposte (1-5): energia ${a.energy}, fame ${a.hunger}, qualità del sonno ${a.sleep}, stress ${a.stress}, dieta seguita ${a.adherence}, indolenzimento ${a.soreness}.${a.note ? `\nNota dell'utente: """${a.note.slice(0, 400)}"""` : ''}
Decisioni già prese dall'app (non cambiarle, spiegale): ${r.points.join(' ')}
Correzione calorie: ${r.kcalChange} kcal. Deload consigliato: ${r.deload ? 'sì' : 'no'}.
Chiudi con UN obiettivo pratico per la prossima settimana.`;
  const text = await callAI([{ text: prompt }], { temperature: 0.5, label: 'Il coach legge il tuo check-in…', prefer: 'lite', ...opts });
  const clean = text.replace(/[*#_`]/g, '').trim();
  if (clean.length < 40) throw new Error('Risposta del coach troppo breve');
  return clean.slice(0, 1500);
}

export const checkInDue = (list: CheckIn[] | undefined, now = Date.now()): boolean => {
  const last = list?.[0]?.date ?? 0;
  return now - last >= 6.5 * 86400000;
};
