/**
 * Analisi del coach divise per area e periodo:
 * - allenamento: ultima sessione oppure settimana in corso (solo allenamento, niente dieta);
 * - dieta: una giornata oppure settimana in corso (solo dieta, niente allenamento).
 * I dati vengono preparati qui (senza AI) e l'AI scrive solo il commento.
 */
import type { Day, Session } from '@/types';
import { callAI, type AIOptions } from './ai';
import { EXPERIENCE, GOALS, type UserProfile } from './metabolism';
import { sessionTonnage, workingSets } from './analytics';
import { mondayISO, toISODate } from './date-utils';

const DAY = 86400000;
const WD_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const fmtDay = (t: number) => new Date(t).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const kgTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export interface SavedAnalysis {
  text: string;
  at: number;
  /** a cosa si riferisce: id della sessione, data ISO del giorno o lunedì della settimana */
  ref: string;
}

/* ---------------- Allenamento ---------------- */

type NameOf = (l: Session['logs'][number]) => string;

/** Dati di una sessione con il confronto esercizio per esercizio con l'ultima volta che l'hai fatto. */
export function sessionData(s: Session, sessions: Session[], dayName: string, nameOf: NameOf, groupOf: NameOf): string {
  const before = sessions.filter((x) => x.date < s.date).sort((a, b) => b.date - a.date);
  const lines: string[] = [];
  lines.push(`SESSIONE: ${dayName}, ${fmtDay(s.date)}${s.duration ? `, durata ${Math.round(s.duration / 60)} min` : ''}${s.deload ? ', SETTIMANA DI SCARICO (carichi ridotti apposta)' : ''}.`);
  if (s.recap)
    lines.push(
      `Resoconto dell'atleta: voto ${s.recap.rating}/5, energia ${s.recap.energy}/5, dolori: ${s.recap.pain.length ? s.recap.pain.join(', ') : 'nessuno'}${s.recap.note ? `, nota: "${s.recap.note}"` : ''}.`,
    );
  if (s.notes) lines.push(`Note della sessione: "${s.notes}"`);
  lines.push('ESERCIZI (serie allenanti peso×ripetizioni, RIR = ripetizioni lasciate):');
  const perGroup = new Map<string, number>();
  for (const l of s.logs) {
    const sets = workingSets(l.sets);
    if (!sets.length) continue;
    const name = nameOf(l);
    perGroup.set(groupOf(l), (perGroup.get(groupOf(l)) ?? 0) + sets.length);
    const now = sets.map((x) => `${kgTxt(x.weight)}×${x.reps}${x.rir != null ? ` RIR${x.rir}` : ''}${x.isPersonalRecord ? ' (RECORD)' : ''}`).join(', ');
    const prev = before.find((b) => b.logs.some((x) => nameOf(x) === name && workingSets(x.sets).length));
    const prevLog = prev?.logs.find((x) => nameOf(x) === name);
    let cmp = '';
    if (prev && prevLog) {
      const ps = workingSets(prevLog.sets);
      const vol = (a: { weight: number; reps: number }[]) => a.reduce((t, x) => t + x.weight * x.reps, 0);
      const d = vol(ps) ? Math.round(((vol(sets) - vol(ps)) / vol(ps)) * 100) : 0;
      cmp = ` | volta prima (${new Date(prev.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}): ${ps.map((x) => `${kgTxt(x.weight)}×${x.reps}`).join(', ')} → volume ${d >= 0 ? '+' : ''}${d}%`;
    } else cmp = ' | prima volta';
    for (const st of l.sets) if (st.note) cmp += ` | nota: "${st.note}"`;
    lines.push(`- ${name} (${groupOf(l)}): ${now}${cmp}`);
  }
  lines.push(`Serie per gruppo in questa sessione: ${[...perGroup].map(([g, n]) => `${g} ${n}`).join(', ')}. Volume totale ${Math.round(sessionTonnage(s))} kg.`);
  return lines.join('\n');
}

