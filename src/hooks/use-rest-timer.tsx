import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { haptics, playBeep } from '@/lib/haptics';
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
      if (s.endAt && s.endAt > Date.now()) return s;
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
    return () => window.clearInterval(id);
  }, [state.endAt]);

  const remaining = state.endAt ? Math.max(0, Math.ceil((state.endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!state.endAt || remaining > 0 || firedFor.current === state.endAt) return;
    firedFor.current = state.endAt;
    if (settingsRef.current.vibrationEnabled) haptics.timerEnd();
    if (settingsRef.current.soundEnabled) playBeep();
    setFinished(true);
    setState({ endAt: null, duration: 0 });
    const t = window.setTimeout(() => setFinished(false), 2500);
    return () => window.clearTimeout(t);
  }, [remaining, state.endAt]);

  const start = useCallback((seconds: number, label?: string) => {
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
      start,
      adjust,
      skip,
    }),
    [state, finished, remaining, start, adjust, skip],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useRestTimer(): RestTimerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRestTimer fuori da RestTimerProvider');
  return ctx;
}
