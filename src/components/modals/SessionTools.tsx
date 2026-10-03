import { useEffect, useMemo, useState } from 'react';
import { Library, Search } from 'lucide-react';
import type { Day } from '@/types';
import { parseNum } from '@/hooks/use-active-session';
import { formatKg, groupColor } from '@/lib/analytics';
import { MUSCLE_GROUPS } from '@/lib/seed-data';
import { cn } from '@/lib/cn';
import { Modal } from '../ui/Modal';
import { Input, Segmented, TextArea } from '../ui/Input';
import { HelpTip, NewBadge } from '@/components/ui/Help';
import { Button } from '../ui/Button';

/* ---------- Calcolatore dischi ---------- */

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATE_COLORS: Record<number, string> = {
  25: '#EF4444',
  20: '#3B82F6',
  15: '#EAB308',
  10: '#22C55E',
  5: '#FAFAFA',
  2.5: '#A8A8AD',
  1.25: '#6E6E73',
};
const BAR_KEY = 'mirkogym.barWeight';

export function platesPerSide(target: number, bar: number): { plates: number[]; remainder: number } {
  let side = Math.max(0, (target - bar) / 2);
  const plates: number[] = [];
  for (const p of PLATES) {
    while (side >= p - 1e-9) {
      plates.push(p);
      side -= p;
    }
  }
  return { plates, remainder: Math.round(side * 2 * 100) / 100 };
}