/** Dati della settimana in corso (lunedì → oggi), confrontati con la settimana scorsa allo stesso punto e completa. */
export function trainingWeekData(
  sessions: Session[],
  days: Day[],
  groupOf: NameOf,
  ideal: Map<string, { min: number; max: number }>,
  now = Date.now(),
): string {
  const monday = new Date(`${mondayISO(new Date(now))}T00:00:00`).getTime();
  const dayIdx = Math.min(6, Math.floor((now - monday) / DAY)); // 0 = lunedì
  const left = 6 - dayIdx;
  const thisWeek = sessions.filter((s) => s.date >= monday && s.date <= now).sort((a, b) => a.date - b.date);
  const lastWeek = sessions.filter((s) => s.date >= monday - 7 * DAY && s.date < monday);
  const lastWeekSamePoint = lastWeek.filter((s) => s.date < monday - 7 * DAY + (dayIdx + 1) * DAY);
  const planned = Math.max(1, days.length);
  const doneIds = new Set(thisWeek.map((s) => s.dayId));
  const todo = days.filter((d) => !doneIds.has(d.id));
  const setsBy = (list: Session[]) => {
    const m = new Map<string, number>();
    for (const s of list) for (const l of s.logs) m.set(groupOf(l), (m.get(groupOf(l)) ?? 0) + workingSets(l.sets).length);
    return m;
  };
  const cur = setsBy(thisWeek);
  const prev = setsBy(lastWeek);
  const groups = [...new Set([...days.flatMap((d) => d.exercises.map((e) => e.group)), ...cur.keys()])];
  const dayName = (s: Session) => {
    const d = days.find((x) => x.id === s.dayId);
    return d ? `${d.name}${d.subtitle ? ` (${d.subtitle})` : ''}` : 'Allenamento';
  };
  const lines: string[] = [];
  lines.push(
    left > 0
      ? `SETTIMANA IN CORSO: oggi è ${WD_LONG[dayIdx]}, giorno ${dayIdx + 1} di 7 (mancano ${left} giorni). La settimana NON è finita: non dire che la frequenza o il volume sono calati; valuta il ritmo rispetto ai giorni passati e cosa resta da fare.`
      : 'SETTIMANA QUASI FINITA: oggi è domenica, puoi fare il bilancio completo.',
  );
  lines.push(`Allenamenti previsti a settimana: ${planned}. Fatti finora: ${thisWeek.length}${thisWeek.length ? ` (${thisWeek.map((s) => `${WD_LONG[(new Date(s.date).getDay() + 6) % 7]} ${dayName(s)}`).join(', ')})` : ''}.`);
  if (todo.length) lines.push(`Giorni della scheda ancora da fare: ${todo.map((d) => `${d.name}${d.subtitle ? ` (${d.subtitle})` : ''}`).join(', ')}.`);
  lines.push(
    `Serie per muscolo finora / ideale per settimana: ${groups.map((g) => `${g} ${cur.get(g) ?? 0}/${ideal.get(g) ? `${ideal.get(g)!.min}-${ideal.get(g)!.max}` : '10-20'}`).join(', ')}.`,
  );
  const vol = (l: Session[]) => Math.round(l.reduce((a, s) => a + sessionTonnage(s), 0));
  lines.push(`Volume finora ${vol(thisWeek)} kg; la settimana scorsa allo stesso punto (fino a ${WD_LONG[dayIdx]}) ${vol(lastWeekSamePoint)} kg con ${lastWeekSamePoint.length} allenamenti.`);
  lines.push(
    `Settimana scorsa completa: ${lastWeek.length} allenamenti su ${planned}, volume ${vol(lastWeek)} kg, serie per muscolo ${groups.map((g) => `${g} ${prev.get(g) ?? 0}`).join(', ')}.`,
  );
  for (const s of thisWeek)
    if (s.recap) lines.push(`Resoconto ${WD_LONG[(new Date(s.date).getDay() + 6) % 7]}: voto ${s.recap.rating}/5, energia ${s.recap.energy}/5${s.recap.pain.length ? `, dolori ${s.recap.pain.join(', ')}` : ''}${s.recap.note ? `, "${s.recap.note}"` : ''}.`);
  return lines.join('\n');
}

const profileLine = (p: UserProfile) =>
  `Profilo: ${p.sex === 'm' ? 'uomo' : 'donna'}, ${p.age} anni, obiettivo ${GOALS.find((g) => g.value === p.goal)?.label}, livello ${EXPERIENCE.find((e) => e.value === p.experience)?.label}.`;

const TRAIN_ONLY =
  "Parla SOLO di allenamento (esercizi, carichi, ripetizioni, serie, recupero, tecnica, dolori). NON parlare di dieta, calorie, proteine o peso corporeo: c'è un'analisi separata per la dieta.";

