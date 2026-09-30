import type { BodyLog, Session } from '@/types';
import { callAI, callAIJson, num, oneOf, str, strArr, type AIOptions } from './ai';
import { GOALS, EXPERIENCE, type Goal, type Nutrition, type UserProfile } from './metabolism';
import { PRIORITY_KEYS, SLOT_IDS, SLOT_LABEL, type CoachPrefs } from './program-generator';
import { NAME_IT } from './exercise-library';
import { sessionTonnage } from './analytics';

/* =====================================================================
 * PERSONAL TRAINER — richiesta in linguaggio naturale → preferenze strutturate
 * ===================================================================== */

export async function interpretTrainingRequest(request: string, profile: UserProfile, opts: AIOptions = {}): Promise<CoachPrefs> {
  const exerciseList = Object.entries(NAME_IT)
    .map(([id, name]) => `${id} = ${name}`)
    .join('\n');
  const prompt = `Sei un personal trainer esperto. Un utente descrive cosa vuole dal suo allenamento. Traduci la richiesta in impostazioni per un generatore di schede.
Profilo: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}, ${profile.daysPerWeek} giorni/settimana.

RICHIESTA DELL'UTENTE: """${request.slice(0, 1200)}"""

Valori ammessi:
- priorities (muscoli da enfatizzare): ${PRIORITY_KEYS.join(', ')}
- avoidSlots (movimenti da evitare, es. per dolori/infortuni o perché non piacciono):
${SLOT_IDS.map((s) => `  ${s} = ${SLOT_LABEL[s]}`).join('\n')}
- avoidExercises: id di esercizi specifici da evitare, SOLO da questo elenco:
${exerciseList}

Regole: con dolore al ginocchio evita squat e lunge (ed eventualmente kneeExt); con dolore lombare evita hinge e squat; con dolore alla spalla evita vpush (ed eventualmente hpush). Non inventare valori fuori elenco. maxMinutes solo se l'utente indica un tempo (numero tra 20 e 150).
Rispondi SOLO con JSON:
{"priorities": [...], "avoidSlots": [...], "avoidExercises": [...], "maxMinutes": numero o null, "injuries": ["breve descrizione in italiano"], "summary": "1-2 frasi in italiano, seconda persona, su cosa hai capito e cosa cambierai"}`;

  return callAIJson(
    prompt,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const priorities = (Array.isArray(r.priorities) ? r.priorities : [])
        .map((x) => oneOf(x, PRIORITY_KEYS))
        .filter((x): x is (typeof PRIORITY_KEYS)[number] => !!x);
      const avoidSlots = (Array.isArray(r.avoidSlots) ? r.avoidSlots : [])
        .map((x) => oneOf(x, SLOT_IDS))
        .filter((x): x is (typeof SLOT_IDS)[number] => !!x);
      const avoidExercises = strArr(r.avoidExercises, 20).filter((id) => id in NAME_IT);
      const summary = str(r.summary, 400);
      if (!summary) throw new Error("Il coach non ha capito la richiesta: prova a riformularla");
      return {
        request: request.trim(),
        summary,
        priorities: [...new Set(priorities)].slice(0, 4),
        avoidSlots: [...new Set(avoidSlots)],
        avoidExercises,
        maxMinutes: num(r.maxMinutes, 20, 150),
        injuries: strArr(r.injuries, 5),
      };
    },
    { temperature: 0.2, label: 'Il coach sta leggendo la tua richiesta…', ...opts },
  );
}

/* =====================================================================
 * DIETOLOGO — piano alimentare su misura (numeri calcolati dall'app)
 * ===================================================================== */

export type Diet = 'onnivora' | 'vegetariana' | 'vegana' | 'pescetariana';
export const DIETS: { value: Diet; label: string; emoji: string }[] = [
  { value: 'onnivora', label: 'Onnivora', emoji: '🍗' },
  { value: 'pescetariana', label: 'Pescetariana', emoji: '🐟' },
  { value: 'vegetariana', label: 'Vegetariana', emoji: '🥚' },
  { value: 'vegana', label: 'Vegana', emoji: '🌱' },
];

export interface NutritionPrefs {
  diet: Diet;
  meals: 3 | 4 | 5;
  allergies: string;
  dislikes: string;
  likes: string;
  cooking: 'poco' | 'medio' | 'molto';
}

