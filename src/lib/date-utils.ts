import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { it } from 'date-fns/locale';

export const toISODate = (d: Date | number): string => format(d, 'yyyy-MM-dd');
export const todayISO = (): string => toISODate(new Date());
export const fromISODate = (s: string): Date => parseISO(s);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Martedì 30 settembre" */
export const formatLongDate = (d: Date | number): string => cap(format(d, 'EEEE d MMMM', { locale: it }));
/** "30 set 2026" */
export const formatShortDate = (d: Date | number): string => format(d, 'd MMM yyyy', { locale: it });
/** "30 set" */
export const formatDayMonth = (d: Date | number): string => format(d, 'd MMM', { locale: it });
/** "Oggi", "Ieri", "Lun 28 set" */
export function formatRelativeDay(d: Date | number): string {
  if (isToday(d)) return 'Oggi';
  if (isYesterday(d)) return 'Ieri';
  return cap(format(d, 'EEE d MMM', { locale: it }));
}
export const formatAgo = (d: Date | number): string =>
  formatDistanceToNowStrict(d, { locale: it, addSuffix: true });

/** mm:ss oppure h:mm:ss */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm.padStart(2, '0')}:${ss}`;
}

/** "1h 12m" / "48m" */
export function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds) return '—';
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const weekStart = (d: Date | number): Date => startOfWeek(d, { weekStartsOn: 1 });
/** Lunedì della settimana (YYYY-MM-DD). */
export const mondayISO = (d: Date | number = new Date()): string => toISODate(weekStart(d));
export const daysBetween = (a: Date | number, b: Date | number): number => differenceInCalendarDays(a, b);
