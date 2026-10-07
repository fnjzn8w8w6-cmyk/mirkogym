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
import { LevelScale } from '../ui/LevelScale';
import { NewBadge } from '../ui/Help';
import { BF_SOURCE_IT, bodyFatNow, type BodyFatSource } from '@/lib/bodyfat-estimate';
import { formatKg } from '@/lib/analytics';

export const ENERGY_LABELS = ['Esausto', 'Scarico', 'Normale', 'Carico', 'Al top'];

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: BodyLog | null;
}

const str = (n?: number) => (n == null ? '' : String(n));

export function BodyLogModal({ open, onClose, editing }: Props) {
  const { save, bodyLogs } = useBodyLogs();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [bfSource, setBfSource] = useState<BodyFatSource>('calipers');
  const [showBf, setShowBf] = useState(false);
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
    setBfSource(editing?.bodyFatSource && editing.bodyFatSource !== 'photo' ? editing.bodyFatSource : 'calipers');
    setShowBf(editing?.bodyFat != null);
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

  const bfNow = bodyFatNow(bodyLogs);
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
        bodyFat: showBf ? bf : editing?.bodyFat,
        bodyFatSource: showBf && bf != null ? (editing?.bodyFatSource === 'photo' && bf === editing.bodyFat ? 'photo' : bfSource) : editing?.bodyFatSource,
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
        <Input label="Peso" kind="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
        {/* massa grassa: niente numeri a occhio ogni giorno, solo misure vere */}
        {!showBf ? (
          <div className="rounded-md border border-line-subtle bg-surface-2 p-3">
            <p className="text-sm text-fg-2">
              {bfNow
                ? `Massa grassa ${bfNow.estimated ? 'stimata' : 'misurata'}: ${formatKg(bfNow.value)}%. `
                : ''}
              La aggiorniamo noi dal trend del peso; la misura vera arriva dal check-in settimanale con foto.
            </p>
            <button type="button" onClick={() => setShowBf(true)} className="mt-1 flex h-10 items-center gap-2 text-sm font-semibold text-accent-400">
              + Ho una misura affidabile della massa grassa <NewBadge />
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-line-subtle bg-surface-2 p-3">
            <Input label="Massa grassa" kind="decimal" suffix="%" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-3">Con cosa l'hai misurata?</div>
            <div className="flex flex-wrap gap-2">
              {(['calipers', 'scale', 'dexa'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={bfSource === k}
                  onClick={() => setBfSource(k)}
                  className={cn('h-9 rounded-full border px-3 text-sm', bfSource === k ? 'border-accent-500 bg-accent-glow font-semibold text-accent-400' : 'border-line bg-surface text-fg-2')}
                >
                  {BF_SOURCE_IT[k].charAt(0).toUpperCase() + BF_SOURCE_IT[k].slice(1)}
                </button>
              ))}
            </div>
            {bfSource === 'scale' && <p className="text-xs text-fg-3">La bilancia oscilla molto: usiamo la media delle misure degli ultimi 7 giorni.</p>}
            {!editing?.bodyFat && (
              <button type="button" onClick={() => { setShowBf(false); setBodyFat(''); }} className="h-9 text-sm text-fg-3">
                Annulla, non ho una misura
              </button>
            )}
          </div>
        )}
        {invalid && <p className="text-sm text-danger">Controlla i valori: peso 20–400 kg, BF 2–70%.</p>}
        <Input label="Ore di sonno medie" kind="decimal" suffix="h" value={sleep} onChange={(e) => setSleep(e.target.value)} />

        <fieldset>
          <legend className="section-title">Energia</legend>
          <LevelScale label="Energia" value={energy ?? 0} words={ENERGY_LABELS} onChange={(v) => setEnergy(energy === v ? undefined : v)} />
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
