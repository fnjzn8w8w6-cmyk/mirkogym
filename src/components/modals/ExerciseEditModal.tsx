import { useEffect, useState } from 'react';
import type { Exercise } from '@/types';
import { MUSCLE_GROUPS } from '@/lib/seed-data';
import { parseNum } from '@/hooks/use-active-session';
import { cn } from '@/lib/cn';
import { Modal } from '../ui/Modal';
import { Input, TextArea } from '../ui/Input';
import { Button } from '../ui/Button';

interface Props {
  open: boolean;
  exercise: Exercise | null;
  onClose: () => void;
  onSave: (e: Exercise) => void;
  onDelete?: () => void;
}

export function ExerciseEditModal({ open, exercise, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [sets, setSets] = useState('3');
  const [repMin, setRepMin] = useState('8');
  const [repMax, setRepMax] = useState('12');
  const [rir, setRir] = useState('1-2');
  const [rest, setRest] = useState('90 sec');
  const [notes, setNotes] = useState('');
  const [startWeight, setStartWeight] = useState('');

  useEffect(() => {
    if (!open || !exercise) return;
    setName(exercise.name);
    setGroup(exercise.group);
    setSets(String(exercise.sets));
    setRepMin(String(exercise.repMin));
    setRepMax(String(exercise.repMax));
    setRir(exercise.rirTarget);
    setRest(exercise.rest);
    setNotes(exercise.notes ?? '');
    setStartWeight(exercise.startWeight != null ? String(exercise.startWeight) : '');
  }, [open, exercise]);

  const nSets = Number(sets);
  const nMin = Number(repMin);
  const nMax = Number(repMax);
  const errors = [
    name.trim().length < 2 && 'Nome troppo corto',
    !(nSets >= 1 && nSets <= 10) && 'Serie tra 1 e 10',
    !(nMin >= 1 && nMax >= nMin && nMax <= 50) && 'Rep range non valido',
  ].filter(Boolean) as string[];

  const groups = MUSCLE_GROUPS.includes(group as (typeof MUSCLE_GROUPS)[number]) ? [...MUSCLE_GROUPS] : [...MUSCLE_GROUPS, group];

  const save = () => {
    if (!exercise || errors.length) return;
    const sw = parseNum(startWeight);
    onSave({
      ...exercise,
      name: name.trim(),
      group,
      sets: nSets,
      repMin: nMin,
      repMax: nMax,
      rirTarget: rir.trim() || '1-2',
      rest: rest.trim() || '90 sec',
      notes: notes.trim() || undefined,
      startWeight: sw != null && sw > 0 ? sw : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exercise?.name ? 'Modifica esercizio' : 'Nuovo esercizio'}
      footer={
        <div className="flex gap-3">
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              Elimina
            </Button>
          )}
          <Button fullWidth size="lg" disabled={errors.length > 0} onClick={save}>
            Salva
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <div className="section-title">Gruppo muscolare</div>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === group}
                onClick={() => setGroup(g)}
                className={cn(
                  'h-10 rounded-full border px-4 text-sm font-semibold',
                  g === group ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Serie" kind="number" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, ''))} />
          <Input label="Rep min" kind="number" value={repMin} onChange={(e) => setRepMin(e.target.value.replace(/\D/g, ''))} />
          <Input label="Rep max" kind="number" value={repMax} onChange={(e) => setRepMax(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="RIR target (es. 2/1/1)" value={rir} onChange={(e) => setRir(e.target.value)} />
          <Input label="Recupero (es. 2-3 min)" value={rest} onChange={(e) => setRest(e.target.value)} />
        </div>
        <Input label="Carico di partenza (opz.)" kind="decimal" suffix="kg" value={startWeight} onChange={(e) => setStartWeight(e.target.value)} />
        <TextArea label="Note tecniche (opzionale)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {errors.length > 0 && <p className="text-sm text-danger">{errors[0]}</p>}
      </div>
    </Modal>
  );
}
