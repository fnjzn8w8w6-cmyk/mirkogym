import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { AIBusy, useAITask } from './AIBusy';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { formatTonnage } from '@/lib/analytics';
import { nutrition, type UserProfile } from '@/lib/metabolism';
import { checkInDue, checkInSummary, evaluate, weekStats, type CheckIn, type CheckInAnswers } from '@/lib/checkin';
import { loadRecipes, rescalePlan } from '@/lib/recipes';
import { DEFAULT_NUTRITION, planPrefs } from '@/components/food/NutritionPlanner';

const QUESTIONS: { key: keyof Omit<CheckInAnswers, 'note'>; label: string; scale: string[] }[] = [
  { key: 'energy', label: 'Energia durante la settimana', scale: ['😫', '😕', '😐', '🙂', '⚡'] },
  { key: 'sleep', label: 'Qualità del sonno', scale: ['😵', '🥱', '😐', '😌', '😴'] },
  { key: 'stress', label: 'Stress (lavoro, studio, vita)', scale: ['😌', '🙂', '😐', '😟', '🤯'] },
  { key: 'soreness', label: 'Dolori muscolari / articolari', scale: ['💪', '🙂', '😐', '😣', '🤕'] },
  { key: 'hunger', label: 'Fame durante il giorno', scale: ['🙂', '😊', '😐', '😋', '🤤'] },
  { key: 'adherence', label: 'Quanto hai seguito la dieta?', scale: ['0–20%', '40%', '60%', '80%', '100%'] },
];
const DEFAULT_ANSWERS: CheckInAnswers = { energy: 3, sleep: 3, stress: 3, soreness: 2, hunger: 3, adherence: 4 };

