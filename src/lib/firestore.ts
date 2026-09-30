import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ActiveSession, BackupFile, BodyLog, Day, FoodLog, Mesocycle, Schedule, Session, Settings, UserRecipe } from '@/types';
import type { Food } from './foods';
import { db } from './firebase';
import { DEFAULT_SETTINGS, SEED_DAYS } from './seed-data';
import { todayISO } from './date-utils';

/* ---------- Percorsi ---------- */

const userDoc = (uid: string) => doc(db(), 'users', uid);
const scheduleRef = (uid: string) => doc(userDoc(uid), 'schedule', 'current');
const settingsRef = (uid: string) => doc(userDoc(uid), 'config', 'settings');
const activeRef = (uid: string) => doc(userDoc(uid), 'config', 'activeSession');
const sessionsCol = (uid: string) => collection(userDoc(uid), 'sessions');
const bodyLogsCol = (uid: string) => collection(userDoc(uid), 'bodyLogs');
const mesocyclesCol = (uid: string) => collection(userDoc(uid), 'mesocycles');
const foodLogsCol = (uid: string) => collection(userDoc(uid), 'foodLogs');
const recipesCol = (uid: string) => collection(userDoc(uid), 'recipes');
const myFoodsRef = (uid: string) => doc(userDoc(uid), 'config', 'foods');

export const newId = (uid: string): string => doc(sessionsCol(uid)).id;

/* ---------- Conversioni Timestamp <-> ms ---------- */

const toMs = (v: unknown): number => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return new Date(v).getTime();
  return Date.now();
};
const toTs = (ms: number): Timestamp => Timestamp.fromMillis(ms);

/** Rimuove `undefined` in profondità (Firestore non li accetta negli array). */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const fromSchedule = (d: DocumentData): Schedule => ({ id: 'current', days: d.days as Day[], updatedAt: toMs(d.updatedAt) });
const fromSession = (id: string, d: DocumentData): Session => ({ ...(d as Session), id, date: toMs(d.date) });
const fromBodyLog = (id: string, d: DocumentData): BodyLog => ({ ...(d as BodyLog), id, createdAt: toMs(d.createdAt) });
const fromMeso = (id: string, d: DocumentData): Mesocycle => ({ ...(d as Mesocycle), id, createdAt: toMs(d.createdAt) });
const fromActive = (d: DocumentData): ActiveSession => ({
  ...(d as ActiveSession),
  startedAt: toMs(d.startedAt),
  updatedAt: toMs(d.updatedAt),
});

/* ---------- Subscriptions realtime ---------- */

type OnError = (e: Error) => void;

export function subscribeSchedule(uid: string, cb: (s: Schedule | null) => void, onError: OnError): Unsubscribe {
  return onSnapshot(scheduleRef(uid), (snap) => cb(snap.exists() ? fromSchedule(snap.data()) : null), onError);
}

export function subscribeSettings(uid: string, cb: (s: Settings) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    settingsRef(uid),
    (snap) => cb({ ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<Settings>) : {}) }),
    onError,
  );
}

export function subscribeActiveSession(uid: string, cb: (s: ActiveSession | null) => void, onError: OnError): Unsubscribe {
  return onSnapshot(activeRef(uid), (snap) => cb(snap.exists() ? fromActive(snap.data()) : null), onError);
}