export function PlateCalculatorModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: number | null }) {
  const [target, setTarget] = useState('');
  const [bar, setBar] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BAR_KEY) ?? 20);
    } catch {
      return 20;
    }
  });
  useEffect(() => {
    if (open) setTarget(initial != null ? String(initial).replace('.', ',') : '');
  }, [open, initial]);
  useEffect(() => {
    try {
      localStorage.setItem(BAR_KEY, String(bar));
    } catch {
      /* ignorato */
    }
  }, [bar]);

  const t = parseNum(target);
  const res = t != null && t >= bar ? platesPerSide(t, bar) : null;

  return (
    <Modal open={open} onClose={onClose} title="Calcolatore dischi">
      <div className="space-y-4">
        <Input label="Peso totale" kind="decimal" suffix="kg" value={target} onChange={(e) => setTarget(e.target.value)} />
        <div>
          <div className="section-title">Bilanciere</div>
          <Segmented<number>
            label="Peso bilanciere"
            value={bar}
            onChange={setBar}
            options={[20, 15, 10, 0].map((v) => ({ value: v, label: v ? `${v} kg` : 'Nessuno' }))}
          />
        </div>
        {t != null && t < bar && <p className="text-base text-fg-3">Il peso è inferiore al bilanciere.</p>}
        {res && (
          <div className="rounded-lg border border-line-subtle bg-surface-2 p-4">
            <div className="text-sm text-fg-3">Per lato</div>
            {/* Disegno: bilanciere con i dischi di un lato */}
            <div className="mt-3 flex h-28 items-center" aria-hidden>
              <div className="h-3 w-10 rounded-l-sm bg-fg-3" />
              <div className="h-8 w-2 bg-fg-2" />
              {res.plates.map((p, i) => (
                <div
                  key={i}
                  className="mx-px rounded-sm border border-black/30"
                  style={{ backgroundColor: PLATE_COLORS[p], width: p >= 10 ? 14 : 10, height: 36 + (p / 25) * 76 }}
                />
              ))}
              <div className="h-3 flex-1 rounded-r-sm bg-fg-3" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {res.plates.length === 0 ? (
                <span className="text-base text-fg-2">Solo bilanciere</span>
              ) : (
                Object.entries(
                  res.plates.reduce<Record<string, number>>((a, p) => ({ ...a, [p]: (a[p] ?? 0) + 1 }), {}),
                )
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([p, c]) => (
                    <span key={p} className="rounded-full border border-line bg-surface px-3 py-1 text-base font-semibold text-fg">
                      {c} × {formatKg(Number(p), 2)} kg
                    </span>
                  ))
              )}
            </div>
            {res.remainder > 0 && (
              <p className="mt-2 text-sm text-warning">Mancano {formatKg(res.remainder, 2)} kg: non ottenibili con i dischi standard.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Nota fissa esercizio ---------- */

export function ExerciseNoteModal({
  open,
  onClose,
  name,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  initial: string;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(initial);
  useEffect(() => {
    if (open) setNote(initial);
  }, [open, initial]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      footer={
        <Button size="lg" fullWidth onClick={() => onSave(note.trim())}>
          Salva nota
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-3">La nota resta sull'esercizio e la ritrovi ogni volta (es. "sedile 4, presa larga").</p>
      <TextArea label="Nota" rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
    </Modal>
  );
}

/* ---------- Sostituisci esercizio ---------- */

export interface SwapChoice {
  exerciseId: string;
  name: string;
  group: string;
  extra?: boolean;
}

export function SwapExerciseModal({
  open,
  onClose,
  days,
  current,
  onPick,
  onLibrary,
}: {
  open: boolean;
  onClose: () => void;
  days: Day[];
  current: { name: string; group: string } | null;
  onPick: (c: SwapChoice) => void;
  onLibrary: () => void;
}) {
  const [q, setQ] = useState('');
  const [customGroup, setCustomGroup] = useState<string>(current?.group ?? MUSCLE_GROUPS[0]);
  useEffect(() => {
    if (open) {
      setQ('');
      setCustomGroup(current?.group ?? MUSCLE_GROUPS[0]);
    }
  }, [open, current]);

  // Esercizi della scheda, senza doppioni per nome; prima quelli dello stesso gruppo
  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: SwapChoice[] = [];
    for (const d of days)
      for (const e of d.exercises) {
        const k = e.name.toLowerCase();
        if (seen.has(k) || k === current?.name.toLowerCase()) continue;
        seen.add(k);
        list.push({ exerciseId: e.id, name: e.name, group: e.group });
      }
    const query = q.trim().toLowerCase();
    return list
      .filter((o) => !query || o.name.toLowerCase().includes(query) || o.group.toLowerCase().includes(query))
      .sort((a, b) => Number(b.group === current?.group) - Number(a.group === current?.group) || a.name.localeCompare(b.name));
  }, [days, q, current]);

  const custom = q.trim();

  return (
    <Modal open={open} onClose={onClose} title="Sostituisci esercizio">
      <Button fullWidth variant="secondary" className="mb-3" icon={<Library className="h-5 w-5" />} onClick={onLibrary}>
        Cerca tra 876 esercizi con demo
      </Button>
      <p className="-mt-1 mb-3 flex items-center gap-1.5 text-xs text-fg-3">
        Il carico equivalente del nuovo esercizio viene calcolato in automatico <NewBadge /> <HelpTip id="session-swap" />
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca o scrivi un nuovo esercizio"
          aria-label="Cerca esercizio"
          className="h-12 w-full rounded-md border border-line bg-surface-2 pl-12 pr-4 text-base text-fg outline-none focus:border-accent-500"
        />
      </div>
      {custom.length > 1 && !options.some((o) => o.name.toLowerCase() === custom.toLowerCase()) && (
        <div className="mt-3 rounded-md border border-dashed border-line p-3">
          <div className="text-sm text-fg-3">Nuovo esercizio: gruppo</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === customGroup}
                onClick={() => setCustomGroup(g)}
                className={cn(
                  'h-9 rounded-full border px-3 text-sm font-semibold',
                  g === customGroup ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
                )}
              >
                {g}
              </button>
            ))}
          </div>
          <Button
            className="mt-3"
            fullWidth
            onClick={() =>
              onPick({
                exerciseId: `extra-${custom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                name: custom,
                group: customGroup,
                extra: true,
              })
            }
          >
            Usa "{custom}"
          </Button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-line-subtle">
        {options.map((o) => (
          <li key={o.exerciseId}>
            <button type="button" onClick={() => onPick(o)} className="flex min-h-[52px] w-full items-center gap-3 text-left">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: groupColor(o.group) }} aria-hidden />
              <span className="flex-1 text-base text-fg">{o.name}</span>
              <span className="text-sm text-fg-3">{o.group}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