/* =====================================================================
 * CALORIE ADATTIVE — confronto tra andamento reale del peso e atteso (stile MacroFactor)
 * ===================================================================== */

/** Variazione di peso attesa a settimana (frazione del peso corporeo). */
const EXPECTED_RATE: Record<Goal, number> = { cut: -0.005, bulk: 0.0025, strength: 0.001, maintain: 0 };

export interface Adaptive {
  /** kg/settimana misurati (regressione lineare sulle pesate) */
  actual: number;
  expected: number;
  /** correzione suggerita in kcal/giorno (arrotondata a 50) */
  suggestion: number;
  days: number;
  points: number;
  message: string;
}

export function adaptiveCalories(logs: BodyLog[], profile: UserProfile): Adaptive | null {
  const since = Date.now() - 28 * 86400000;
  const pts = logs
    .filter((l) => l.weight != null && new Date(l.date).getTime() >= since)
    .map((l) => ({ x: new Date(l.date).getTime() / 86400000, y: l.weight as number }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 4) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  if (span < 10) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0); // kg/giorno
  const actual = slope * 7;
  const expected = EXPECTED_RATE[profile.goal] * my;
  // 1 kg di tessuto ≈ 7700 kcal
  const raw = ((expected - actual) * 7700) / 7;
  const suggestion = Math.max(-300, Math.min(300, Math.round(raw / 50) * 50));
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} kg/sett.`;
  const message =
    Math.abs(suggestion) < 100
      ? `Stai andando come previsto (${fmt(actual)}, atteso ${fmt(expected)}): nessuna modifica.`
      : suggestion > 0
        ? `Il peso ${actual < expected ? 'scende più del previsto' : 'sale meno del previsto'} (${fmt(actual)} vs ${fmt(expected)}): consiglio +${suggestion} kcal al giorno.`
        : `Il peso ${actual > expected ? 'sale più del previsto' : 'scende meno del previsto'} (${fmt(actual)} vs ${fmt(expected)}): consiglio ${suggestion} kcal al giorno.`;
  return { actual, expected, suggestion: Math.abs(suggestion) < 100 ? 0 : suggestion, days: Math.round(span), points: pts.length, message };
}

/* =====================================================================
 * CHAT — domande libere al coach, con il contesto dell'utente
 * ===================================================================== */

export interface ChatMessage {
  role: 'user' | 'coach';
  text: string;
}

export function coachContext(profile: UserProfile | undefined, target: Nutrition | null, sessions: Session[], bodyLogs: BodyLog[]): string {
  const last = sessions.slice(0, 5).map((s) => `${new Date(s.date).toLocaleDateString('it-IT')}: ${s.logs.length} esercizi, ${Math.round(sessionTonnage(s))} kg di volume`);
  const w = bodyLogs.filter((b) => b.weight != null).slice(0, 5).map((b) => `${b.date}: ${b.weight} kg${b.bodyFat ? `, BF ${b.bodyFat}%` : ''}`);
  return [
    profile
      ? `Utente: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, ${profile.heightCm} cm, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}, ${profile.daysPerWeek} allenamenti/settimana.`
      : '',
    target ? `Obiettivi nutrizionali: ${target.target} kcal, P ${target.protein} g, C ${target.carbs} g, G ${target.fat} g.` : '',
    last.length ? `Ultimi allenamenti: ${last.join('; ')}.` : 'Nessun allenamento registrato.',
    w.length ? `Ultime pesate: ${w.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function askCoach(question: string, history: ChatMessage[], context: string, opts: AIOptions = {}): Promise<string> {
  const convo = history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Utente' : 'Coach'}: ${m.text}`)
    .join('\n');
  const prompt = `Sei il coach di MirkoGym: personal trainer e nutrizionista sportivo. Rispondi in italiano, in modo pratico e motivante, massimo 150 parole, con elenchi brevi se utile. Basati sulle evidenze scientifiche. Se la domanda riguarda dolori, patologie, farmaci o disturbi alimentari, dai indicazioni generali e consiglia di rivolgersi a un medico o professionista. Non proporre diete sotto 1200 kcal né pratiche pericolose.
CONTESTO UTENTE:
${context}
${convo ? `CONVERSAZIONE:\n${convo}\n` : ''}Utente: ${question.slice(0, 1000)}
Coach:`;
  const text = await callAI([{ text: prompt }], { temperature: 0.6, label: 'Il coach sta scrivendo…', ...opts });
  return text.trim().slice(0, 2500);
}