export function subscribeSessions(uid: string, cb: (s: Session[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    sessionsCol(uid),
    (snap) => cb(snap.docs.map((d) => fromSession(d.id, d.data())).sort((a, b) => b.date - a.date)),
    onError,
  );
}

export function subscribeBodyLogs(uid: string, cb: (s: BodyLog[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    bodyLogsCol(uid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => fromBodyLog(d.id, d.data()))
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
      ),
    onError,
  );
}

export function subscribeMesocycles(uid: string, cb: (s: Mesocycle[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    mesocyclesCol(uid),
    (snap) => cb(snap.docs.map((d) => fromMeso(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    onError,
  );
}

/* ---------- Scritture ---------- */

export const saveSchedule = (uid: string, days: Day[]) =>
  setDoc(scheduleRef(uid), { id: 'current', days: clean(days), updatedAt: Timestamp.now() });

export const saveSettings = (uid: string, patch: Partial<Settings>) => setDoc(settingsRef(uid), clean(patch), { merge: true });

export const saveActiveSession = (uid: string, s: ActiveSession) =>
  setDoc(activeRef(uid), { ...clean(s), startedAt: toTs(s.startedAt), updatedAt: Timestamp.now() });

export const clearActiveSession = (uid: string) => deleteDoc(activeRef(uid));

export const saveSession = (uid: string, s: Session) =>
  setDoc(doc(sessionsCol(uid), s.id), { ...clean(s), date: toTs(s.date) });

export const deleteSession = (uid: string, id: string) => deleteDoc(doc(sessionsCol(uid), id));

export const saveBodyLog = (uid: string, l: BodyLog) =>
  setDoc(doc(bodyLogsCol(uid), l.id), { ...clean(l), createdAt: toTs(l.createdAt) });

export const deleteBodyLog = (uid: string, id: string) => deleteDoc(doc(bodyLogsCol(uid), id));

export const saveMesocycle = (uid: string, m: Mesocycle) =>
  setDoc(doc(mesocyclesCol(uid), m.id), { ...clean(m), createdAt: toTs(m.createdAt) });

/** Salva la bozza di sessione terminata e cancella quella attiva in un'unica batch atomica. */
export async function finishSession(uid: string, s: Session): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(sessionsCol(uid), s.id), { ...clean(s), date: toTs(s.date) });
  batch.delete(activeRef(uid));
  await batch.commit();
}

export function newMesocycle(uid: string, weeks: number): Mesocycle {
  return {
    id: newId(uid),
    startDate: todayISO(),
    weeks,
    currentWeek: 1,
    status: 'active',
    createdAt: Date.now(),
  };
}

/* ---------- Primo avvio ---------- */

/** Crea scheda, impostazioni e mesociclo iniziale se mancanti. Ritorna true se è un nuovo utente. */
export async function ensureSeed(uid: string): Promise<boolean> {
  const [sched, settings, mesos] = await Promise.all([
    getDoc(scheduleRef(uid)),
    getDoc(settingsRef(uid)),
    getDocs(mesocyclesCol(uid)),
  ]);
  const writes: Promise<unknown>[] = [];
  if (!sched.exists()) writes.push(saveSchedule(uid, SEED_DAYS));
  if (!settings.exists()) writes.push(setDoc(settingsRef(uid), DEFAULT_SETTINGS));
  if (mesos.empty) writes.push(saveMesocycle(uid, newMesocycle(uid, DEFAULT_SETTINGS.deloadFrequency)));
  await Promise.all(writes);
  return !sched.exists();
}

/* ---------- Alimentazione ---------- */

export function subscribeFoodLog(uid: string, date: string, cb: (l: FoodLog) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    doc(foodLogsCol(uid), date),
    (d) => cb({ date, entries: d.exists() ? ((d.data().entries as FoodLog['entries']) ?? []) : [] }),
    onError,
  );
}
export const saveFoodLog = (uid: string, log: FoodLog) =>
  setDoc(doc(foodLogsCol(uid), log.date), clean({ date: log.date, entries: log.entries, updatedAt: Timestamp.now() }));

export function subscribeRecipes(uid: string, cb: (r: UserRecipe[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    recipesCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as UserRecipe), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)),
    onError,
  );
}
export const saveRecipe = (uid: string, r: UserRecipe) => setDoc(doc(recipesCol(uid), r.id), clean(r));
export const deleteRecipe = (uid: string, id: string) => deleteDoc(doc(recipesCol(uid), id));
export const newRecipeId = (uid: string): string => doc(recipesCol(uid)).id;

