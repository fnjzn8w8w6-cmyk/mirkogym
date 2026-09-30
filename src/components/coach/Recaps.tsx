import { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { MicButton, appendText } from '@/components/ui/MicButton';
import { cn } from '@/lib/cn';
import type { DayRecap, WorkoutRecap } from '@/types';

function Scale({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold text-fg-2">{label}</div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            aria-label={`${label}: ${i + 1} su 5`}
            onClick={() => onChange(i + 1)}
            className={cn('h-11 rounded-md border text-xl', value === i + 1 ? 'border-accent-500 bg-accent-glow' : 'border-line bg-surface-2')}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

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
      <Scale label="Allenamento" value={rating} onChange={setRating} options={['😖', '😕', '😐', '🙂', '🔥']} />
      <Scale label="Energia" value={energy} onChange={setEnergy} options={['🪫', '😮‍💨', '😐', '💪', '⚡']} />
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
export function DayRecapForm({ initial, onSend }: { initial?: DayRecap; onSend: (r: DayRecap) => Promise<void> | void }) {
  const [adherence, setAdherence] = useState(initial?.adherence ?? 4);
  const [hunger, setHunger] = useState(initial?.hunger ?? 3);
  const [cheat, setCheat] = useState(initial?.cheat ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [sent, setSent] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSent(Boolean(initial));
    setAdherence(initial?.adherence ?? 4);
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
      <Scale label="Quanto hai seguito il piano?" value={adherence} onChange={setAdherence} options={['😬', '😕', '😐', '🙂', '🎯']} />
      <Scale label="Fame durante il giorno" value={hunger} onChange={setHunger} options={['🙂', '😊', '😐', '😋', '🤤']} />
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
          await onSend({ adherence, hunger, cheat: cheat.trim() || undefined, note: note.trim() || undefined, at: Date.now() });
          setBusy(false);
          setSent(true);
        }}
      >
        Invia al coach
      </Button>
    </div>
  );
}
