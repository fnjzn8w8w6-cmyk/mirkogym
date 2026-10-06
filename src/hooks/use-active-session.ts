import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveSession, Day, DraftExercise, DraftSet, Session, SetLog } from '@/types';
import { clearActiveSession, finishSession, newId, saveActiveSession, settle } from '@/lib/firestore';
import { useData } from './data-context';

const LOCAL_KEY = 'mirkogym.activeSession';
const SYNC_DELAY = 400;

export const emptySet = (): DraftSet => ({ weight: '', reps: '', rir: '', done: false });

function readLocal(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}
function writeLocal(s: ActiveSession | null): void {
  try {
    if (s) localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignorato */
  }
}

export const parseNum = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Sessione in corso (versione remota), per banner "Riprendi" e avvio. */
export function useActiveSession() {
  const { activeSession, uid } = useData();
  const local = readLocal();
  // La copia locale è più fresca se appartiene alla stessa sessione
  const current = activeSession && local?.id === activeSession.id && local.updatedAt > activeSession.updatedAt ? local : activeSession;

  const start = useCallback(
    async (day: Day, deload: boolean): Promise<ActiveSession | null> => {
      if (!uid) return null;
      const s: ActiveSession = {
        id: newId(uid),
        dayId: day.id,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        deload,
        exercises: day.exercises.map((e) => ({
          exerciseId: e.id,
          name: e.name,
          group: e.group,
          sets: Array.from({ length: e.sets }, emptySet),
        })),
      };
      writeLocal(s);
      await settle(saveActiveSession(uid, s));
      return s;
    },
    [uid],
  );

  const discard = useCallback(async () => {
    writeLocal(null);
    if (uid) await settle(clearActiveSession(uid));
  }, [uid]);

  return { activeSession: current, start, discard };
}

