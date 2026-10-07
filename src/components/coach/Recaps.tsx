import { useEffect, useState } from 'react';
import { HUNGER_WORDS, LevelScale } from '@/components/ui/LevelScale';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { MicButton, appendText } from '@/components/ui/MicButton';
import { cn } from '@/lib/cn';
import { NewBadge } from '@/components/ui/Help';
import type { DayRecap, WorkoutRecap } from '@/types';

function NoteField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative [&_textarea]:pr-14">
      <TextArea label={label} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      <MicButton size="sm" className="absolute right-2 top-2" onText={(t) => onChange(appendText(value, t))} />
    </div>
  );
}

const Sent = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 rounded-md bg-success-bg p-3 text-sm font-semibold text-success">
    <CheckCircle2 className="h-5 w-5" aria-hidden /> {text}
  </div>
);

const PAIN = ['Ginocchio', 'Schiena', 'Spalla', 'Gomito', 'Polso', 'Anca', 'Collo'];

/** Resoconto di fine allenamento: va al coach, che lo salva per il tuo resoconto personale. */
export function WorkoutRecapForm({ initial, onSend }: { initial?: WorkoutRecap; onSend: (r: WorkoutRecap) => Promise<void> | void }) {
  const [rating, setRating] = useState(initial?.rating ?? 4);
  const [energy, setEnergy] = useState(initial?.energy ?? 3);
  const [pain, setPain] = useState<string[]>(initial?.pain ?? []);
  const [note, setNote] = useState(initial?.note ?? '');
  const [sent, setSent] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  if (sent) return <Sent text="Resoconto inviato al coach" />;
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-2/60 p-3 text-left">
      <div className="text-base font-bold text-fg">Com'è andata? Dillo al coach</div>
      <div>
        <div className="mb-1.5 text-sm font-semibold text-fg-2">Allenamento</div>
        <LevelScale label="Allenamento" value={rating} onChange={setRating} words={['Pessimo', 'Scarso', 'Normale', 'Buono', 'Ottimo']} />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-semibold text-fg-2">Energia</div>
        <LevelScale label="Energia" value={energy} onChange={setEnergy} words={['A terra', 'Bassa', 'Normale', 'Alta', 'Al top']} />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-semibold text-fg-2">Dolori o fastidi</div>
        <div className="flex flex-wrap gap-1.5">
          {PAIN.map((p) => {
            const on = pain.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => setPain(on ? pain.filter((x) => x !== p) : [...pain, p])}
                className={cn('h-9 rounded-full border px-3 text-sm', on ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-surface-2 text-fg-2')}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
      <NoteField label="Note per il coach (facoltative)" value={note} onChange={setNote} />
      <Button
        fullWidth
        loading={busy}
        icon={<Send className="h-5 w-5" />}
        onClick={async () => {
          setBusy(true);
          await onSend({ rating, energy, pain, note: note.trim() || undefined, at: Date.now() });
          setBusy(false);
          setSent(true);
        }}
      >
        Invia al coach
      </Button>
    </div>
  );
}

/** Com'è andata la giornata alimentare (in fondo al diario). */
/** Quanto la giornata ha rispettato gli obiettivi, calcolato dal diario (1–5). */
export function dayScore(s: { kcal: number; target: number; protein: number; proteinTarget: number }): number {
  if (s.kcal <= 0 || s.target <= 0) return 3;
  const dev = Math.abs(s.kcal - s.target) / s.target;
  const prot = s.proteinTarget > 0 ? s.protein / s.proteinTarget : 1;
  if (dev <= 0.1 && prot >= 0.9) return 5;
  if (dev <= 0.15 && prot >= 0.8) return 4;
  if (dev <= 0.25) return 3;
  return dev <= 0.4 ? 2 : 1;
}

export function DayRecapForm({
  initial,
  onSend,
  score,
}: {
  initial?: DayRecap;
  onSend: (r: DayRecap) => Promise<void> | void;
  /** numeri della giornata dal diario: l'aderenza agli obiettivi si calcola da qui */
  score?: { kcal: number; target: number; protein: number; proteinTarget: number };
}) {
  const [hunger, setHunger] = useState(initial?.hunger ?? 3);
  const [cheat, setCheat] = useState(initial?.cheat ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [complete, setComplete] = useState(initial?.complete ?? true);
  const [sent, setSent] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSent(Boolean(initial));
    setComplete(initial?.complete ?? true);
    setHunger(initial?.hunger ?? 3);
    setCheat(initial?.cheat ?? '');
    setNote(initial?.note ?? '');
  }, [initial]);
  if (sent)
    return (
      <div className="space-y-2">
        <Sent text="Giornata inviata al coach" />
        <button type="button" className="text-sm font-semibold text-accent-400" onClick={() => setSent(false)}>
          Modifica
        </button>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 p-3">
        <span className="text-sm text-fg">
          Giornata registrata tutta? <NewBadge id="complete-day" />
          <span className="block text-xs text-fg-3">Se manca qualche pasto, il calcolo del tuo metabolismo la ignora.</span>
        </span>
        <div className="flex shrink-0 gap-1">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={complete === v}
              onClick={() => setComplete(v)}
              className={complete === v ? 'rounded-full bg-accent-500 px-3 py-1 text-sm font-bold text-onaccent' : 'rounded-full px-3 py-1 text-sm text-fg-3'}
            >
              {v ? 'Sì' : 'No'}
            </button>
          ))}
        </div>
      </div>
      {score && score.kcal > 0 && (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <div className="font-semibold text-fg">
            {dayScore(score) >= 4 ? '🎯 Obiettivo rispettato' : dayScore(score) === 3 ? '🙂 Quasi in obiettivo' : '⚠️ Lontano dall\'obiettivo'} <NewBadge />
          </div>
          <div className="text-xs text-fg-2">
            {Math.round(score.kcal).toLocaleString('it-IT')}/{Math.round(score.target).toLocaleString('it-IT')} kcal · proteine {Math.round(score.protein)}/{Math.round(score.proteinTarget)} g — calcolato dal diario, non serve indicarlo.
          </div>
        </div>
      )}
      <div>
        <div className="mb-1.5 text-sm font-semibold text-fg-2">Fame durante il giorno</div>
        <LevelScale label="Fame durante il giorno" value={hunger} onChange={setHunger} words={HUNGER_WORDS} />
      </div>
      <div className="relative [&_textarea]:pr-14">
        <TextArea label="Sgarri? (es. pizza, dolce, alcol — facoltativo)" rows={1} value={cheat} onChange={(e) => setCheat(e.target.value)} />
        <MicButton size="sm" className="absolute right-2 top-2" onText={(t) => setCheat(appendText(cheat, t))} />
      </div>
      <NoteField label="Note per il coach (facoltative)" value={note} onChange={setNote} />
      <Button
        fullWidth
        loading={busy}
        icon={<Send className="h-5 w-5" />}
        onClick={async () => {
          setBusy(true);
          await onSend({ adherence: score ? dayScore(score) : (initial?.adherence ?? 3), hunger, complete, cheat: cheat.trim() || undefined, note: note.trim() || undefined, at: Date.now() });
          setBusy(false);
          setSent(true);
        }}
      >
        Invia al coach
      </Button>
    </div>
  );
}
