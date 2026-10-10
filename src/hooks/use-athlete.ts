import { useMemo, useSyncExternalStore } from 'react';
import { resolveCycling } from '@/lib/habits';
import { mondayISO } from '@/lib/date-utils';
import type { WeekCalories } from '@/types';
import { addDays } from 'date-fns';
import type { FoodLog } from '@/types';
import { subscribeRecentFoodLogs } from '@/lib/firestore';
import { toISODate } from '@/lib/date-utils';
import { athleteReport, athleteText } from '@/lib/athlete';
import { userNutrition } from '@/lib/coach';
import { planStatus, planText } from '@/lib/goal-plan';
import { useData } from './data-context';
import { useSessions } from './use-sessions';
import { useSchedule } from './use-schedule';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';

/*
 * Diario degli ultimi 180 giorni: UNA sola sottoscrizione condivisa da tutta l'app
 * (Home, sfide, coach, check-in, modelli), ogni componente filtra i giorni che gli servono.
 */
type Store = { uid: string; logs: FoodLog[]; refs: number; unsub?: () => void; listeners: Set<() => void> };
let store: Store | null = null;
const EMPTY: FoodLog[] = [];

function acquire(uid: string, onChange: () => void) {
  if (!store || store.uid !== uid) {
    store?.unsub?.();
    store = { uid, logs: EMPTY, refs: 0, listeners: new Set() };
    const s = store;
    s.unsub = subscribeRecentFoodLogs(
      uid,
      toISODate(addDays(new Date(), -180)),
      (l) => {
        s.logs = l;
        s.listeners.forEach((f) => f());
      },
      () => undefined,
    );
  }
  const s = store;
  s.refs++;
  s.listeners.add(onChange);
  return () => {
    s.listeners.delete(onChange);
    s.refs--;
    // chiusura ritardata: evita di riaprire la sottoscrizione cambiando pagina
    window.setTimeout(() => {
      if (s.refs === 0 && store === s) {
        s.unsub?.();
        store = null;
      }
    }, 30_000);
  };
}

/** Diario alimentare delle ultime `days` giornate. */
export function useRecentFoodLogs(days = 28) {
  const { uid } = useData();
  const all = useSyncExternalStore(
    (cb) => (uid ? acquire(uid, cb) : () => undefined),
    () => (store && store.uid === uid ? store.logs : EMPTY),
  );
  return useMemo(() => {
    const from = toISODate(addDays(new Date(), -days));
    return all.filter((l) => l.date >= from);
  }, [all, days]);
}

/** Calorie decise dall'app, da passare al coach così non ne inventa altre. */
function calorieText(target: number, w: WeekCalories | undefined, cycling: number[] | null): string {
  const parts = [`CALORIE (decise dall'app con l'aggiornamento settimanale automatico: NON proporre altri numeri, spiegali soltanto): obiettivo medio ${target} kcal al giorno`];
  if (cycling) {
    const bonus = Math.max(100, Math.min(300, Math.round((target * 0.08) / 10) * 10));
    parts.push(`più alto nei giorni di allenamento (+${bonus} kcal, carboidrati) e più basso a riposo, stessa media`);
  }
  if (w && w.week === mondayISO()) {
    if (w.prevTarget != null && !w.undone) parts.push(`variazione di questa settimana ${w.target - w.prevTarget >= 0 ? '+' : ''}${w.target - w.prevTarget} kcal`);
    if (w.tdee) parts.push(`dispendio reale stimato ${w.tdee} kcal`);
    if (w.trend != null && w.expected != null) parts.push(`peso ${w.trend} kg/sett (atteso ${w.expected})`);
    parts.push(`diario compilato ${w.logged}/7 giorni`);
  }
  return parts.join('; ') + '.';
}

/** Profilo dell'atleta (memoria del coach) + testo per i prompt. */
export function useAthlete() {
  const { sessions, nameOf, groupOf } = useSessions();
  const { days } = useSchedule();
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs();
  return useMemo(() => {
    const p = settings.profile;
    const w = bodyLogs.find((b) => b.weight != null)?.weight ?? p?.weightKg;
    const t = p ? userNutrition({ ...p, weightKg: w ?? p.weightKg }, settings) : null;
    const report = athleteReport({
      sessions,
      days,
      foodLogs,
      bodyLogs,
      target: t ? { kcal: t.target, protein: t.protein } : null,
      painResolved: settings.painResolved,
      nameOf,
      groupOf,
    });
    const lastCheck = settings.checkIns?.[0];
    const plan = settings.goalPlan;
    const text =
      athleteText(report) +
      (plan && p ? `\n${planText(plan, planStatus(plan, bodyLogs, p.weightKg))}` : '') +
      (lastCheck ? `\nUltimo check-in (${new Date(lastCheck.date).toLocaleDateString('it-IT')}): ${lastCheck.summary.slice(0, 400)}` : '') +
      (settings.coachAnalysis ? `\nUltima analisi del coach: ${settings.coachAnalysis.text.slice(0, 500)}` : '') +
      (t ? `\n${calorieText(t.target, settings.weekCal, resolveCycling({ enabled: settings.calorieCycling, manual: settings.carbCycling, sessions, perWeek: p?.daysPerWeek ?? days.length }))}` : '');
    return { report, text };
  }, [sessions, days, foodLogs, bodyLogs, settings, nameOf, groupOf]);
}
