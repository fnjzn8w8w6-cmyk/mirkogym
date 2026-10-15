import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { HelpTip, NewBadge } from '@/components/ui/Help';
import { useToast } from '@/components/ui/Toast';
import { useApplyCoach, useGoalCoach } from '@/hooks/use-goal-coach';
import { etaText, modeLabel, whatISee, whyNow } from '@/lib/goal-coach';
import { PHASE_EMOJI } from '@/lib/goal-plan';
import { cn } from '@/lib/cn';

const kg = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const DISMISS = 'vl.coach.dismissed';
const dismissed = () => {
  try {
    return localStorage.getItem(DISMISS) ?? '';
  } catch {
    return '';
  }
};

function Bar({ label, from, now, to, unit = 'kg' }: { label: string; from: number; now: number; to: number; unit?: string }) {
  const total = to - from;
  const done = total === 0 ? 1 : Math.max(0, Math.min(1, (now - from) / total));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fg-3">
        <span>{label}</span>
        <span>
          <strong className="text-fg">{kg(now)}</strong> → {kg(to)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(done * 100)}%` }} />
      </div>
    </div>
  );
}

/** Coach adattivo nella card dell'obiettivo: obiettivo finale, avanzamento, fase di adesso e perché, arrivo stimato, proposta da confermare. */
export function CoachSection() {
  const c = useGoalCoach();
  const apply = useApplyCoach();
  const toast = useToast();
  const [review, setReview] = useState(false);
  const [hidden, setHidden] = useState(dismissed);
  if (!c || !c.cp) return null;
  const { cp, target, now, proposal } = c;
  const start = target.start ?? { weight: now.weight, bf: now.bf };
  const startLean = start.weight * (1 - start.bf / 100);
  const startFat = start.weight * (start.bf / 100);
  const needLean = target.weight * (1 - target.bf / 100);
  const needFat = target.weight * (target.bf / 100);
  const seg = cp.path.segments[0];
  const late = target.date && new Date(`${target.date}T12:00:00`).getTime() < cp.early;
  const showProposal = proposal && proposal.id !== hidden;
  return (
    <div className="space-y-2 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-fg-2">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-3">
        Coach adattivo <NewBadge /> <HelpTip id="goal-coach" />
      </div>
      <div className="text-fg">
        🎯 Obiettivo finale: <strong>{kg(target.weight)} kg al {Math.round(target.bf)}%</strong>
      </div>
      <Bar label="Massa magra" from={startLean} now={now.lean} to={needLean} />
      <Bar label="Grasso" from={startFat} now={now.fat} to={needFat} />
      {seg && (
        <p>
          {PHASE_EMOJI[seg.mode === 'bulk' ? 'bulk' : seg.mode === 'cut' ? 'cut' : 'maintain']} <strong className="text-fg">Adesso: {modeLabel(seg.mode).toLowerCase()}.</strong> {whyNow(cp)}
        </p>
      )}
      <p>
        📅 Arrivo stimato <strong className="text-fg">{etaText(cp)}</strong>
        {target.date && (
          <span className={cn('block text-xs', late ? 'text-warning' : 'text-fg-3')}>
            {late ? `La data che desideri (${fmtDate(target.date)}) è prima di quanto realistico con i tuoi dati di oggi.` : `La data che desideri (${fmtDate(target.date)}) è realistica.`}
          </span>
        )}
      </p>
      <p className="text-xs text-fg-3">{whatISee(cp.response)}</p>
      {showProposal && (
        <button type="button" onClick={() => setReview(true)} className="block w-full rounded-md bg-surface-2 px-3 py-2 text-left text-sm text-fg">
          🧑‍🏫 <strong>{proposal.title}</strong>
          <span className="block text-xs font-semibold text-accent-400">Rivedi e conferma →</span>
        </button>
      )}
      {review && proposal && (
        <Modal open onClose={() => setReview(false)} title="Proposta del coach">
          <div className="space-y-3 text-sm text-fg-2">
            <p className="text-base font-bold text-fg">{proposal.title}</p>
            <p>{proposal.detail}</p>
            <ol className="space-y-1.5">
              {proposal.phases.map((ph, i) => (
                <li key={i} className="rounded-md bg-surface-2 px-3 py-2">
                  {PHASE_EMOJI[ph.type]} <strong className="text-fg">{ph.label}</strong>: fino a circa {kg((ph.weightMin + ph.weightMax) / 2)} kg al {ph.targetBf}% · entro il {fmtDate(ph.end)}
                </li>
              ))}
            </ol>
            <p className="text-xs text-fg-3">Calorie e macro si adeguano alla nuova fase. Niente cambia se non confermi.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  try {
                    localStorage.setItem(DISMISS, proposal.id);
                  } catch {
                    /* resta nascosta solo per ora */
                  }
                  setHidden(proposal.id);
                  setReview(false);
                }}
              >
                Non ora
              </Button>
              <Button
                onClick={async () => {
                  await apply(proposal, now);
                  setReview(false);
                  toast.success('Percorso aggiornato: calorie e macro seguono la nuova fase');
                }}
              >
                Conferma
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
