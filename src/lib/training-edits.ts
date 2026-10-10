import type { Day, Exercise } from '@/types';
import { callAIJson, num, oneOf, str, strArr, type AIOptions } from './ai';
import { EXPERIENCE, GOALS, type UserProfile } from './metabolism';
import { NAME_IT } from './exercise-library';
import { libraryIdOf } from './seed-data';
import {
  PRIORITY_KEYS,
  SLOT_IDS,
  SLOT_LABEL,
  alternativesFor,
  availableFor,
  fitToTime,
  prescribe,
  sessionMinutes,
  slotCompound,
  slotGroup,
  slotOfExercise,
  type CoachPrefs,
  type PriorityKey,
} from './program-generator';

/**
 * Personal trainer: la richiesta dell'utente diventa un elenco di MODIFICHE MIRATE alla scheda attuale
 * (sostituire, togliere, aggiungere un esercizio, cambiare le serie, stare nel tempo). La scheda viene
 * ricostruita da zero solo se l'utente lo chiede esplicitamente.
 */

export type TrainingEdit =
  | { op: 'replace'; exerciseId: string; withId?: string; reason: string; /** il coach aveva indicato un esercizio (anche se non valido) */ asked?: boolean }
  | { op: 'remove'; exerciseId: string; reason: string }
  | { op: 'add'; dayId: string; libraryId: string; sets?: number; reason: string }
  | { op: 'sets'; exerciseId: string; sets: number; reason: string };

export interface TrainingChange {
  scope: 'edit' | 'rebuild';
  edits: TrainingEdit[];
  maxMinutes?: number;
  /** preferenze aggiornate (restano valide per le ricostruzioni future) */
  prefs: CoachPrefs;
  summary: string;
}

export interface TrainingDiff {
  day: string;
  kind: 'replace' | 'remove' | 'add' | 'sets' | 'time';
  before?: string;
  after?: string;
  reason?: string;
}

/** Id della libreria di un esercizio della scheda (anche per le schede create a mano). */
const libId = (e: Exercise): string => {
  const known = libraryIdOf(e);
  if (known) return known;
  const n = e.name.trim().toLowerCase();
  return Object.entries(NAME_IT).find(([, it]) => it.toLowerCase() === n)?.[0] ?? '';
};

const describeDay = (d: Day) =>
  `${d.id} "${d.name} · ${d.subtitle}":\n${d.exercises.map((e) => `  - ${e.id} = ${e.name}${libId(e) ? ` [${libId(e)}]` : ''} ${e.sets}×${e.repMin}-${e.repMax}`).join('\n')}`;

