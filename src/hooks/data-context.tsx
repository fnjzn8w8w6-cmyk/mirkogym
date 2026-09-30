import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { ActiveSession, BodyLog, Mesocycle, Schedule, Session, Settings } from '@/types';
import { watchUser } from '@/lib/auth';
import {
  ensureSeed,
  subscribeActiveSession,
  subscribeBodyLogs,
  subscribeMesocycles,
  subscribeSchedule,
  subscribeSessions,
  subscribeSettings,
} from '@/lib/firestore';
import { DEFAULT_SETTINGS } from '@/lib/seed-data';
import { setHapticsEnabled } from '@/lib/haptics';

export interface DataState {
  user: User | null;
  /** Nessun utente (dopo "Esci"): va mostrata la schermata di accesso. */
  signedOut: boolean;
  isAnonymous: boolean;
  email: string | null;
  /** Da chiamare dopo aver collegato un account, per aggiornare isAnonymous/email. */
  refreshUser: () => void;
  uid: string | null;
  error: Error | null;
  ready: boolean;
  schedule: Schedule | null;
  sessions: Session[];
  bodyLogs: BodyLog[];
  mesocycles: Mesocycle[];
  settings: Settings;
  activeSession: ActiveSession | null;
  loaded: {
    schedule: boolean;
    sessions: boolean;
    bodyLogs: boolean;
    mesocycles: boolean;
    settings: boolean;
    activeSession: boolean;
  };
}

const initial: DataState = {
  user: null,
  signedOut: false,
  isAnonymous: true,
  email: null,
  refreshUser: () => undefined,
  uid: null,
  error: null,
  ready: false,
  schedule: null,
  sessions: [],
  bodyLogs: [],
  mesocycles: [],
  settings: DEFAULT_SETTINGS,
  activeSession: null,
  loaded: { schedule: false, sessions: false, bodyLogs: false, mesocycles: false, settings: false, activeSession: false },
};

const DataContext = createContext<DataState>(initial);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(initial);

  // 1. Auth anonima
  useEffect(
    () =>
      watchUser(
        (user) =>
          setState((s) => {
            if (!user) return { ...initial, signedOut: true, isAnonymous: false };
            const who = { user, signedOut: false, isAnonymous: user.isAnonymous, email: user.email, error: null };
            // Cambio account: riparte da uno stato pulito (niente dati del vecchio utente)
            return s.uid === user.uid ? { ...s, ...who } : { ...initial, ...who, uid: user.uid };
          }),
        (error) => setState((s) => ({ ...s, error })),
      ),
    [],
  );

  // 2. Seed + subscriptions realtime
  const uid = state.uid;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const onError = (error: Error) => setState((s) => ({ ...s, error }));
    const set = <K extends keyof DataState['loaded']>(key: K, patch: Partial<DataState>) =>
      setState((s) => ({ ...s, ...patch, loaded: { ...s.loaded, [key]: true } }));

    ensureSeed(uid)
      .catch((e: unknown) => {
        // Offline al primissimo avvio: i listener sotto recupereranno appena possibile
        console.warn('Seed non completato', e);
      })
      .finally(() => {
        if (cancelled) return;
        unsubs.push(
          subscribeSchedule(uid, (schedule) => set('schedule', { schedule }), onError),
          subscribeSessions(uid, (sessions) => set('sessions', { sessions }), onError),
          subscribeBodyLogs(uid, (bodyLogs) => set('bodyLogs', { bodyLogs }), onError),
          subscribeMesocycles(uid, (mesocycles) => set('mesocycles', { mesocycles }), onError),
          subscribeSettings(uid, (settings) => set('settings', { settings }), onError),
          subscribeActiveSession(uid, (activeSession) => set('activeSession', { activeSession }), onError),
        );
      });
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [uid]);

  useEffect(() => setHapticsEnabled(state.settings.vibrationEnabled), [state.settings.vibrationEnabled]);

  const refreshUser = useCallback(
    () =>
      setState((s) => (s.user ? { ...s, isAnonymous: s.user.isAnonymous, email: s.user.email } : s)),
    [],
  );

  const value = useMemo<DataState>(() => {
    const l = state.loaded;
    return { ...state, refreshUser, ready: Boolean(state.uid) && l.schedule && l.settings && l.sessions && l.mesocycles && l.activeSession };
  }, [state, refreshUser]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = (): DataState => useContext(DataContext);

/** UID garantito (le route protette sono montate solo dopo l'auth). */
export function useUid(): string {
  const { uid } = useData();
  if (!uid) throw new Error('Utente non autenticato');
  return uid;
}
