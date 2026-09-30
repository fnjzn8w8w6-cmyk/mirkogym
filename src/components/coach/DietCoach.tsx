import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Apple, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { AIBusy, AINote, useAITask } from './AIBusy';
import { useRecipes } from '@/components/food/shared';
import { planPrefs } from '@/components/food/NutritionPlanner';
import { settle } from '@/lib/firestore';
import { MACRO_STYLE_LABEL, nutrition, type Nutrition, type UserProfile } from '@/lib/metabolism';
import {
  DEFAULT_NUTRITION,
  DIETS,
  applyDietChange,
  describeDietChange,
  interpretDietRequest,
  userNutrition,
  type DietChange,
  type NutritionPrefs,
} from '@/lib/coach';
import { dayTotals, mealInfo, planWeek, type WeekPlan } from '@/lib/recipes';

const EXAMPLES = [
  'Voglio dimagrire un po’ più in fretta',
  'Sono intollerante al lattosio',
  'Durante la settimana ho poco tempo per cucinare',
  'Voglio più proteine, adoro pollo e salmone',
  'Preferisco fare solo 3 pasti al giorno',
  'Non mi piacciono funghi e melanzane',
];

function TargetsDiff({ before, after }: { before: Nutrition; after: Nutrition }) {
  const rows: [string, number, number, string][] = [
    ['Calorie', before.target, after.target, 'kcal'],
    ['Proteine', before.protein, after.protein, 'g'],
    ['Carboidrati', before.carbs, after.carbs, 'g'],
    ['Grassi', before.fat, after.fat, 'g'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(([l, a, b, u]) => (
        <div key={l} className="rounded-md bg-surface-2 p-2">
          <div className="text-xs uppercase text-fg-3">{l}</div>
          <div className="text-base text-fg">
            {a !== b ? (
              <>
                <span className="text-fg-3 line-through">{a}</span> → <strong>{b}</strong> {u}
              </>
            ) : (
              <>
                {b} {u}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dietologo: la richiesta in linguaggio naturale diventa impostazioni, obiettivi e un nuovo piano settimanale. */
export function DietCoach({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const toast = useToast();
  const ai = useAITask();
  const { data } = useRecipes();
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<{ change: DietChange; prefs: NutritionPrefs; adjust: number; target: Nutrition; plan: WeekPlan | null } | null>(null);
  const prefs = settings.nutritionPrefs ?? DEFAULT_NUTRITION;
  const adjust = settings.kcalAdjust ?? 0;
  const current = useMemo(() => userNutrition(profile, settings), [profile, settings]);

  const submit = async () => {
    const text = request.trim();
    if (text.length < 5) return;
    const change = await ai.run((o) => interpretDietRequest(text, profile, prefs, current, adjust, o));
    if (!change) return;
    const nextPrefs = applyDietChange(prefs, change, text);
    const nextAdjust = adjust + change.kcalDelta;
    const target = nutrition(profile, nextAdjust, nextPrefs.style ?? 'standard');
    const plan = data ? planWeek(data, target, planPrefs(nextPrefs, settings.favoriteRecipes ?? []), Date.now()) : null;
    setProposal({ change, prefs: nextPrefs, adjust: nextAdjust, target, plan });
  };

  const apply = async () => {
    if (!proposal) return;
    await settle(update({ nutritionPrefs: proposal.prefs, kcalAdjust: proposal.adjust, ...(proposal.plan ? { weekPlan: proposal.plan } : {}) }));
    setProposal(null);
    setRequest('');
    toast.success('Dieta aggiornata dal coach');
  };

  const reset = async () => {
    await settle(update({ nutritionPrefs: { ...prefs, style: 'standard', request: '', summary: '' }, kcalAdjust: 0 }));
    toast.success('Obiettivi riportati allo standard');
  };

  const byId = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);
  const preview = proposal?.plan?.days[0]?.meals ?? [];
  const diet = DIETS.find((d) => d.value === prefs.diet);

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4">
        <div className="flex items-center gap-2 text-lg text-fg">
          <Apple className="h-5 w-5 text-accent-500" aria-hidden /> Il tuo dietologo
        </div>
        <p className="mt-1 text-sm text-fg-2">
          Dimmi cosa vuoi cambiare: obiettivo più veloce o più lento, intolleranze, cibi che ami o eviti, tempo per cucinare, numero di pasti, più
          proteine o meno carboidrati. Adatto calorie, macro e piano settimanale.
        </p>
        <TextArea className="mt-3" label="Cosa vuoi cambiare nella tua dieta?" rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setRequest((r) => (r ? `${r}. ${ex}` : ex))}
              className="h-9 shrink-0 rounded-full border border-line bg-surface-2 px-3 text-sm text-fg-2"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {ai.busy ? (
            <AIBusy status={ai.status} onCancel={ai.cancel} />
          ) : (
            <Button fullWidth icon={<Sparkles className="h-5 w-5" />} disabled={request.trim().length < 5} onClick={() => void submit()}>
              Adatta la mia dieta
            </Button>
          )}
          {ai.error && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {ai.error}
            </p>
          )}
        </div>
        <div className="mt-3">
          <AINote />
        </div>
      </Card>

      <Card className="p-4">
        <div className="section-title">La tua dieta oggi</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['Kcal', current.target, ''],
            ['Prot.', current.protein, 'g'],
            ['Carbo', current.carbs, 'g'],
            ['Grassi', current.fat, 'g'],
          ].map(([l, v, u]) => (
            <div key={String(l)} className="rounded-md bg-surface-2 py-2">
              <div className="text-lg text-fg">
                {v}
                <span className="text-xs text-fg-3">{u}</span>
              </div>
              <div className="text-xs uppercase text-fg-3">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>
            {diet?.emoji} {diet?.label}
          </Chip>
          <Chip>{prefs.meals} pasti</Chip>
          <Chip>{MACRO_STYLE_LABEL[prefs.style ?? 'standard']}</Chip>
          {adjust !== 0 && (
            <Chip tone="info">
              {adjust > 0 ? '+' : ''}
              {adjust} kcal
            </Chip>
          )}
          {prefs.allergies && <Chip tone="danger">🚫 {prefs.allergies}</Chip>}
          {prefs.dislikes && <Chip tone="warning">✕ {prefs.dislikes}</Chip>}
          {prefs.likes && <Chip tone="success">❤ {prefs.likes}</Chip>}
        </div>
        {prefs.summary && <p className="mt-2 text-sm text-fg-2">Ultima modifica: “{prefs.summary}”</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/food?tab=plan')}>
            Vedi il piano
          </Button>
          {(adjust !== 0 || (prefs.style && prefs.style !== 'standard')) && (
            <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void reset()}>
              Torna agli obiettivi standard
            </Button>
          )}
        </div>
      </Card>

      <Modal open={Boolean(proposal)} onClose={() => setProposal(null)} title="Proposta del dietologo">
        {proposal && (
          <div className="space-y-4">
            <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-3">
              <p className="text-base text-fg">{proposal.change.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {describeDietChange(proposal.change).map((d) => (
                  <Chip key={d} tone="accent">
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            {proposal.change.warnings.map((w) => (
              <p key={w} className="text-sm text-warning">
                ⚠ {w}
              </p>
            ))}
            <div>
              <div className="section-title">Obiettivi giornalieri</div>
              <TargetsDiff before={current} after={proposal.target} />
              {proposal.target.target === Math.max(proposal.target.bmr, profile.sex === 'm' ? 1500 : 1200) && (
                <p className="mt-1 text-xs text-fg-3">Le calorie non scendono sotto il minimo di sicurezza.</p>
              )}
            </div>
            {proposal.plan && (
              <div>
                <div className="section-title">Nuovo piano · esempio di lunedì</div>
                <ul className="space-y-1 text-sm text-fg-2">
                  {preview.map((m, i) => (
                    <li key={i}>• {mealInfo(m, byId).name}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-fg-3">
                  Totale del giorno: {dayTotals(preview).kcal} kcal · 7 giorni tutti diversi, rispettando le nuove preferenze.
                </p>
              </div>
            )}
            <Button size="lg" fullWidth onClick={() => void apply()}>
              Applica alla mia dieta
            </Button>
            <p className="text-xs text-fg-3">Il piano settimanale verrà rigenerato; il diario e le ricette salvate restano.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
