import { useCallback, useMemo } from 'react';
import { useSettings } from './use-settings';
import { useBodyLogs } from './use-body-logs';
import { useEffectiveProfile } from './use-effective-profile';
import { bodyFatNow } from '@/lib/bodyfat-estimate';
import { composition } from '@/lib/metabolism';
import { coachPlan, coachProposal, compOf, observeResponse, targetFromPlan } from '@/lib/goal-coach';
import { settle } from '@/lib/firestore';
import { toISODate } from '@/lib/date-utils';
import type { GoalPhase } from '@/lib/goal-plan';

/** Coach adattivo: obiettivo finale, percorso dai progressi reali, proposta da confermare. */
export function useGoalCoach() {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const p = useEffectiveProfile();
  const plan = settings.goalPlan ?? null;
  return useMemo(() => {
    if (!p || !plan) return null;
    const target = targetFromPlan(plan);
    if (!target) return null;
    const bf = bodyFatNow(bodyLogs)?.value ?? composition(p).bf.value;
    const now = compOf(p.weightKg, bf);
    const response = observeResponse(p, bodyLogs);
    const cp = coachPlan(p, now, target, response);
    const proposal = coachProposal(p, now, plan, bodyLogs);
    return { target, now, response, cp, proposal, converted: Boolean(plan.target) };
  }, [p, plan, bodyLogs]);
}

/** Applica la proposta del coach (solo dopo la conferma): nuove fasi da oggi e obiettivo finale salvato. */
export function useApplyCoach() {
  const { settings, update } = useSettings();
  const p = useEffectiveProfile();
  return useCallback(
    async (prop: { phases: GoalPhase[]; target: { weight: number; bf: number; date?: string }; summary: string }, now: { weight: number; bf: number }) => {
      const plan = settings.goalPlan;
      if (!plan || !settings.profile || !p) return;
      const start = plan.target?.start ?? { weight: Math.round(now.weight * 10) / 10, bf: Math.round(now.bf * 10) / 10, date: toISODate(new Date()) };
      await settle(
        update({
          goalPlan: { ...plan, target: { ...prop.target, start }, phases: prop.phases, current: 0, summary: prop.summary, createdAt: Date.now() },
          profile: { ...settings.profile, goal: prop.phases[0]?.type ?? settings.profile.goal },
        }),
      );
    },
    [settings.goalPlan, settings.profile, p, update],
  );
}