function Scale({ value, options, onChange, label }: { value: number; options: string[]; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          aria-label={`${label}: ${i + 1} su 5`}
          onClick={() => onChange(i + 1)}
          className={cn(
            'h-11 rounded-md border',
            o.length > 2 ? 'text-xs font-semibold' : 'text-xl',
            value === i + 1 ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function WeeklyCheckIn({ profile, autoOpen }: { profile: UserProfile; autoOpen?: boolean }) {
  const { settings, update } = useSettings();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const meso = useMesocycle();
  const toast = useToast();
  const ai = useAITask();
  const history = settings.checkIns ?? [];
  const due = checkInDue(history);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'ask' | 'result'>('ask');
  const [answers, setAnswers] = useState<CheckInAnswers>(DEFAULT_ANSWERS);
  const [summary, setSummary] = useState<string | null>(null);
  const [applyKcal, setApplyKcal] = useState(true);
  const [applyDeload, setApplyDeload] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (autoOpen && due) setOpen(true);
  }, [autoOpen, due]);

  const stats = useMemo(() => weekStats(sessions, bodyLogs, profile), [sessions, bodyLogs, profile]);
  const deloadAvailable = Boolean(meso.mesocycle) && !meso.isDeloadWeek;
  const result = useMemo(() => evaluate(answers, stats, deloadAvailable), [answers, stats, deloadAvailable]);

  const start = () => {
    setStep('ask');
    setSummary(null);
    setAnswers(DEFAULT_ANSWERS);
    setOpen(true);
  };

  const analyze = async () => {
    setStep('result');
    setApplyKcal(result.kcalChange !== 0);
    setApplyDeload(result.deload);
    const text = await ai.run((o) => checkInSummary(answers, stats, result, profile, o));
    setSummary(text);
  };

  const finish = async () => {
    setSaving(true);
    const kcalChange = applyKcal ? result.kcalChange : 0;
    const deload = applyDeload && result.deload;
    const entry: CheckIn = {
      date: Date.now(),
      answers: { ...answers, note: answers.note?.trim() || undefined },
      stats,
      kcalChange,
      deload,
      summary: summary ?? result.points.join(' '),
    };
    const newAdjust = Math.max(-600, Math.min(600, (settings.kcalAdjust ?? 0) + kcalChange));
    const patch: Parameters<typeof update>[0] = { checkIns: [entry, ...history].slice(0, 12) };
    if (kcalChange !== 0) {
      patch.kcalAdjust = newAdjust;
      // il piano pasti segue il nuovo obiettivo (stesse ricette, porzioni ricalcolate)
      if (settings.weekPlan) {
        try {
          const data = await loadRecipes();
          patch.weekPlan = rescalePlan(
            settings.weekPlan,
            data,
            nutrition(profile, newAdjust, settings.nutritionPrefs?.style),
            planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, settings.favoriteRecipes ?? []),
          );
        } catch {
          /* il piano verrà ricalibrato dalla sezione Dieta */
        }
      }
    }
    await settle(update(patch));
    if (deload) await settle(meso.forceDeload());
    setSaving(false);
    setOpen(false);
    toast.success(kcalChange || deload ? 'Check-in salvato e piano aggiornato' : 'Check-in salvato');
  };

  const last = history[0];

  return (
    <>
      <Card className={cn('p-4', due && 'border-accent-500/50')}>
        <div className="flex items-center gap-2 text-base font-semibold text-fg">
          <ClipboardCheck className="h-5 w-5 text-accent-500" aria-hidden /> Check-in settimanale
        </div>
        {due ? (
          <p className="mt-1 text-sm text-fg-2">
            2 minuti per fare il punto: energia, sonno, fame, dieta. Il coach analizza anche allenamenti e peso e aggiusta calorie e carichi.
          </p>
        ) : (
          last && (
            <p className="mt-1 line-clamp-3 text-sm text-fg-2">
              {new Date(last.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}: {last.summary}
            </p>
          )
        )}
        <Button className="mt-3" size="sm" variant={due ? 'primary' : 'secondary'} onClick={start}>
          {due ? 'Fai il check-in' : 'Rifai il check-in'}
        </Button>
        {history.length > 1 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-fg-3">Storico ({history.length})</summary>
            <ul className="mt-2 space-y-2">
              {history.slice(1).map((c) => (
                <li key={c.date} className="rounded-md bg-surface-2 p-2 text-sm text-fg-2">
                  <span className="font-semibold text-fg">{new Date(c.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span> ·{' '}
                  {c.stats.sessions}/{c.stats.planned} allenamenti
                  {c.kcalChange ? ` · ${c.kcalChange > 0 ? '+' : ''}${c.kcalChange} kcal` : ''}
                  {c.deload ? ' · deload' : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Check-in settimanale" dismissible={!saving}>
        {step === 'ask' ? (
          <div className="space-y-4">
            {QUESTIONS.map((q) => (
              <div key={q.key}>
                <div className="mb-1.5 text-base text-fg">{q.label}</div>
                <Scale label={q.label} value={answers[q.key]} options={q.scale} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
              </div>
            ))}
            <TextArea
              label="Qualcosa da dire al coach? (facoltativo)"
              rows={2}
              value={answers.note ?? ''}
              onChange={(e) => setAnswers({ ...answers, note: e.target.value })}
            />
            <Button fullWidth size="lg" onClick={() => void analyze()}>
              Analizza la mia settimana
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                ['Allenamenti', `${stats.sessions}/${stats.planned}`],
                ['Volume', stats.tonnage ? formatTonnage(stats.tonnage) : '—'],
                ['Record', String(stats.prs)],
                ['Peso', stats.weightRate != null ? `${stats.weightRate >= 0 ? '+' : ''}${stats.weightRate.toFixed(2).replace('.', ',')} kg/sett.` : '—'],
              ].map(([l, v]) => (
                <div key={l} className="rounded-md bg-surface-2 py-2">
                  <div className="text-lg text-fg">{v}</div>
                  <div className="text-xs uppercase text-fg-3">{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-fg-2">Indice di fatica</span>
                <span className={cn('font-semibold', result.fatigue >= 55 ? 'text-warning' : 'text-success')}>{result.fatigue}/100</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${result.fatigue}%`, backgroundColor: result.fatigue >= 70 ? '#EF4444' : result.fatigue >= 55 ? '#EAB308' : '#22C55E' }}
                />
              </div>
            </div>

            {ai.busy ? (
              <AIBusy status={ai.status} onCancel={ai.cancel} />
            ) : summary ? (
              <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-accent-400">
                  <Sparkles className="h-4 w-4" aria-hidden /> Il tuo coach
                </div>
                <p className="whitespace-pre-line text-base text-fg">{summary}</p>
              </div>
            ) : ai.error ? (
              <p className="text-sm text-fg-3">Commento del coach non disponibile ({ai.error}). Ecco l'analisi calcolata dall'app:</p>
            ) : null}

            <ul className="space-y-2">
              {result.points.map((p) => (
                <li key={p} className="text-base text-fg-2">
                  {p}
                </li>
              ))}
            </ul>

            {(result.kcalChange !== 0 || result.deload) && (
              <div className="space-y-2 rounded-lg bg-surface-2 p-3">
                <div className="section-title !mb-1">Modifiche consigliate</div>
                {result.kcalChange !== 0 && (
                  <label className="flex items-center gap-3 text-base text-fg">
                    <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={applyKcal} onChange={(e) => setApplyKcal(e.target.checked)} />
                    Calorie {result.kcalChange > 0 ? '+' : ''}
                    {result.kcalChange} kcal/giorno{settings.weekPlan ? ' (porzioni del piano ricalcolate)' : ''}
                  </label>
                )}
                {result.deload && (
                  <label className="flex items-center gap-3 text-base text-fg">
                    <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={applyDeload} onChange={(e) => setApplyDeload(e.target.checked)} />
                    Settimana di scarico (carichi −{settings.deloadPercentage}%)
                  </label>
                )}
              </div>
            )}
            <Button fullWidth size="lg" loading={saving} onClick={() => void finish()}>
              Salva check-in
            </Button>
            <Button fullWidth variant="ghost" disabled={saving} onClick={() => setStep('ask')}>
              Modifica le risposte
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
