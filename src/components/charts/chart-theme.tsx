import type { ReactNode } from 'react';

/** Token condivisi dai grafici: griglia/assi recessivi, testo in inchiostro neutro. */
export const chart = {
  grid: 'rgba(255,255,255,0.06)',
  axis: '#7D8781',
  surface: '#0D0F0E',
  accent: '#3DDC84',
  accentSoft: 'rgba(61,220,132,0.35)',
  secondary: '#A7B0AB',
  tick: { fill: '#7D8781', fontSize: 11, fontWeight: 600 },
};

/**
 * Ordine fisso delle serie per gruppo muscolare, scelto per massimizzare la
 * separazione tra colori adiacenti per chi ha deficit di visione dei colori.
 */
export const GROUP_ORDER = ['Dorso', 'Gambe', 'Tricipiti', 'Core', 'Bicipiti', 'Spalle', 'Petto'];

export const sortGroups = (groups: string[]): string[] =>
  [...groups].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });

interface TooltipShellProps {
  title?: ReactNode;
  rows: { label: string; value: string; color?: string }[];
}

export function TooltipShell({ title, rows }: TooltipShellProps) {
  return (
    <div className="min-w-[140px] rounded-md border border-line bg-surface-2/95 px-3 py-2 shadow-lg backdrop-blur">
      {title && <div className="mb-1 text-xs text-fg-3">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-fg-2">
            {r.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} aria-hidden />}
            {r.label}
          </span>
          <span className="font-bold text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-fg-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
