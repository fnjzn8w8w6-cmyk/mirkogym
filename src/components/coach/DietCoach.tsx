import { MicButton, appendText } from '@/components/ui/MicButton';
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
  WEEKDAYS_IT,
  type DietChange,
  type NutritionPrefs,
} from '@/lib/coach';
import {
  SLOT_LABEL,
  adaptPlanToPrefs,
  dayTotals,
  mealInfo,
  planDiff,
  planWeek,
  recipeForQuery,
  setCustomMeal,
  setRecipeMeal,
  type WeekPlan,
} from '@/lib/recipes';

const EXAMPLES = [
  'Domani a cena mangio una pizza',
  'Giovedì a pranzo vorrei qualcosa col pollo',
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

interface Proposal {
  change: DietChange;
  prefChange: boolean;
  prefs: NutritionPrefs;
  adjust: number;
  target: Nutrition;
  plan: WeekPlan;
  rebuilt: boolean;
  diff: ReturnType<typeof planDiff>;
  notes: string[];
  touchedDays: number[];
}

const todayIdx = () => (new Date().getDay() + 6) % 7;
function dayLabel(d: number): string {
  const t = todayIdx();
  const name = WEEKDAYS_IT[d].charAt(0).toUpperCase() + WEEKDAYS_IT[d].slice(1);
  if (d === t) return `Oggi (${name.toLowerCase()})`;
  if (d === (t + 1) % 7) return `Domani (${name.toLowerCase()})`;
  return name;
}

/** Dietologo: la richiesta in linguaggio naturale diventa impostazioni, obiettivi e un nuovo piano settimanale. */
export function DietCoach({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const toast = useToast();
  const ai = useAITask();
  const { data } = useRecipes();
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const prefs = settings.nutritionPrefs ?? DEFAULT_NUTRITION;
  const adjust = settings.kcalAdjust ?? 0;
  const current = useMemo(() => userNutrition(profile, settings), [profile, settings]);
  const byId = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data]);

  /** Riassunto del piano per l'AI (così sa cosa c'è in ogni pasto di ogni giorno). */
  const planSummary = useMemo(() => {
    const plan = settings.weekPlan;
    if (!plan) return '';
    return plan.days
      .map((d, i) => `${WEEKDAYS_IT[i]}: ${d.meals.map((m) => `${m.slot} ${mealInfo(m, byId).name}`).join('; ')}`)
      .join('\n');
  }, [settings.weekPlan, byId]);

  const submit = async () => {
    const text = request.trim();
    if (text.length < 5 || !data) return;
    const change = await ai.run((o) => interpretDietRequest(text, profile, prefs, current, adjust, planSummary, o));
    if (!change) return;
    const prefChange = change.scope !== 'meals';
    const nextPrefs = prefChange ? applyDietChange(prefs, change, text) : prefs;
    const nextAdjust = prefChange ? adjust + change.kcalDelta : adjust;
    const target = nutrition(profile, nextAdjust, nextPrefs.style ?? 'standard');
    const pp = planPrefs(nextPrefs, settings.favoriteRecipes ?? []);
    const notes: string[] = [];
    let plan = settings.weekPlan;
    let rebuilt = false;
    if (!plan || change.scope === 'rebuild') {
      plan = planWeek(data, target, pp, Date.now());
      rebuilt = true;
    } else if (prefChange) {
      // cambio solo i pasti che non rispettano più le preferenze, poi ricalcolo le porzioni
      const r = adaptPlanToPrefs(plan, data, target, pp);
      plan = r.plan;
      rebuilt = r.rebuilt;
    }
    for (const e of change.mealEdits) {
      if (e.kind === 'free') {
        plan = setCustomMeal(plan, e.day, e.slot, e.name, { kcal: e.kcal ?? 0, protein: e.protein ?? 0, carbs: e.carbs ?? 0, fat: e.fat ?? 0 }, data, target, pp);
      } else {
        const used = plan.days.flatMap((d) => d.meals.map((m) => m.refId));
        const r = recipeForQuery(data, pp, e.slot, e.query ?? e.name, used);
        if (r) plan = setRecipeMeal(plan, e.day, e.slot, r.id, data, target, pp);
        else notes.push(`Non ho trovato una ricetta adatta per “${e.query ?? e.name}”: quel pasto resta com'è.`);
      }
    }
    const diff = rebuilt ? [] : planDiff(settings.weekPlan, plan, data);
    const touchedDays = [...new Set(change.mealEdits.map((e) => e.day))];
    setProposal({ change, prefChange, prefs: nextPrefs, adjust: nextAdjust, target, plan, rebuilt, diff, notes, touchedDays });
  };

  const apply = async () => {
    if (!proposal) return;
    await settle(update({ ...(proposal.prefChange ? { nutritionPrefs: proposal.prefs, kcalAdjust: proposal.adjust } : {}), weekPlan: proposal.plan }));
    setProposal(null);
    setRequest('');
    toast.success(proposal.prefChange ? 'Dieta aggiornata dal coach' : 'Piano aggiornato');
  };

  const reset = async () => {
    await settle(update({ nutritionPrefs: { ...prefs, style: 'standard', request: '', summary: '' }, kcalAdjust: 0 }));
    toast.success('Obiettivi riportati allo standard');
  };

  const preview = proposal?.plan.days[0]?.meals ?? [];
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
        <div className="relative mt-3 [&_textarea]:pr-14">
          <TextArea label="Cosa vuoi cambiare nella tua dieta?" rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
          <MicButton size="sm" className="absolute right-2 top-2" onText={(t) => setRequest((r) => appendText(r, t))} />
        </div>
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
            <Button fullWidth icon={<Sparkles className="h-5 w-5" />} disabled={request.trim().length < 5 || !data} onClick={() => void submit()}>
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
                {(proposal.prefChange ? describeDietChange(proposal.change) : []).map((d) => (
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
            {proposal.prefChange && (
              <div>
                <div className="section-title">Obiettivi giornalieri</div>
                <TargetsDiff before={current} after={proposal.target} />
                {proposal.target.target === Math.max(proposal.target.bmr, profile.sex === 'm' ? 1500 : 1200) && (
                  <p className="mt-1 text-xs text-fg-3">Le calorie non scendono sotto il minimo di sicurezza.</p>
                )}
              </div>
            )}
            {proposal.rebuilt ? (
              <div>
                <div className="section-title">Nuovo piano · esempio di lunedì</div>
                <ul className="space-y-1 text-sm text-fg-2">
                  {preview.map((m, i) => (
                    <li key={i}>• {mealInfo(m, byId).name}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-fg-3">Totale del giorno: {dayTotals(preview).kcal} kcal · 7 giorni tutti diversi.</p>
              </div>
            ) : (
              <div>
                <div className="section-title">Modifiche al piano</div>
                {proposal.diff.length === 0 ? (
                  <p className="text-sm text-fg-2">Nessun pasto da cambiare{proposal.prefChange ? ': ricalcolo solo le porzioni sui nuovi obiettivi.' : '.'}</p>
                ) : (
                  <ul className="space-y-2">
                    {proposal.diff.slice(0, 12).map((d, i) => (
                      <li key={i} className="rounded-md bg-surface-2 p-2.5 text-sm">
                        <div className="text-xs uppercase text-fg-3">
                          {dayLabel(d.day)} · {SLOT_LABEL[d.slot]}
                        </div>
                        <div className="text-base text-fg">
                          {d.before && <span className="text-fg-3 line-through">{d.before}</span>} {d.before && '→ '}
                          <strong>{d.after}</strong>
                        </div>
                      </li>
                    ))}
                    {proposal.diff.length > 12 && <li className="text-sm text-fg-3">…e altri {proposal.diff.length - 12} pasti</li>}
                  </ul>
                )}
                {proposal.touchedDays.map((d) => {
                  const t = dayTotals(proposal.plan.days[d].meals);
                  return (
                    <p key={d} className="mt-2 text-xs text-fg-3">
                      {dayLabel(d)}: gli altri pasti sono stati ricalcolati per restare sull'obiettivo ({t.kcal} / {proposal.target.target} kcal, proteine{' '}
                      {t.protein} g).
                    </p>
                  );
                })}
              </div>
            )}
            {proposal.notes.map((n) => (
              <p key={n} className="text-sm text-warning">
                {n}
              </p>
            ))}
            <Button size="lg" fullWidth onClick={() => void apply()}>
              {proposal.prefChange ? 'Applica alla mia dieta' : 'Aggiorna il piano'}
            </Button>
            <p className="text-xs text-fg-3">
              {proposal.rebuilt ? 'Il piano settimanale verrà rifatto; il diario e le ricette salvate restano.' : 'Il resto del piano resta invariato.'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
