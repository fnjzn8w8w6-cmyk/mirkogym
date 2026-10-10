import { MicButton, appendText } from '@/components/ui/MicButton';
import { useCyclingDays } from '@/hooks/use-habits';
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
import { useAthlete, useRecentFoodLogs } from '@/hooks/use-athlete';
import { useData } from '@/hooks/data-context';
import { addDays } from 'date-fns';
import { saveFoodLog } from '@/lib/firestore';
import { fromISODate, toISODate, todayISO } from '@/lib/date-utils';
import { SLOT_TO_MEAL, nextDateOf, planMealEntries } from '@/lib/diary-plan';
import { entryMacros } from '@/components/food/FoodDiary';
import { NewBadge } from '@/components/ui/Help';
import type { DiaryEntry, DiaryMeal } from '@/types';
import { useRecipes } from '@/components/food/shared';
import { planPrefs } from '@/components/food/NutritionPlanner';
import { settle } from '@/lib/firestore';
import { MACRO_STYLE_LABEL, type Nutrition, type UserProfile } from '@/lib/metabolism';
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
import { weekTargets } from '@/lib/habits';
import { SectionTitle } from '@/components/ui/Help';
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
  'Oggi a pranzo ho mangiato 2 piadine col prosciutto',
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

/** Modifica a un pasto del diario: il diario è quello che conta davvero. */
interface DiaryChange {
  date: string;
  meal: DiaryMeal;
  before: DiaryEntry[];
  after: DiaryEntry[];
  /** replace = sostituisce il pasto; append = aggiunge quello che hai mangiato */
  mode: 'replace' | 'append';
}