export async function interpretTrainingChange(
  request: string,
  profile: UserProfile,
  days: Day[],
  current: CoachPrefs | null | undefined,
  opts: AIOptions = {},
  memory = '',
): Promise<TrainingChange> {
  const exerciseList = Object.entries(NAME_IT)
    .filter(([id]) => availableFor(id, profile.equipment))
    .map(([id, name]) => `${id} = ${name}`)
    .join('\n');
  const prompt = `Sei un personal trainer esperto. L'utente ha già una scheda e ti chiede una modifica. Fai SOLO le modifiche richieste, lasciando il resto della scheda invariato.
Profilo: ${profile.sex === 'm' ? 'uomo' : 'donna'}, ${profile.age} anni, livello ${EXPERIENCE.find((e) => e.value === profile.experience)?.label}, obiettivo ${GOALS.find((g) => g.value === profile.goal)?.label}.
${memory ? `Storico dell'atleta (usalo per scegliere alternative compatibili con dolori e stalli; NON fare modifiche non richieste):\n${memory.slice(0, 1500)}\n` : ''}
SCHEDA ATTUALE:
${days.map(describeDay).join('\n')}

RICHIESTA DELL'UTENTE: """${request.slice(-3500)}"""

Rispondi SOLO con JSON:
{
 "scope": "edit" (default: modifiche mirate) oppure "rebuild" (SOLO se l'utente chiede esplicitamente una scheda nuova/diversa, un altro split o un altro numero di giorni),
 "edits": [
   {"op": "replace", "exerciseId": "id dalla scheda", "withId": "id dall'elenco o null per far scegliere all'app", "reason": "breve"},
   {"op": "remove", "exerciseId": "...", "reason": "..."},
   {"op": "add", "dayId": "day1…", "libraryId": "id dall'elenco", "sets": numero, "reason": "..."},
   {"op": "sets", "exerciseId": "...", "sets": numero 1-6, "reason": "..."}
 ],
 "maxMinutes": numero 20-150 solo se l'utente indica un tempo massimo, altrimenti null,
 "avoidSlots": movimenti da evitare in futuro (per dolori/infortuni) tra: ${SLOT_IDS.join(', ')},
 "avoidExercises": id di esercizi da non riproporre,
 "priorities": muscoli da enfatizzare tra: ${PRIORITY_KEYS.join(', ')} (solo se richiesto),
 "injuries": ["breve descrizione in italiano"],
 "summary": "1-2 frasi in italiano, seconda persona, che descrivono ESATTAMENTE le modifiche"
}
Regole:
- Se l'utente nomina un esercizio (es. "hack squat"), modifica SOLO le occorrenze di quell'esercizio nella scheda.
- Con dolore al ginocchio non proporre squat, affondi o leg extension come sostituti; con dolore lombare niente stacchi/squat; con dolore alla spalla niente spinte sopra la testa.
- Usa solo id presenti nella scheda (exerciseId, dayId) o nell'elenco (withId, libraryId).
Movimenti: ${SLOT_IDS.map((s) => `${s} = ${SLOT_LABEL[s]}`).join('; ')}
Esercizi disponibili:
${exerciseList}`;

  const exIds = new Set(days.flatMap((d) => d.exercises.map((e) => e.id)));
  const dayIds = new Set(days.map((d) => d.id));
  return callAIJson(
    prompt,
    (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const summary = str(r.summary, 400);
      if (!summary) throw new Error('Il coach non ha capito la richiesta: prova a riformularla');
      const edits: TrainingEdit[] = [];
      for (const e of Array.isArray(r.edits) ? r.edits : []) {
        const o = (e ?? {}) as Record<string, unknown>;
        const reason = str(o.reason, 120);
        const exId = str(o.exerciseId, 40);
        const op = oneOf(o.op, ['replace', 'remove', 'add', 'sets'] as const);
        if (op === 'replace' && exIds.has(exId)) {
          const w = str(o.withId, 80);
          edits.push({ op, exerciseId: exId, withId: w in NAME_IT && availableFor(w, profile.equipment) ? w : undefined, asked: w !== '' && w !== 'null', reason });
        } else if (op === 'remove' && exIds.has(exId)) edits.push({ op, exerciseId: exId, reason });
        else if (op === 'add' && dayIds.has(str(o.dayId, 20)) && str(o.libraryId, 80) in NAME_IT)
          edits.push({ op, dayId: str(o.dayId, 20), libraryId: str(o.libraryId, 80), sets: num(o.sets, 1, 6), reason });
        else if (op === 'sets' && exIds.has(exId) && num(o.sets, 1, 6)) edits.push({ op, exerciseId: exId, sets: Math.round(num(o.sets, 1, 6) as number), reason });
      }
      const list = <T extends string>(v: unknown, allowed: readonly T[]) =>
        (Array.isArray(v) ? v : []).map((x) => oneOf(x, allowed)).filter((x): x is T => !!x);
      const avoidSlots = list(r.avoidSlots, SLOT_IDS);
      const avoidExercises = strArr(r.avoidExercises, 20).filter((id) => id in NAME_IT);
      const priorities = list(r.priorities, PRIORITY_KEYS) as PriorityKey[];
      const maxMinutes = num(r.maxMinutes, 20, 150);
      const prefs: CoachPrefs = {
        request: request.trim(),
        summary,
        priorities: [...new Set([...(current?.priorities ?? []), ...priorities])].slice(0, 4),
        avoidSlots: [...new Set([...(current?.avoidSlots ?? []), ...avoidSlots])],
        avoidExercises: [...new Set([...(current?.avoidExercises ?? []), ...avoidExercises])],
        maxMinutes: maxMinutes ?? current?.maxMinutes,
        injuries: [...new Set([...(current?.injuries ?? []), ...strArr(r.injuries, 5)])],
      };
      return { scope: r.scope === 'rebuild' ? 'rebuild' : 'edit', edits, maxMinutes, prefs, summary };
    },
    { temperature: 0.2, label: 'Il coach sta leggendo la tua richiesta…', ...opts },
  );
}

/** Applica le modifiche alla scheda attuale e restituisce la nuova scheda con l'elenco dei cambiamenti. */
export function applyTrainingChange(days: Day[], change: TrainingChange, profile: UserProfile): { days: Day[]; diff: TrainingDiff[] } {
  const diff: TrainingDiff[] = [];
  const label = (d: Day) => `${d.name} · ${d.subtitle}`;
  const stamp = Date.now().toString(36).slice(-4);
  let out = days.map((d) => ({ ...d, exercises: [...d.exercises] }));

  const newExercise = (libraryId: string, like: Exercise | null, sets?: number): Exercise => {
    const slot = slotOfExercise(libraryId);
    const compound = slot ? slotCompound(slot) : false;
    const rx = prescribe(profile.goal, profile.experience, compound, false);
    return {
      id: `${like?.id ?? 'x'}-${stamp}`,
      libraryId,
      name: NAME_IT[libraryId] ?? libraryId.replace(/_/g, ' '),
      group: slot ? slotGroup(slot) : (like?.group ?? 'Core'),
      sets: sets ?? like?.sets ?? rx.sets,
      repMin: like?.repMin ?? rx.repMin,
      repMax: like?.repMax ?? rx.repMax,
      rirTarget: like?.rirTarget ?? rx.rir,
      rest: like?.rest ?? rx.rest,
      notes: 'Modificato dal coach',
    };
  };

  // Rete di sicurezza: ogni occorrenza di un esercizio da evitare viene sostituita (se l'AI l'ha dimenticata)
  const edits = [...change.edits];
  for (const d of days)
    for (const x of d.exercises)
      if (change.prefs.avoidExercises.includes(libId(x)) && !edits.some((e) => e.op !== 'add' && e.exerciseId === x.id))
        edits.push({ op: 'replace', exerciseId: x.id, reason: 'da evitare' });

  for (const e of edits) {
    out = out.map((d) => {
      if (e.op === 'add') {
        if (d.id !== e.dayId || d.exercises.some((x) => libId(x) === e.libraryId)) return d;
        const ex = newExercise(e.libraryId, null, e.sets);
        ex.id = `${d.id}-add-${stamp}-${d.exercises.length}`;
        diff.push({ day: label(d), kind: 'add', after: `${ex.name} ${ex.sets}×${ex.repMin}-${ex.repMax}`, reason: e.reason });
        return { ...d, exercises: [...d.exercises, ex] };
      }
      const idx = d.exercises.findIndex((x) => x.id === e.exerciseId);
      if (idx < 0) return d;
      const old = d.exercises[idx];
      if (e.op === 'remove') {
        diff.push({ day: label(d), kind: 'remove', before: old.name, reason: e.reason });
        return { ...d, exercises: d.exercises.filter((_, i) => i !== idx) };
      }
      if (e.op === 'sets') {
        diff.push({ day: label(d), kind: 'sets', before: `${old.name} ${old.sets} serie`, after: `${e.sets} serie`, reason: e.reason });
        return { ...d, exercises: d.exercises.map((x, i) => (i === idx ? { ...x, sets: e.sets } : x)) };
      }
      // replace: alternativa dell'AI se valida, altrimenti la scelgo con le regole (movimenti sicuri)
      const used = d.exercises.map(libId);
      const oldLib = libId(old);
      const alts = alternativesFor(oldLib, {
        avoidSlots: change.prefs.avoidSlots,
        avoidIds: [...change.prefs.avoidExercises, oldLib],
        used,
        equipment: profile.equipment,
      });
      const aiPick = e.withId && !used.includes(e.withId) && !change.prefs.avoidExercises.includes(e.withId) ? e.withId : undefined;
      const aiSlot = aiPick ? slotOfExercise(aiPick) : null;
      const pick = aiPick && !(aiSlot && change.prefs.avoidSlots.includes(aiSlot)) ? aiPick : alts[0];
      if (!pick) {
        diff.push({ day: label(d), kind: 'remove', before: old.name, reason: `${e.reason} (nessuna alternativa sicura)` });
        return { ...d, exercises: d.exercises.filter((_, i) => i !== idx) };
      }
      const ex = newExercise(pick, old);
      // se l'esercizio indicato dal coach non si può usare lo dico chiaramente: la scelta è dell'app
      const own = e.asked && pick !== e.withId;
      diff.push({ day: label(d), kind: 'replace', before: old.name, after: ex.name, reason: own ? `${e.reason} (scelta dall'app: l'esercizio indicato dal coach non è disponibile)` : e.reason });
      return { ...d, exercises: d.exercises.map((x, i) => (i === idx ? ex : x)) };
    });
  }

  if (change.maxMinutes) {
    const prio = new Set(change.prefs.priorities);
    out = out.map((d) => {
      const before = sessionMinutes(d);
      if (before <= change.maxMinutes!) return d;
      const fitted = fitToTime(d, change.maxMinutes!, prio);
      diff.push({ day: label(d), kind: 'time', before: `~${before} min`, after: `~${sessionMinutes(fitted)} min` });
      return fitted;
    });
  }
  return { days: out, diff };
}
