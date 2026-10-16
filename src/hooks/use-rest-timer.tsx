import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { haptics, playBeep, unlockAudio } from '@/lib/haptics';
import { useData } from './data-context';

interface TimerState {
  endAt: number | null;
  duration: number;
  label?: string;
}

interface RestTimerApi {
  running: boolean;
  finished: boolean;
  remaining: number;
  duration: number;
  label?: string;
  /** il recupero è finito mentre eri fuori dall'app: da quanti secondi (null = finito adesso) */
  lateBy: number | null;
  start: (seconds: number, label?: string) => void;
  adjust: (deltaSeconds: number) => void;
  skip: () => void;
}

const STORAGE_KEY = 'mirkogym.restTimer';
const Ctx = createContext<RestTimerApi | null>(null);

function load(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as TimerState;
      // anche se è finito da poco (iPhone può aver chiuso l'app in secondo piano): così al ritorno vedi l'avviso
      if (s.endAt && s.endAt > Date.now() - 10 * 60 * 1000) return s;
    }
  } catch {
    /* ignorato */
  }
  return { endAt: null, duration: 0 };
}

/**
 * Timer di recupero globale basato su `endAt` (timestamp assoluto): resta preciso anche
 * se l'app va in background o la pagina viene ricaricata.
 */
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const [state, setState] = useState<TimerState>(load);
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [lateBy, setLateBy] = useState<number | null>(null);
  const firedFor = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      if (state.endAt) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignorato */
    }
  }, [state]);

  useEffect(() => {
    if (!state.endAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    // al ritorno nell'app il tempo si aggiorna subito (non al prossimo scatto del timer)
    const back = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pageshow', back);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('pageshow', back);
    };
  }, [state.endAt]);

  // audio sempre pronto mentre il recupero è in corso: si risveglia a ogni tocco e quando torni nell'app
  // (iPhone lo sospende quando l'app va in secondo piano, e allo zero il bip non si sentirebbe)
  useEffect(() => {
    if (!state.endAt || !settingsRef.current.soundEnabled) return;
    const wake = () => unlockAudio(true);
    const back = () => document.visibilityState === 'visible' && unlockAudio();
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('touchend', wake, true);
    document.addEventListener('visibilitychange', back);
    return () => {
      document.removeEventListener('pointerdown', wake, true);
      document.removeEventListener('touchend', wake, true);
      document.removeEventListener('visibilitychange', back);
    };
  }, [state.endAt]);

  const remaining = state.endAt ? Math.max(0, Math.ceil((state.endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!state.endAt || remaining > 0 || firedFor.current === state.endAt) return;
    firedFor.current = state.endAt;
    // finito mentre eri fuori dall'app (iPhone ferma l'app in secondo piano): niente bip in ritardo, solo l'avviso
    const late = Math.round((Date.now() - state.endAt) / 1000);
    const away = late > 3;
    if (!away) {
      if (settingsRef.current.vibrationEnabled) haptics.timerEnd();
      if (settingsRef.current.soundEnabled) void playBeep();
    }
    setLateBy(away ? late : null);
    setFinished(true);
    setState({ endAt: null, duration: 0 });
    const t = window.setTimeout(() => setFinished(false), away ? 5000 : 2500);
    return () => window.clearTimeout(t);
  }, [remaining, state.endAt]);

  const start = useCallback((seconds: number, label?: string) => {
    unlockAudio(true);
    setFinished(false);
    setNow(Date.now());
    setState({ endAt: Date.now() + seconds * 1000, duration: seconds, label });
  }, []);

  const adjust = useCallback((delta: number) => {
    setState((s) => {
      if (!s.endAt) return s;
      const endAt = Math.max(Date.now() + 1000, s.endAt + delta * 1000);
      return { ...s, endAt, duration: Math.max(s.duration + delta, 1) };
    });
  }, []);

  const skip = useCallback(() => {
    setFinished(false);
    setState({ endAt: null, duration: 0 });
  }, []);

  const api = useMemo<RestTimerApi>(
    () => ({
      running: Boolean(state.endAt),
      finished,
      remaining,
      duration: state.duration,
      label: state.label,
      lateBy,
      start,
      adjust,
      skip,
    }),
    [state, finished, remaining, lateBy, start, adjust, skip],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useRestTimer(): RestTimerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRestTimer fuori da RestTimerProvider');
  return ctx;
}