const MEAL_IT: Record<DiaryMeal, string> = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena', spuntini: 'Spuntini' };
const uid_ = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const kcalOf = (es: DiaryEntry[]) => es.reduce((a, e) => a + entryMacros(e).kcal, 0);
function dateLabel(date: string): string {
  const t = todayISO();
  if (date === t) return 'Oggi';
  if (date === toISODate(addDays(new Date(), 1))) return 'Domani';
  if (date === toISODate(addDays(new Date(), -1))) return 'Ieri';
  const d = fromISODate(date);
  const name = WEEKDAYS_IT[(d.getDay() + 6) % 7];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${d.getDate()}`;
}

interface Proposal {
  change: DietChange;
  diary: DiaryChange[];
  planChanged: boolean;
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
  const cyclingDays = useCyclingDays();
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const toast = useToast();
  const ai = useAITask();
  const athleteMem = useAthlete();
  const { data } = useRecipes();
  const { uid } = useData();
  const foodLogs = useRecentFoodLogs(3);
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [toDiary, setToDiary] = useState(true);
  const [toPlan, setToPlan] = useState(true);
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

  /** Diario da ieri ai prossimi giorni, per l'AI (sa cosa hai già mangiato o segnato). */
  const diaryOn = (date: string) => foodLogs.find((l) => l.date === date)?.entries ?? [];
  const diarySummary = useMemo(
    () =>
      foodLogs
        .filter((l) => l.entries.length)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => {
          const by = (Object.keys(MEAL_IT) as DiaryMeal[])
            .map((m) => [m, l.entries.filter((e) => e.meal === m).map((e) => e.name)] as const)
            .filter(([, n]) => n.length)
            .map(([m, n]) => `${m} ${n.join(', ')}`);
          return `${dateLabel(l.date).toLowerCase()} (${WEEKDAYS_IT[(fromISODate(l.date).getDay() + 6) % 7]}): ${by.join('; ')}`;
        })
        .join('\n'),
    [foodLogs],
  );

  const submit = async () => {
    const text = request.trim();
    if (text.length < 5 || !data) return;
    const change = await ai.run((o) => interpretDietRequest(text, profile, prefs, current, adjust, planSummary, o, athleteMem.text, diarySummary));
    if (!change) return;
    const prefChange = change.scope !== 'meals';
    const nextPrefs = prefChange ? applyDietChange(prefs, change, text) : prefs;
    const nextAdjust = prefChange ? adjust + change.kcalDelta : adjust;
    const target = userNutrition(profile, { ...settings, kcalAdjust: nextAdjust, nutritionPrefs: nextPrefs });
    const pp = planPrefs(nextPrefs, settings.favoriteRecipes ?? []);
    const notes: string[] = [];
    let plan = settings.weekPlan;
    let rebuilt = false;
    const needsPlan = prefChange || change.mealEdits.length > 0;
    if ((!plan && needsPlan) || change.scope === 'rebuild') {
      plan = planWeek(data, target, pp, Date.now(), cyclingDays ? weekTargets(target, cyclingDays) : undefined);
      rebuilt = true;
    } else if (prefChange && plan) {
      // cambio solo i pasti che non rispettano più le preferenze, poi ricalcolo le porzioni
      const r = adaptPlanToPrefs(plan, data, target, pp);
      plan = r.plan;
      rebuilt = r.rebuilt;
    }
    const diary: DiaryChange[] = [];
    for (const e of change.mealEdits) {
      if (!plan) break;
      if (e.kind === 'free') {
        plan = setCustomMeal(plan, e.day, e.slot, e.name, { kcal: e.kcal ?? 0, protein: e.protein ?? 0, carbs: e.carbs ?? 0, fat: e.fat ?? 0 }, data, target, pp);
      } else {
        const used = plan.days.flatMap((d) => d.meals.map((m) => m.refId));
        const r = recipeForQuery(data, pp, e.slot, e.query ?? e.name, used);
        if (r) plan = setRecipeMeal(plan, e.day, e.slot, r.id, data, target, pp);
        else {
          notes.push(`Non ho trovato una ricetta adatta per “${e.query ?? e.name}”: quel pasto resta com'è.`);
          continue;
        }
      }
      // stessa modifica nel diario del giorno (oggi o il prossimo con quel nome)
      const meal = SLOT_TO_MEAL[e.slot];
      const pm = plan.days[e.day].meals.find((m) => m.slot === e.slot) ?? plan.days[e.day].meals.find((m) => SLOT_TO_MEAL[m.slot] === meal);
      if (pm) {
        const date = nextDateOf(e.day);
        diary.push({ date, meal, before: diaryOn(date).filter((x) => x.meal === meal), after: planMealEntries(pm, byId, meal), mode: 'replace' });
      }
    }
    for (const e of change.eaten) {
      const date = toISODate(addDays(new Date(), -e.daysAgo));
      const meal = SLOT_TO_MEAL[e.slot];
      const now = Date.now();
      const after: DiaryEntry[] = e.items.map((it) => {
        const k = 100 / it.grams;
        return {
          id: uid_(),
          meal,
          name: it.name,
          unit: 'g',
          qty: it.grams,
          per: { kcal: Math.round(it.kcal * k), protein: Math.round(it.protein * k * 10) / 10, carbs: Math.round(it.carbs * k * 10) / 10, fat: Math.round(it.fat * k * 10) / 10 },
          ...(it.pieces ? { pieces: it.pieces, pieceGrams: Math.round((it.grams / it.pieces) * 10) / 10 } : {}),
          createdAt: now,
        };
      });
      diary.push({ date, meal, before: diaryOn(date).filter((x) => x.meal === meal), after, mode: 'append' });
    }
    if (!plan && !diary.length) {
      toast.error('Non ho capito cosa cambiare: prova a riformulare la richiesta.');
      return;
    }
    const diff = rebuilt || !plan ? [] : planDiff(settings.weekPlan, plan, data);
    const touchedDays = [...new Set(change.mealEdits.map((e) => e.day))];
    setToDiary(true);
    setToPlan(true);
    setProposal({ change, diary, planChanged: Boolean(plan) && (rebuilt || diff.length > 0 || prefChange), prefChange, prefs: nextPrefs, adjust: nextAdjust, target, plan: plan!, rebuilt, diff, notes, touchedDays });
  };

  const apply = async () => {
    if (!proposal) return;
    const planOk = proposal.planChanged && (toPlan || proposal.prefChange || !proposal.diary.length);
    if (planOk || proposal.prefChange)
      await settle(update({ ...(proposal.prefChange ? { nutritionPrefs: proposal.prefs, kcalAdjust: proposal.adjust } : {}), ...(planOk && proposal.plan ? { weekPlan: proposal.plan } : {}) }));
    const diaryOk = toDiary && proposal.diary.length > 0 && uid;
    if (diaryOk) {
      // un salvataggio per giorno: il pasto viene sostituito (modifica) o integrato (già mangiato)
      const byDate = new Map<string, DiaryEntry[]>();
      for (const c of proposal.diary) {
        const cur = byDate.get(c.date) ?? diaryOn(c.date);
        byDate.set(c.date, c.mode === 'replace' ? [...cur.filter((x) => x.meal !== c.meal), ...c.after] : [...cur, ...c.after]);
      }
      await Promise.all([...byDate].map(([date, entries]) => settle(saveFoodLog(uid, { date, entries }))));
    }
    setProposal(null);
    setRequest('');
    toast.success(diaryOk && planOk ? 'Diario e piano aggiornati' : diaryOk ? 'Diario aggiornato' : proposal.prefChange ? 'Dieta aggiornata dal coach' : 'Piano aggiornato');
  };

  const reset = async () => {
    await settle(update({ nutritionPrefs: { ...prefs, style: 'standard', request: '', summary: '' }, kcalAdjust: 0 }));
    toast.success('Obiettivi riportati allo standard');
  };

  const preview = proposal?.plan?.days[0]?.meals ?? [];
  const diet = DIETS.find((d) => d.value === prefs.diet);

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4">
        <div className="flex items-center gap-2 text-lg text-fg">
          <Apple className="h-5 w-5 text-accent-500" aria-hidden /> <SectionTitle help="coach-diet">Il tuo dietologo</SectionTitle>
        </div>
        <p className="mt-1 text-sm text-fg-2">
          Dimmi cosa vuoi cambiare: obiettivo più veloce o più lento, intolleranze, cibi che ami o eviti, tempo per cucinare, numero di pasti, più
          proteine o meno carboidrati. Adatto calorie, macro, piano settimanale e diario: puoi anche dirmi cosa hai mangiato e lo segno io.
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
            <AIBusy persona="diet" status={ai.status} onCancel={ai.cancel} />
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
            {proposal.diary.length > 0 && (
              <div>
                <div className="section-title">
                  📒 Diario <NewBadge />
                </div>
                <ul className="space-y-2">
                  {proposal.diary.map((c, i) => (
                    <li key={i} className="rounded-md bg-surface-2 p-2.5 text-sm">
                      <div className="text-xs uppercase text-fg-3">
                        {dateLabel(c.date)} · {MEAL_IT[c.meal]}
                      </div>
                      {c.mode === 'replace' && c.before.length > 0 && (
                        <div className="text-fg-3 line-through">
                          {c.before.map((e) => e.name).join(' + ')} · {kcalOf(c.before)} kcal
                        </div>
                      )}
                      <div className="text-base text-fg">
                        {c.mode === 'append' ? '+ ' : ''}
                        <strong>{c.after.map((e) => (e.pieces ? `${e.pieces} pz ${e.name}` : e.unit === 'g' ? `${e.name} ${Math.round(e.qty)} g` : e.name)).join(' + ')}</strong> · {kcalOf(c.after)} kcal
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {proposal.diary.length > 0 && proposal.planChanged && (
              <div className="flex gap-4 text-sm text-fg">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 accent-[#3ddc84]" checked={toDiary} onChange={(e) => setToDiary(e.target.checked)} /> Modifica il diario
                </label>
                {!proposal.prefChange && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 accent-[#3ddc84]" checked={toPlan} onChange={(e) => setToPlan(e.target.checked)} /> Modifica il piano
                  </label>
                )}
              </div>
            )}
            {!proposal.planChanged ? null : proposal.rebuilt ? (
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
            <Button size="lg" fullWidth disabled={!proposal.prefChange && !toDiary && !(toPlan && proposal.planChanged)} onClick={() => void apply()}>
              {proposal.prefChange ? 'Applica alla mia dieta' : proposal.diary.length && !proposal.planChanged ? 'Segna nel diario' : 'Applica'}
            </Button>
            <p className="text-xs text-fg-3">
              {proposal.rebuilt
                ? 'Il piano settimanale verrà rifatto; il diario e le ricette salvate restano.'
                : proposal.diary.length
                  ? 'Il resto del diario e del piano resta invariato.'
                  : 'Il resto del piano resta invariato.'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
