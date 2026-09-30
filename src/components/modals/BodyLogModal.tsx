import { useEffect, useState } from 'react';
import type { BodyLog } from '@/types';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { parseNum } from '@/hooks/use-active-session';
import { settle } from '@/lib/firestore';
import { todayISO } from '@/lib/date-utils';
import { cn } from '@/lib/cn';
import { Modal } from '../ui/Modal';
import { Input, TextArea } from '../ui/Input';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export const ENERGY = ['😴', '😐', '🙂', '😀', '🔥'];
const ENERGY_LABELS = ['Esausto', 'Scarico', 'Ok', 'Carico', 'Al massimo'];

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: BodyLog | null;
}

const str = (n?: number) => (n == null ? '' : String(n));

export function BodyLogModal({ open, onClose, editing }: Props) {
  const { save } = useBodyLogs();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const [goal, setGoal] = useState('');
  const [arm, setArm] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [thigh, setThigh] = useState('');
  const [showCirc, setShowCirc] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setWeight(str(editing?.weight));
    setBodyFat(str(editing?.bodyFat));
    setSleep(str(editing?.sleepHours));
    setEnergy(editing?.energy);
    setNotes(editing?.notes ?? '');
    setGoal(editing?.weeklyGoal ?? '');
    setArm(str(editing?.circumferences?.arm));
    setWaist(str(editing?.circumferences?.waist));
    setChest(str(editing?.circumferences?.chest));
    setThigh(str(editing?.circumferences?.thigh));
    setShowCirc(Boolean(editing?.circumferences));
    setBusy(false);
  }, [open, editing]);

  const num = (v: string) => parseNum(v) ?? undefined;
  const w = num(weight);
  const bf = num(bodyFat);
  const invalid = (w != null && (w < 20 || w > 400)) || (bf != null && (bf < 2 || bf > 70));
  const empty = w == null && bf == null && !sleep && energy == null && !notes.trim() && !goal.trim();

  const submit = async () => {
    if (invalid || empty) return;
    setBusy(true);
    const circ = { arm: num(arm), waist: num(waist), chest: num(chest), thigh: num(thigh) };
    const hasCirc = Object.values(circ).some((v) => v != null);
    await settle(
      save({
        id: editing?.id,
        createdAt: editing?.createdAt,
        date,
        weight: w,
        bodyFat: bf,
        sleepHours: num(sleep),
        energy,
        notes: notes.trim() || undefined,
        weeklyGoal: goal.trim() || undefined,
        circumferences: hasCirc ? circ : undefined,
      }),
    );
    toast.success(editing ? 'Log aggiornato' : 'Log salvato');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Modifica log' : 'Nuovo log corpo'}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={invalid || empty} onClick={submit}>
          Salva
        </Button>
      }
    >
      <div className="space-y-3">
        <Input label="Data" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Peso" kind="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <Input label="Body fat" kind="decimal" suffix="%" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
        </div>
        {invalid && <p className="text-sm text-danger">Controlla i valori: peso 20–400 kg, BF 2–70%.</p>}
        <Input label="Ore di sonno medie" kind="decimal" suffix="h" value={sleep} onChange={(e) => setSleep(e.target.value)} />

        <fieldset>
          <legend className="section-title">Energia</legend>
          <div className="grid grid-cols-5 gap-2">
            {ENERGY.map((e, i) => (
              <button
                key={e}
                type="button"
                aria-pressed={energy === i + 1}
                aria-label={`Energia ${i + 1}: ${ENERGY_LABELS[i]}`}
                onClick={() => setEnergy(energy === i + 1 ? undefined : i + 1)}
                className={cn(
                  'flex h-14 flex-col items-center justify-center rounded-md border text-2xl transition-colors',
                  energy === i + 1 ? 'border-accent-500 bg-accent-glow' : 'border-line bg-surface-2',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>

        <TextArea label="Note recupero" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <TextArea label="Obiettivo della settimana (opzionale)" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />

        <button
          type="button"
          onClick={() => setShowCirc(!showCirc)}
          className="h-11 text-sm font-semibold text-accent-400"
          aria-expanded={showCirc}
        >
          {showCirc ? '− Nascondi circonferenze' : '+ Circonferenze (opzionale)'}
        </button>
        {showCirc && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Braccio" kind="decimal" suffix="cm" value={arm} onChange={(e) => setArm(e.target.value)} />
            <Input label="Petto" kind="decimal" suffix="cm" value={chest} onChange={(e) => setChest(e.target.value)} />
            <Input label="Vita" kind="decimal" suffix="cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
            <Input label="Coscia" kind="decimal" suffix="cm" value={thigh} onChange={(e) => setThigh(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