/** I miei alimenti: creati a mano o scansionati (ultimi usati per primi). */
export function subscribeMyFoods(uid: string, cb: (f: Food[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(myFoodsRef(uid), (d) => cb(d.exists() ? ((d.data().items as Food[]) ?? []) : []), onError);
}
export const saveMyFoods = (uid: string, items: Food[]) => setDoc(myFoodsRef(uid), clean({ items: items.slice(0, 300) }));

/* ---------- Backup / Reset ---------- */

export async function exportAll(uid: string): Promise<BackupFile> {
  const [sched, settings, sessions, bodyLogs, mesos, foodLogs, recipes, myFoods] = await Promise.all([
    getDoc(scheduleRef(uid)),
    getDoc(settingsRef(uid)),
    getDocs(sessionsCol(uid)),
    getDocs(bodyLogsCol(uid)),
    getDocs(mesocyclesCol(uid)),
    getDocs(foodLogsCol(uid)),
    getDocs(recipesCol(uid)),
    getDoc(myFoodsRef(uid)),
  ]);
  return {
    app: 'mirkogym',
    version: 1,
    exportedAt: new Date().toISOString(),
    schedule: sched.exists() ? fromSchedule(sched.data()) : null,
    settings: settings.exists() ? { ...DEFAULT_SETTINGS, ...(settings.data() as Partial<Settings>) } : null,
    sessions: sessions.docs.map((d) => fromSession(d.id, d.data())),
    bodyLogs: bodyLogs.docs.map((d) => fromBodyLog(d.id, d.data())),
    mesocycles: mesos.docs.map((d) => fromMeso(d.id, d.data())),
    foodLogs: foodLogs.docs.map((d) => ({ date: d.id, entries: (d.data().entries as FoodLog['entries']) ?? [] })),
    recipes: recipes.docs.map((d) => ({ ...(d.data() as UserRecipe), id: d.id })),
    myFoods: myFoods.exists() ? ((myFoods.data().items as Food[]) ?? []) : [],
  };
}

type Op = { ref: DocumentReference; data?: DocumentData };

async function commitInChunks(ops: Op[]): Promise<void> {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db());
    for (const op of ops.slice(i, i + 450)) {
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}

async function deletionOps(uid: string): Promise<Op[]> {
  const cols = await Promise.all([
    getDocs(sessionsCol(uid)),
    getDocs(bodyLogsCol(uid)),
    getDocs(mesocyclesCol(uid)),
    getDocs(foodLogsCol(uid)),
    getDocs(recipesCol(uid)),
  ]);
  return [
    ...cols.flatMap((c) => c.docs.map((d) => ({ ref: d.ref }))),
    { ref: myFoodsRef(uid) },
    { ref: scheduleRef(uid) },
    { ref: settingsRef(uid) },
    { ref: activeRef(uid) },
  ];
}

export function isBackupFile(v: unknown): v is BackupFile {
  if (!v || typeof v !== 'object') return false;
  const b = v as Partial<BackupFile>;
  return b.app === 'mirkogym' && Array.isArray(b.sessions) && Array.isArray(b.bodyLogs) && Array.isArray(b.mesocycles);
}

/** Sostituisce TUTTI i dati dell'utente con quelli del backup. */
export async function importAll(uid: string, backup: BackupFile): Promise<void> {
  const ops = await deletionOps(uid);
  const writes: Op[] = [
    ...backup.sessions.map((s) => ({ ref: doc(sessionsCol(uid), s.id), data: { ...clean(s), date: toTs(toMs(s.date)) } })),
    ...backup.bodyLogs.map((l) => ({
      ref: doc(bodyLogsCol(uid), l.id),
      data: { ...clean(l), createdAt: toTs(toMs(l.createdAt)) },
    })),
    ...backup.mesocycles.map((m) => ({
      ref: doc(mesocyclesCol(uid), m.id),
      data: { ...clean(m), createdAt: toTs(toMs(m.createdAt)) },
    })),
  ];
  for (const l of backup.foodLogs ?? []) writes.push({ ref: doc(foodLogsCol(uid), l.date), data: clean({ date: l.date, entries: l.entries }) });
  for (const r of backup.recipes ?? []) writes.push({ ref: doc(recipesCol(uid), r.id), data: clean(r) });
  if (backup.myFoods?.length) writes.push({ ref: myFoodsRef(uid), data: clean({ items: backup.myFoods }) });
  if (backup.schedule) {
    writes.push({ ref: scheduleRef(uid), data: { id: 'current', days: clean(backup.schedule.days), updatedAt: Timestamp.now() } });
  }
  writes.push({
    ref: settingsRef(uid),
    data: clean({ ...DEFAULT_SETTINGS, ...(backup.settings ?? {}), onboardingCompleted: true, startingLoadsPrompted: true }),
  });
  // Le delete vengono prima: i set successivi sulla stessa ref sovrascrivono.
  await commitInChunks([...ops, ...writes]);
}

/** Cancella tutti i dati dell'utente. */
export async function resetAll(uid: string): Promise<void> {
  await commitInChunks(await deletionOps(uid));
}

/**
 * Offline le scritture Firestore vengono applicate subito alla cache locale ma la promise
 * si risolve solo alla conferma del server: non blocchiamo l'UI oltre `ms`.
 * Un errore reale (es. regole) viene comunque propagato se arriva entro il timeout.
 */
export function settle(p: Promise<unknown>, ms = 1500): Promise<void> {
  p.catch((e: unknown) => console.error('Scrittura Firestore fallita', e));
  return Promise.race([p.then(() => undefined), new Promise<void>((r) => window.setTimeout(r, ms))]);
}