/** Bozza modificabile della sessione, usata dalla schermata di allenamento. */
export function useSessionDraft(initial: ActiveSession) {
  const { uid, bodyLogs } = useData();
  const [draft, setDraft] = useState<ActiveSession>(initial);
  const pending = useRef<ActiveSession | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const s = pending.current;
    pending.current = null;
    if (s && uid) void saveActiveSession(uid, s).catch((e: unknown) => console.warn('Sync sessione fallita', e));
  }, [uid]);

  const commit = useCallback(
    (updater: (d: ActiveSession) => ActiveSession) => {
      setDraft((prev) => {
        const next = { ...updater(prev), updatedAt: Date.now() };
        writeLocal(next);
        pending.current = next;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, SYNC_DELAY);
        return next;
      });
    },
    [flush],
  );

  // Flush su uscita/background (iOS può sospendere la PWA in qualsiasi momento)
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  /** Annulla eventuali salvataggi pendenti (da chiamare prima di scartare la sessione). */
  const cancelSync = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const mapExercise = (exIdx: number, fn: (e: DraftExercise) => DraftExercise) =>
    commit((d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) }));

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<DraftSet>) =>
    mapExercise(exIdx, (e) => ({ ...e, sets: e.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)) }));

  const addSet = (exIdx: number) =>
    mapExercise(exIdx, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { ...emptySet(), weight: last?.weight ?? '' }] };
    });

  const removeSet = (exIdx: number, setIdx: number) =>
    mapExercise(exIdx, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== setIdx) }));

  const addExercise = (name: string, group: string, sets: number, libraryId?: string) =>
    commit((d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        {
          libraryId,
          exerciseId: libraryId ? `lib-${libraryId}` : `extra-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: name.trim(),
          group,
          extra: true,
          sets: Array.from({ length: sets }, emptySet),
        },
      ],
    }));

  const removeExercise = (exIdx: number) =>
    commit((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== exIdx) }));

  const setNotes = (notes: string) => commit((d) => ({ ...d, notes }));
  const setReadiness = (readiness: ActiveSession['readiness']) => commit((d) => ({ ...d, readiness }));

  /** Inserisce serie di riscaldamento (tipo W) in testa all'esercizio. */
  const insertWarmups = (exIdx: number, sets: { weight: number; reps: number }[]) =>
    mapExercise(exIdx, (e) => ({
      ...e,
      sets: [
        ...sets.map((w): DraftSet => ({ ...emptySet(), type: 'warmup', weight: String(w.weight).replace('.', ','), reps: String(w.reps) })),
        ...e.sets,
      ],
    }));

  /** Toglie le serie di riscaldamento non ancora fatte e non le ripropone. */
  const removeWarmups = (exIdx: number) =>
    mapExercise(exIdx, (e) => ({ ...e, warmup: 'dismissed', sets: e.sets.filter((st) => st.type !== 'warmup' || st.done) }));

  /** Riscaldamenti suggeriti all'avvio: una sola volta per sessione. */
  const autoWarmups = (plan: { exIdx: number; sets: { weight: number; reps: number }[] }[]) =>
    commit((d) => ({
      ...d,
      warmupsInit: true,
      exercises: d.exercises.map((e, i) => {
        const p = plan.find((x) => x.exIdx === i);
        if (!p || e.warmup || e.sets.some((st) => st.type === 'warmup' || st.done)) return e;
        return {
          ...e,
          warmup: 'auto',
          sets: [...p.sets.map((w): DraftSet => ({ ...emptySet(), type: 'warmup', weight: String(w.weight).replace('.', ','), reps: String(w.reps) })), ...e.sets],
        };
      }),
    }));

  /** Modifica dell'esercizio durante la sessione: numero di serie allenanti e parametri di oggi. */
  const editExercise = (exIdx: number, patch: { sets: number; override?: DraftExercise['override'] }) =>
    mapExercise(exIdx, (e) => {
      const working = e.sets.filter((st) => st.type !== 'warmup');
      let sets = e.sets;
      if (patch.sets > working.length) {
        const last = working[working.length - 1];
        sets = [...sets, ...Array.from({ length: patch.sets - working.length }, () => ({ ...emptySet(), weight: last?.weight ?? '' }))];
      } else if (patch.sets < working.length) {
        // toglie dal fondo solo serie allenanti non ancora fatte
        let drop = working.length - patch.sets;
        sets = [...sets].reverse().filter((st) => (drop > 0 && st.type !== 'warmup' && !st.done ? (drop--, false) : true)).reverse();
      }
      return { ...e, sets, override: patch.override === undefined ? e.override : patch.override };
    });

  /** Sostituisce l'esercizio (es. macchina occupata) mantenendo le serie già impostate. */
  const replaceExercise = (
    exIdx: number,
    next: { exerciseId: string; name: string; group: string; extra?: boolean; libraryId?: string },
  ) =>
    mapExercise(exIdx, (e) => ({
      ...e,
      ...next,
      extra: next.extra,
      libraryId: next.libraryId,
      sets: e.sets.map((st) => (st.done ? st : { ...st, weight: '', isPersonalRecord: false })),
    }));

  /** Salva la sessione definitiva (solo serie completate) e chiude la bozza. */
  const finish = useCallback(async (): Promise<Session | null> => {
    if (!uid) return null;
    if (timer.current) window.clearTimeout(timer.current);
    pending.current = null;
    const logs = draft.exercises
      .map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        group: e.group,
        extra: e.extra,
        sets: e.sets
          .filter((s) => s.done)
          .map((s): SetLog | null => {
            const weight = parseNum(s.weight);
            const reps = parseNum(s.reps);
            if (weight == null || reps == null) return null;
            const rir = parseNum(s.rir);
            return {
              type: s.type && s.type !== 'normal' ? s.type : undefined,
              weight,
              reps,
              rir: rir ?? undefined,
              isPersonalRecord: s.isPersonalRecord || undefined,
            };
          })
          .filter((s): s is SetLog => s !== null),
      }))
      .filter((l) => l.sets.length > 0);
    const lastWeight = [...bodyLogs].find((b) => b.weight != null)?.weight;
    const session: Session = {
      id: draft.id,
      date: draft.startedAt,
      dayId: draft.dayId,
      duration: Math.round((Date.now() - draft.startedAt) / 1000),
      logs,
      bodyweightSnapshot: lastWeight,
      notes: draft.notes?.trim() || undefined,
      deload: draft.deload || undefined,
    };
    await settle(finishSession(uid, session));
    writeLocal(null);
    return session;
  }, [uid, draft, bodyLogs]);

  return {
    draft,
    updateSet,
    addSet,
    removeSet,
    addExercise,
    removeExercise,
    setNotes,
    setReadiness,
    insertWarmups,
    removeWarmups,
    autoWarmups,
    editExercise,
    replaceExercise,
    finish,
    cancelSync,
  };
}

export const clearLocalActiveSession = () => writeLocal(null);
