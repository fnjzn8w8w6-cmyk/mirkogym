import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { HelpTip, NewBadge } from '@/components/ui/Help';
import { composition, type UserProfile } from '@/lib/metabolism';
import { PHASE_EMOJI, type GoalPlan } from '@/lib/goal-plan';
import { alternatives, applyAlternative, checkPlan, compOf, leanGainPerWeek, levelLabel, planVerdict, priorityOf, type Verdict } from '@/lib/goal-feasibility';
import { cn } from '@/lib/cn';

const kg = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  ok: { text: '✅ Realistico per te', cls: 'border-accent-500/40 bg-accent-glow' },
  tight: { text: '🟡 Fattibile, ma al limite', cls: 'border-warning/40 bg-warning/10' },
  no: { text: '❌ Non realistico così com’è', cls: 'border-danger/40 bg-danger/10' },
};

/** Composizione attuale (massa grassa misurata o, se manca, stimata). */
export function currentComp(profile: UserProfile, current: { weight: number; bf?: number }) {
  const bf = current.bf ?? composition({ ...profile, weightKg: current.weight }).bf.value;
  return { comp: compOf(current.weight, bf), estimated: current.bf == null };
}

/** Il coach verifica il piano con i tuoi dati e propone alternative raggiungibili entro la stessa data. */
export function GoalCheck({ profile, current, plan, onApply }: { profile: UserProfile; current: { weight: number; bf?: number }; plan: GoalPlan; onApply?: (p: GoalPlan) => void }) {
  const { comp, estimated } = currentComp(profile, current);
  const checks = useMemo(() => checkPlan(profile, comp, plan.phases, plan.current), [profile, comp, plan]);
  const verdict = planVerdict(checks);
  const alts = useMemo(() => (verdict === 'ok' ? [] : alternatives(profile, comp, plan.phases, plan.current)), [verdict, profile, comp, plan]);
  const rate = leanGainPerWeek(profile, comp.lean);
  return (
    <section className={cn('space-y-2 rounded-lg border p-3 text-sm text-fg-2', VERDICT[verdict].cls)}>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-3">
        Verifica del coach <NewBadge /> <HelpTip id="goal-check" />
      </div>
      <div className="text-base font-bold text-fg">{VERDICT[verdict].text}</div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.index}>
            <span className="text-fg">
              {PHASE_EMOJI[c.phase.type]} <strong>{c.phase.label}</strong>: arrivi a circa {kg(c.to.weight)} kg al {Math.round(c.to.bf)}%
            </span>
            {c.issues.map((i) => (
              <span key={i} className="mt-0.5 block text-xs">
                • {i}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-3">
        Calcolato per te: {profile.sex === 'm' ? 'uomo' : 'donna'}, {profile.age} anni, livello {levelLabel(profile)}, oggi {kg(comp.weight)} kg al {Math.round(comp.bf)}%
        {estimated ? ' (stima)' : ''}. Con allenamento costante puoi mettere al massimo circa {rate.toFixed(2).replace('.', ',')} kg di massa magra a settimana.
      </p>
      {alts.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="font-semibold text-fg">Alternative realistiche:</div>
          {alts.map((a) => (
            <div key={a.id} className="rounded-md bg-surface-2 p-3">
              <div className="font-semibold text-fg">{a.title}</div>
              <div className="text-accent-400">{a.result}</div>
              <div className="mt-0.5 text-xs">{a.detail}</div>
              {onApply && a.phases.length > 0 && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    onApply({
                      ...plan,
                      createdAt: Date.now(),
                      priority: priorityOf(a.id),
                      phases: applyAlternative(plan.phases, plan.current, a, comp.weight),
                      summary: `${a.title}: ${a.result}. ${a.detail}`,
                    })
                  }
                >
                  Usa questa
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
