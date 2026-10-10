import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLibrary } from '@/hooks/use-library';
import {
  EQUIPMENT_IT,
  MUSCLE_IT,
  NAME_IT,
  displayName,
  groupForLibrary,
  imageUrl,
  matchesQuery,
  type LibraryExercise,
} from '@/lib/exercise-library';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { ExerciseInfoModal } from './ExerciseInfoModal';

const GROUPS = ['Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Core'];
const EQUIP = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'e-z curl bar', 'bands'];
const PAGE = 30;

interface Props {
  /** Se presente, il dettaglio mostra un pulsante per scegliere l'esercizio. */
  onPick?: (e: LibraryExercise) => void;
  pickLabel?: string;
}

/** Catalogo esercizi con ricerca (anche in italiano), filtri per muscolo e attrezzo. */
export function ExerciseBrowser({ onPick, pickLabel = 'Aggiungi alla scheda', initialQuery = '' }: Props & { initialQuery?: string }) {
  const { list, texts, error, loading } = useLibrary();
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<LibraryExercise | null>(null);

  const results = useMemo(() => {
    if (!list) return [];
    const r = list.filter(
      (e) =>
        (!group || groupForLibrary(e) === group) &&
        (!equip || e.e === equip) &&
        (!q.trim() || matchesQuery(texts.get(e.id) ?? '', q)),
    );
    // Prima i nomi che iniziano con la ricerca, poi i più comuni in palestra (tradotti), poi forza/powerlifting
    const query = q.trim().toLowerCase();
    const nameScore = (e: LibraryExercise) => {
      if (!query) return 0;
      const n = displayName(e).toLowerCase();
      return n.startsWith(query) ? 0 : n.includes(query) ? 2 : 4;
    };
    const rank = (e: LibraryExercise) =>
      nameScore(e) * 10 + (NAME_IT[e.id] ? 0 : 2) + (e.c === 'strength' || e.c === 'powerlifting' ? 0 : 1);
    return r.sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b)));
  }, [list, texts, q, group, equip]);

  const reset = () => setShown(PAGE);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            reset();
          }}
          placeholder="Cerca: panca, curl, squat, dorsali…"
          aria-label="Cerca esercizio"
          className="h-12 w-full rounded-md border border-line bg-surface-2 pl-12 pr-11 text-base text-fg outline-none focus:border-accent-500"
        />
        {q && (
          <button
            type="button"
            aria-label="Cancella ricerca"
            onClick={() => setQ('')}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-fg-3"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <FilterRow
        label="Muscolo"
        options={GROUPS.map((g) => ({ value: g, label: g, color: groupColor(g) }))}
        value={group}
        onChange={(v) => {
          setGroup(v);
          reset();
        }}
      />
      <FilterRow
        label="Attrezzo"
        options={EQUIP.map((e) => ({ value: e, label: EQUIPMENT_IT[e] ?? e }))}
        value={equip}
        onChange={(v) => {
          setEquip(v);
          reset();
        }}
      />

      {error && <EmptyState title="Libreria non disponibile" description="Serve una connessione per il primo caricamento." />}
      {loading && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      )}
      {list && (
        <>
          <div className="mt-3 text-sm text-fg-3">{results.length} esercizi</div>
          {results.length === 0 ? (
            <EmptyState title="Nessun esercizio trovato" description="Prova con un altro nome o togli qualche filtro." />
          ) : (
            <ul className="mt-2 space-y-2">
              {results.slice(0, shown).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(e)}
                    className="card flex w-full items-center gap-3 p-2 pr-3 text-left transition-colors hover:border-line-strong"
                  >
                    <img
                      src={imageUrl(e.id, 0)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-20 shrink-0 rounded-md bg-surface-2 object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-fg">{displayName(e)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-fg-3">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: groupColor(groupForLibrary(e)) }} aria-hidden />
                        {e.p.map((m) => MUSCLE_IT[m] ?? m).join(', ')} · {EQUIPMENT_IT[e.e] ?? e.e}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shown < results.length && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="mt-3 h-12 w-full rounded-md border border-dashed border-line text-base font-semibold text-fg-2"
            >
              Mostra altri ({results.length - shown})
            </button>
          )}
        </>
      )}

      <ExerciseInfoModal
        exercise={open}
        onClose={() => setOpen(null)}
        action={
          onPick
            ? {
                label: pickLabel,
                onClick: (e) => {
                  setOpen(null);
                  onPick(e);
                },
              }
            : undefined
        }
      />
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; color?: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label={label}>
      <Pill active={value === null} onClick={() => onChange(null)}>
        Tutti
      </Pill>
      {options.map((o) => (
        <Pill key={o.value} active={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)} color={o.color}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
        active ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {children}
    </button>
  );
}