async function write(prompt: string, label: string, opts: AIOptions): Promise<string> {
  const text = await callAI([{ text: prompt }], { temperature: 0.4, label, ...opts });
  const clean = text.replace(/[*#`]/g, '').trim();
  if (clean.length < 60) throw new Error('Analisi troppo breve, riprova');
  return clean.slice(0, 2500);
}

export function analyzeSession(data: string, memory: string, profile: UserProfile, opts: AIOptions = {}) {
  return write(
    `Sei il personal trainer di questa persona. Analizza QUESTA SESSIONE di allenamento confrontandola con le volte precedenti. In italiano, seconda persona, frasi brevi con numeri ed esercizi presi dai dati, senza markdown.
${TRAIN_ONLY}
Usa ESATTAMENTE queste 3 sezioni, ognuna con il titolo su una riga e 2-4 righe che iniziano con "• ":
✅ COSA È ANDATO BENE
⚠️ DA MIGLIORARE
🎯 LA PROSSIMA VOLTA (carichi o ripetizioni concreti per gli esercizi principali)
${profileLine(profile)}
${data}
Contesto dello storico (solo per capire stalli e dolori):
${memory.slice(0, 1500)}`,
    'Il coach analizza la sessione…',
    opts,
  );
}

export function analyzeTrainingWeek(data: string, memory: string, profile: UserProfile, opts: AIOptions = {}) {
  return write(
    `Sei il personal trainer di questa persona. Analizza la SETTIMANA DI ALLENAMENTO in corso. In italiano, seconda persona, frasi brevi con numeri presi dai dati, senza markdown.
${TRAIN_ONLY}
Attenzione: se la settimana non è finita non è un calo; giudica il ritmo rispetto ai giorni passati e di' cosa fare nei giorni che restano.
Usa ESATTAMENTE queste 3 sezioni, ognuna con il titolo su una riga e 2-4 righe che iniziano con "• ":
📅 A CHE PUNTO SEI
💪 MUSCOLI E VOLUME
🎯 NEI PROSSIMI GIORNI
${profileLine(profile)}
${data}
Contesto dello storico:
${memory.slice(0, 1500)}`,
    'Il coach analizza la settimana…',
    opts,
  );
}

/* ---------------- Dieta ---------------- */

export interface DietDay {
  date: string;
  /** obiettivo del giorno */
  target: { kcal: number; protein: number; carbs: number; fat: number };
  eaten: { kcal: number; protein: number; carbs: number; fat: number };
  /** giorno di allenamento (calorie più alte) */
  training: boolean | null;
  meals: { meal: string; items: string[]; kcal: number }[];
  complete?: boolean;
  hunger?: number;
  cheat?: string;
  note?: string;
}

const r = (n: number) => Math.round(n);

export function dietDayData(d: DietDay, now = Date.now()): string {
  const isToday = d.date === toISODate(new Date(now));
  const lines: string[] = [];
  lines.push(
    `GIORNATA: ${fmtDay(new Date(`${d.date}T12:00:00`).getTime())}${d.training === true ? ' (giorno di allenamento)' : d.training === false ? ' (giorno di riposo)' : ''}.` +
      (isToday ? ` È OGGI e sono le ${new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}: la giornata potrebbe non essere finita, considera i pasti che mancano.` : ''),
  );
  lines.push(`Obiettivo: ${r(d.target.kcal)} kcal, proteine ${r(d.target.protein)} g, carboidrati ${r(d.target.carbs)} g, grassi ${r(d.target.fat)} g.`);
  lines.push(`Mangiato: ${r(d.eaten.kcal)} kcal, proteine ${r(d.eaten.protein)} g, carboidrati ${r(d.eaten.carbs)} g, grassi ${r(d.eaten.fat)} g.`);
  for (const m of d.meals) lines.push(`- ${m.meal} (${r(m.kcal)} kcal): ${m.items.join(', ') || 'niente'}`);
  if (d.complete === false) lines.push("L'utente dice che la giornata NON è registrata tutta.");
  if (d.hunger) lines.push(`Fame durante il giorno: ${d.hunger}/5.`);
  if (d.cheat) lines.push(`Sgarri: ${d.cheat}.`);
  if (d.note) lines.push(`Nota: "${d.note}".`);
  return lines.join('\n');
}

export function dietWeekData(list: DietDay[], prev: DietDay[] = [], now = Date.now()): string {
  const monday = mondayISO(new Date(now));
  const dayIdx = Math.min(6, Math.floor((now - new Date(`${monday}T00:00:00`).getTime()) / DAY));
  const lines: string[] = [];
  lines.push(
    dayIdx < 6
      ? `SETTIMANA IN CORSO: oggi è ${WD_LONG[dayIdx]}, giorno ${dayIdx + 1} di 7. La settimana non è finita: valuta i giorni passati e cosa migliorare nei prossimi.`
      : 'SETTIMANA QUASI FINITA: oggi è domenica, fai il bilancio.',
  );
  if (!list.length) lines.push('Nessun giorno registrato nel diario questa settimana.');
  for (const d of list)
    lines.push(
      `- ${WD_LONG[(new Date(`${d.date}T12:00:00`).getDay() + 6) % 7]}${d.training ? ' (allenamento)' : ''}: ${r(d.eaten.kcal)}/${r(d.target.kcal)} kcal, proteine ${r(d.eaten.protein)}/${r(d.target.protein)} g, carbo ${r(d.eaten.carbs)} g, grassi ${r(d.eaten.fat)} g` +
        `${d.complete === false ? ' [registrata solo in parte]' : ''}${d.hunger ? `, fame ${d.hunger}/5` : ''}${d.cheat ? `, sgarro: ${d.cheat}` : ''}`,
    );
  const full = list.filter((d) => d.complete !== false && d.date < toISODate(new Date(now)));
  if (full.length) {
    const avg = (f: (d: DietDay) => number) => r(full.reduce((a, d) => a + f(d), 0) / full.length);
    const ok = full.filter((d) => Math.abs(d.eaten.kcal - d.target.kcal) <= d.target.kcal * 0.1 && d.eaten.protein >= d.target.protein * 0.85).length;
    lines.push(`Media dei giorni completi già finiti: ${avg((d) => d.eaten.kcal)} kcal (obiettivo medio ${avg((d) => d.target.kcal)}), proteine ${avg((d) => d.eaten.protein)} g. Giorni in obiettivo: ${ok}/${full.length}.`);
  }
  const prevFull = prev.filter((d) => d.complete !== false);
  if (prevFull.length) {
    const avg = (f: (d: DietDay) => number) => r(prevFull.reduce((a, d) => a + f(d), 0) / prevFull.length);
    const ok = prevFull.filter((d) => Math.abs(d.eaten.kcal - d.target.kcal) <= d.target.kcal * 0.1 && d.eaten.protein >= d.target.protein * 0.85).length;
    lines.push(
      `Settimana scorsa (per confronto): ${prevFull.length} giorni completi, media ${avg((d) => d.eaten.kcal)} kcal (obiettivo ${avg((d) => d.target.kcal)}), proteine ${avg((d) => d.eaten.protein)} g, in obiettivo ${ok}/${prevFull.length}${prev.some((d) => d.cheat) ? `, sgarri: ${prev.filter((d) => d.cheat).map((d) => d.cheat).join('; ')}` : ''}.`,
    );
  }
  const foods = new Map<string, number>();
  for (const d of list) for (const m of d.meals) for (const i of m.items) foods.set(i, (foods.get(i) ?? 0) + 1);
  const top = [...foods].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) lines.push(`Cibi più frequenti: ${top.map(([n, c]) => `${n} (${c})`).join(', ')}.`);
  return lines.join('\n');
}

const DIET_ONLY =
  "Parla SOLO di alimentazione (calorie mangiate, proteine, carboidrati, grassi, pasti, cibi, fame, sgarri). NON parlare di allenamento: c'è un'analisi separata. Non cambiare l'obiettivo calorico: lo aggiorna l'app ogni lunedì.";

export function analyzeDietDay(data: string, profile: UserProfile, opts: AIOptions = {}) {
  return write(
    `Sei il nutrizionista di questa persona. Analizza QUESTA GIORNATA del diario alimentare. In italiano, seconda persona, frasi brevi con numeri e cibi presi dai dati, senza markdown.
${DIET_ONLY}
Usa ESATTAMENTE queste 3 sezioni, ognuna con il titolo su una riga e 2-3 righe che iniziano con "• ":
✅ COSA VA BENE
⚠️ DA SISTEMARE
🍽️ ${'COSA MANGIARE ADESSO O DOMANI (idee concrete con grammi)'}
${profileLine(profile)}
${data}`,
    'Il dietologo analizza la giornata…',
    opts,
  );
}

export function analyzeDietWeek(data: string, profile: UserProfile, opts: AIOptions = {}) {
  return write(
    `Sei il nutrizionista di questa persona. Analizza la SETTIMANA del diario alimentare. In italiano, seconda persona, frasi brevi con numeri e cibi presi dai dati, senza markdown.
${DIET_ONLY}
Usa ESATTAMENTE queste 3 sezioni, ognuna con il titolo su una riga e 2-4 righe che iniziano con "• ":
📅 A CHE PUNTO SEI
⚠️ DA SISTEMARE
🎯 NEI PROSSIMI GIORNI
${profileLine(profile)}
${data}`,
    'Il dietologo analizza la settimana…',
    opts,
  );
}
