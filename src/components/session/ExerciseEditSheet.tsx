import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Exercise } from '@/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Segmented, Toggle } from '../ui/Input';
import { HelpTip } from '../ui/Help';
import { parseRestSeconds } from '@/lib/progression';
import { rirRange, rirTargetOf, scaleLabel, type EffortScale } from '@/lib/effort';
import { formatClock } from '@/lib/date-utils';

export interface ExerciseEdit {
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: string;
  rest: string;
  warmup: boolean;
  scope: 'today' | 'schedule';
}

const restString = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} sec`);
const fmt = (n: number) => String(n).replace('.', ',');

function Stepper({ value, onChange, min, max, step = 1, show, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; show?: string; label: string }) {
  const btn = 'flex h-10 w-10 items-center justify-center rounded-md bg-surface-3 text-fg disabled:opacity-30';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} aria-label={`${label}: meno`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-[3.25rem] text-center font-display text-xl font-extrabold text-fg" aria-live="polite">
        {show ?? fmt(value)}
      </span>
      <button type="button" className={btn} aria-label={`${label}: più`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-subtle py-3">
      <div className="min-w-0">
        <div className="text-base font-semibold text-fg">{title}</div>
        {sub && <div className="text-xs text-fg-3">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/** Modifica di un esercizio durante la sessione: serie, ripetizioni, sforzo, recupero e riscaldamento. */
export function ExerciseEditSheet({
  open,
  onClose,
  exercise,
  workingSets,
  warmupOn,
  canWarmup,
  canSaveToSchedule,
  effortScale,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  exercise: Exercise;
  workingSets: number;
  warmupOn: boolean;
  canWarmup: boolean;
  canSaveToSchedule: boolean;
  effortScale: EffortScale;
  onApply: (e: ExerciseEdit) => void;
}) {
  const [sets, setSets] = useState(workingSets);
  const [repMin, setRepMin] = useState(exercise.repMin);
  const [repMax, setRepMax] = useState(exercise.repMax);
  const [rir, setRir] = useState<[number, number]>(rirRange(exercise.rirTarget));
  const [rest, setRest] = useState(parseRestSeconds(exercise.rest));
  const [warmup, setWarmup] = useState(warmupOn);
  const [scope, setScope] = useState<'today' | 'schedule'>('today');

  useEffect(() => {
    if (!open) return;
    setSets(workingSets);
    setRepMin(exercise.repMin);
    setRepMax(exercise.repMax);
    setRir(rirRange(exercise.rirTarget));
    setRest(parseRestSeconds(exercise.rest));
    setWarmup(warmupOn);
    setScope('today');
  }, [open, exercise, workingSets, warmupOn]);

  const rpe = effortScale === 'rpe';
  // in RPE il "da" è il valore più basso (= RIR più alto)
  const lo = rpe ? 10 - rir[1] : rir[0];
  const hi = rpe ? 10 - rir[0] : rir[1];
  const setLo = (v: number) => (rpe ? setRir([rir[0], Math.max(rir[0], 10 - v)]) : setRir([Math.min(v, rir[1]), rir[1]]));
  const setHi = (v: number) => (rpe ? setRir([Math.min(rir[1], 10 - v), rir[1]]) : setRir([rir[0], Math.max(v, rir[0])]));
  const orig = rirRange(exercise.rirTarget);
  // se lo sforzo non è stato toccato si tiene il bersaglio originale (anche quello serie per serie)
  const rirUnchanged = orig[0] === rir[0] && orig[1] === rir[1];
  const perSet = exercise.rirTarget.includes('/') || /ult/i.test(exercise.rirTarget);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifica esercizio"
      footer={
        <Button
          size="lg"
          fullWidth
          onClick={() =>
            onApply({
              sets,
              repMin,
              repMax: Math.max(repMin, repMax),
              rirTarget: rirUnchanged ? exercise.rirTarget : rirTargetOf(rir[0], rir[1]),
              rest: restString(rest),
              warmup,
              scope,
            })
          }
        >
          Applica
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-fg-2">{exercise.name}</p>
        <HelpTip id="session-edit" />
      </div>
      <Row title="Serie" sub="allenanti, senza riscaldamento">
        <Stepper label="Serie" value={sets} onChange={setSets} min={1} max={10} />
      </Row>
      <Row title="Ripetizioni minime">
        <Stepper label="Ripetizioni minime" value={repMin} onChange={(v) => { setRepMin(v); if (v > repMax) setRepMax(v); }} min={1} max={50} />
      </Row>
      <Row title="Ripetizioni massime">
        <Stepper label="Ripetizioni massime" value={repMax} onChange={(v) => { setRepMax(v); if (v < repMin) setRepMin(v); }} min={1} max={50} />
      </Row>
      <Row title={`Sforzo (${scaleLabel(effortScale)}) da`} sub={perSet ? 'sostituisce lo sforzo serie per serie' : rpe ? 'più alto = più vicino al limite' : 'ripetizioni lasciate in riserva'}>
        <Stepper label="Sforzo minimo" value={lo} onChange={setLo} min={rpe ? 6 : 0} max={rpe ? 10 : 4} step={0.5} />
      </Row>
      <Row title={`Sforzo (${scaleLabel(effortScale)}) a`}>
        <Stepper label="Sforzo massimo" value={hi} onChange={setHi} min={rpe ? 6 : 0} max={rpe ? 10 : 4} step={0.5} />
      </Row>
      <Row title="Recupero" sub="tra una serie e l'altra">
        <Stepper label="Recupero" value={rest} onChange={setRest} min={15} max={600} step={15} show={formatClock(rest)} />
      </Row>
      {canWarmup && (
        <div className="border-b border-line-subtle py-1">
          <Toggle checked={warmup} onChange={setWarmup} label="Riscaldamento suggerito" description="serie W prima di quelle allenanti" />
        </div>
      )}
      <div className="mt-4">
        <div className="section-title">Vale per</div>
        {canSaveToSchedule ? (
          <Segmented
            label="Vale per"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'today', label: 'Solo oggi' },
              { value: 'schedule', label: 'Anche nella scheda' },
            ]}
          />
        ) : (
          <p className="text-sm text-fg-3">Esercizio aggiunto oggi: la modifica vale solo per questa sessione.</p>
        )}
      </div>
    </Modal>
  );
}
