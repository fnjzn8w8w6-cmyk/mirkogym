import { useMemo, useState } from 'react';
import { bodyFatNow } from '@/lib/bodyfat-estimate';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { MicButton, appendText } from '@/components/ui/MicButton';
import { AIBusy, useAITask } from '@/components/coach/AIBusy';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { userNutrition } from '@/lib/coach';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';
import type { UserProfile } from '@/lib/metabolism';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useSessions } from '@/hooks/use-sessions';
import { forecast, waterEvents } from '@/lib/body-model';
import { HelpTip, NewBadge, SectionTitle } from '@/components/ui/Help';
import { GoalPhotoButton } from './GoalPhoto';
import { GoalCheck, currentComp } from './GoalCheck';
import { CoachSection } from './GoalCoach';
import { coachNow, coachPlan, etaText, observeResponse, pathToPhases, whatISee, whyNow, type GoalTarget } from '@/lib/goal-coach';
import { toISODate } from '@/lib/date-utils';
import { targetFromPlan } from '@/lib/goal-coach';
import { checkPlan, planVerdict } from '@/lib/goal-feasibility';
import {
  PHASE_EMOJI,
  STATE_LABEL,
  interpretGoal,
  phaseName,
  planStatus,
  reflow,
  targetWeight,
  trendWeight,
  type GoalPhase,
  type GoalPlan,
} from '@/lib/goal-plan';

const fmtShort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const kg = (v: number) => v.toFixed(1).replace('.', ',').replace(',0', '');
const range = (p: GoalPhase) => (p.weightMin === p.weightMax ? kg(p.weightMin) : `${kg(p.weightMin)}–${kg(p.weightMax)}`);

const EXAMPLE = 'Es. "Voglio arrivare a 82-83 kg con circa il 17% di massa grassa, poi fare un cut fino a 78-79 kg al 10%". Puoi indicare anche le date.';

/** Domanda aperta → piano a fasi (AI) → linea del tempo modificabile. */
export function GoalPlanEditor({
  profile,
  current,
  initial,
  onChange,
}: {
  profile: UserProfile;
  current: { weight: number; bf?: number };
  initial?: GoalPlan | null;
  onChange: (p: GoalPlan | null) => void;
}) {
  const ai = useAITask();
  const [text, setText] = useState(initial?.text ?? '');
  const [plan, setPlan] = useState<GoalPlan | null>(initial ?? null);
  const set = (p: GoalPlan | null) => {
    setPlan(p);
    onChange(p);
  };
  const edit = (i: number, patch: Partial<GoalPhase>) => plan && set(reflow({ ...plan, phases: plan.phases.map((ph, j) => (j === i ? { ...ph, ...patch, note: undefined } : ph)) }));
  // coach adattivo: dall'obiettivo finale il coach calcola il percorso (fasi) con i tuoi dati reali
  const { bodyLogs } = useBodyLogs();
  // stesso punto di partenza della card e delle proposte del coach
  const nowComp = useMemo(() => coachNow({ ...profile, weightKg: current.weight }, bodyLogs), [profile, current.weight, bodyLogs]);
  const response = useMemo(() => observeResponse({ ...profile, weightKg: current.weight }, bodyLogs), [profile, current.weight, bodyLogs]);
  const adapt = (base: GoalPlan, t: GoalTarget): GoalPlan => {
    const cp = coachPlan({ ...profile, weightKg: current.weight }, nowComp, t, response);
    if (!cp) return { ...base, target: t };
    const start = base.target?.start ?? { weight: Math.round(nowComp.weight * 10) / 10, bf: Math.round(nowComp.bf * 10) / 10, date: toISODate(new Date()) };
    return { ...base, target: { ...t, start }, phases: pathToPhases(cp.path), current: 0, summary: `${whyNow(cp)} Arrivo stimato ${etaText(cp)}.` };
  };
  const cpNow = useMemo(
    () => (plan?.target ? coachPlan({ ...profile, weightKg: current.weight }, nowComp, plan.target, response) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.target?.weight, plan?.target?.bf, response, current.weight],
  );

  return (
    <div className="space-y-3">
      <div className="relative [&_textarea]:pr-14">
        <label htmlFor="goal-text" className="mb-1 block text-sm text-fg-2">
          Descrivi il tuo obiettivo con parole tue <HelpTip id="goal-plan" className="ml-1" />
        </label>
        <textarea
          id="goal-text"
          rows={4}
          value={text}
          placeholder={EXAMPLE}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 p-3 text-base text-fg placeholder:text-fg-3"
        />
        <div className="absolute right-2 top-8">
          <MicButton size="sm" onText={(t) => setText((v) => appendText(v, t))} />
        </div>
      </div>
      {ai.busy ? (
        <AIBusy persona="both" status={ai.status} onCancel={ai.cancel} />
      ) : (
        <Button fullWidth variant={plan ? 'secondary' : 'primary'} disabled={text.trim().length < 8} icon={<Target className="h-5 w-5" />} onClick={async () => {
          const p = await ai.run((o) => interpretGoal(text, profile, current, o));
          if (!p) return;
          // con peso e % di grasso finali il percorso lo calcola il coach adattivo
          const t = targetFromPlan(p);
          set(t ? adapt({ ...p, target: undefined }, { weight: t.weight, bf: t.bf, date: t.date }) : p);
        }}>
          {plan ? 'Ricrea il piano' : 'Crea il mio piano'}
        </Button>
      )}
      {ai.error && <p className="text-sm text-danger" role="alert">{ai.error}</p>}

      {plan?.target && !ai.busy && (
        <div className="space-y-3">
          <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-3">
              Obiettivo finale <NewBadge since="2026-10-15" /> <HelpTip id="goal-coach" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-fg-3">
              <label>
                Peso (kg)
                <input key={`w${plan.createdAt}`} inputMode="decimal" aria-label="Obiettivo finale: peso" className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" defaultValue={plan.target.weight} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 35 && v < 250 && v !== plan.target!.weight) set(adapt(plan, { ...plan.target!, weight: v })); }} />
              </label>
              <label>
                Grasso (%)
                <input key={`b${plan.createdAt}`} inputMode="decimal" aria-label="Obiettivo finale: massa grassa" className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" defaultValue={plan.target.bf} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 3 && v < 45 && v !== plan.target!.bf) set(adapt(plan, { ...plan.target!, bf: v })); }} />
              </label>
              <label>
                Data desiderata
                <input type="date" aria-label="Obiettivo finale: data desiderata" className="mt-0.5 w-full rounded border border-line bg-surface px-1 py-1 text-sm text-fg" value={plan.target.date ?? ''} onChange={(e) => set({ ...plan, target: { ...plan.target!, date: e.target.value || undefined } })} />
              </label>
            </div>
            {cpNow ? (
              <div className="mt-3 space-y-2 text-sm text-fg-2">
                <p>🧑‍🏫 {whyNow(cpNow)}</p>
                <p>
                  📅 Arrivo stimato <strong className="text-fg">{etaText(cpNow)}</strong>
                  {plan.target.date && new Date(`${plan.target.date}T12:00:00`).getTime() < cpNow.early && (
                    <span className="block text-xs text-warning">La data che desideri è prima di quanto realistico con i tuoi dati di oggi.</span>
                  )}
                </p>
                <p className="text-xs text-fg-3">{whatISee(cpNow.response)}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-warning">Con questi numeri non trovo un percorso realistico in modo naturale (entro 5 anni): prova un peso o una % di grasso diversi.</p>
            )}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-fg-3">Percorso del coach (si aggiorna con i tuoi progressi, sempre con la tua conferma)</div>
          <ol className="relative space-y-2 border-l-2 border-violet-500/40 pl-4">
            {plan.phases.map((p, i) => (
              <li key={`${plan.createdAt}-${i}`} className="relative rounded-lg border border-line-subtle bg-surface-2 p-3 text-sm">
                <span className="absolute -left-[27px] top-3 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-xs">{i + 1}</span>
                <span className="font-display text-base font-extrabold text-fg">
                  {PHASE_EMOJI[p.type]} {p.label}
                </span>
                <span className="block text-xs text-fg-2">
                  Fino a circa {kg((p.weightMin + p.weightMax) / 2)} kg al {p.targetBf}% · {fmtDate(p.start)} → {fmtDate(p.end)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan && !plan.target && !ai.busy && (
        <div className="space-y-2">
          {plan.summary && <p className="text-sm text-fg-2">🧠 {plan.summary}</p>}
          <ol className="relative space-y-3 border-l-2 border-violet-500/40 pl-4">
            {plan.phases.map((p, i) => (
              <li key={`${plan.createdAt}-${i}`} className="relative rounded-lg border border-line-subtle bg-surface-2 p-3">
                <span className="absolute -left-[27px] top-3 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-xs">{i + 1}</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-extrabold text-fg">
                    {PHASE_EMOJI[p.type]} {p.label}
                  </span>
                  <span className="text-xs text-fg-3">{phaseName(p.type)}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-fg-3">
                  <label>
                    Peso min
                    <input inputMode="decimal" aria-label={`Fase ${i + 1}: peso minimo`} className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" defaultValue={p.weightMin} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 35) edit(i, { weightMin: v, weightMax: Math.max(v, p.weightMax) }); }} />
                  </label>
                  <label>
                    Peso max
                    <input inputMode="decimal" aria-label={`Fase ${i + 1}: peso massimo`} className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" defaultValue={p.weightMax} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 35) edit(i, { weightMax: v, weightMin: Math.min(v, p.weightMin) }); }} />
                  </label>
                  <label>
                    Massa grassa %
                    <input inputMode="decimal" aria-label={`Fase ${i + 1}: massa grassa`} className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" defaultValue={p.targetBf ?? ''} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); edit(i, { targetBf: v > 3 && v < 45 ? v : undefined }); }} />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-fg-3">
                  Scadenza (dal {fmtDate(p.start)})
                  <input type="date" aria-label={`Fase ${i + 1}: scadenza`} className="mt-0.5 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg" value={p.end} min={p.start} onChange={(e) => e.target.value > p.start && edit(i, { end: e.target.value })} />
                </label>
                <p className="mt-1 text-xs text-fg-2">
                  Da {kg(p.startWeight)} a {range(p)} kg{p.targetBf ? ` · ${p.targetBf}% di massa grassa` : ''} ·{' '}
                  {Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / (7 * 86400000))} settimane
                </p>
                {p.note && <p className="mt-1 text-xs text-warning">⚠️ {p.note}</p>}
              </li>
            ))}
          </ol>
          <GoalCheck profile={profile} current={current} plan={plan} onApply={set} />
        </div>
      )}
    </div>
  );
}

/** Finestra per creare o modificare l'obiettivo (dal Profilo, dal Coach o dalla Home). */
export function GoalPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const toast = useToast();
  const p = settings.profile;
  const [draft, setDraft] = useState<GoalPlan | null>(settings.goalPlan ?? null);
  if (!p) return null;
  const weight = trendWeight(bodyLogs, p.weightKg);
  const bf = bodyFatNow(bodyLogs)?.value ?? p.bodyFatPct;
  const save = async () => {
    if (!draft) return;
    await settle(update({ goalPlan: draft, profile: { ...p, goal: draft.phases[draft.current].type } }));
    toast.success('Obiettivo salvato: calorie e macro aggiornati');
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Il tuo obiettivo">
      <GoalPlanEditor key={String(open)} profile={p} current={{ weight, bf }} initial={settings.goalPlan} onChange={setDraft} />
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        {settings.goalPlan && (
          <Button variant="ghost" onClick={async () => {
            await settle(update({ goalPlan: null }));
            toast.success('Obiettivo rimosso');
            onClose();
          }}>
            Rimuovi
          </Button>
        )}
        <Button className={settings.goalPlan ? '' : 'col-span-2'} disabled={!draft} onClick={() => void save()}>
          Salva obiettivo
        </Button>
      </div>
    </Modal>
  );
}

/** Card dell'obiettivo: fase, scadenza, stato e azioni (passa alla fase dopo, sposta la data). */
export function GoalCard({ compact }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const p = settings.profile;
  const plan = settings.goalPlan;
  const st = useMemo(() => (plan && p ? planStatus(plan, bodyLogs, p.weightKg) : null), [plan, p, bodyLogs]);
  const foodLogs = useRecentFoodLogs(14);
  const { sessions, groupOf } = useSessions();
  const fc = useMemo(() => (st && st.state !== 'reached' ? forecast(bodyLogs, targetWeight(st.phase)) : null), [st, bodyLogs]);
  const lastScale = bodyLogs.find((b) => b.weight != null);
  // peso e massa grassa attuali per le calorie
  const eff = useEffectiveProfile();
  const water = useMemo(() => {
    if (!eff) return null;
    const ev = waterEvents(bodyLogs, foodLogs, sessions, userNutrition(eff, settings).target, groupOf).slice(-1)[0];
    return ev && Date.now() - new Date(`${ev.date}T12:00:00`).getTime() <= 4 * 86400000 ? ev : null;
  }, [eff, bodyLogs, foodLogs, sessions, settings, groupOf]);
  if (!p) return null;

  if (!plan || !st) {
    return (
      <>
        <Card interactive className="flex items-center gap-3 border-accent-500/40 p-4" onClick={() => setOpen(true)} role="button" aria-label="Imposta il tuo obiettivo">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-500 text-xl">🎯</span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg">Imposta il tuo obiettivo</span>
            <span className="block text-sm text-fg-2">Peso, massa grassa e scadenza: il coach adatta calorie e controlli</span>
          </span>
        </Card>
        <GoalPlanModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  const ph = st.phase;
  const next = plan.phases[plan.current + 1];
  // verifica del coach: il piano è raggiungibile con i tuoi dati?
  const verdict = planVerdict(checkPlan(p, currentComp(p, { weight: st.current, bf: st.bf }).comp, plan.phases, plan.current));
  // coach adattivo: c'è un obiettivo finale (peso e grasso), le fasi le ripianifica lui
  const adaptive = targetFromPlan(plan) != null;
  const recompBar = ph.type === 'maintain' && ph.targetBf != null && ph.startBf != null;
  const nut = userNutrition(eff ?? p, settings);
  const tone =
    st.state === 'reached' || st.state === 'on-track' || st.state === 'ahead' ? 'text-accent-400' : st.state === 'behind' ? 'text-warning' : 'text-danger';
  const dot = st.state === 'reached' ? '🏁' : st.state === 'on-track' ? '🟢' : st.state === 'ahead' ? '🔵' : st.state === 'behind' ? '🟡' : '🔴';

  const goNext = async () => {
    const today = toISODate(new Date());
    const phases = plan.phases.map((x, i) => (i === plan.current ? { ...x, doneAt: today } : x));
    if (!next) {
      await settle(update({ goalPlan: { ...plan, phases } }));
      toast.success('🏆 Obiettivo completato! Impostane uno nuovo quando vuoi');
      return;
    }
    // la fase successiva parte da oggi e dal peso attuale, mantenendo la sua durata
    const dur = new Date(next.end).getTime() - new Date(next.start).getTime();
    phases[plan.current + 1] = { ...next, start: today, end: toISODate(new Date(Date.now() + dur)), startWeight: st.current, ...(st.bf != null ? { startBf: st.bf } : {}) };
    const np = reflow({ ...plan, phases, current: plan.current + 1 });
    await settle(update({ goalPlan: np, profile: { ...p, goal: next.type }, kcalAdjust: 0 }));
    toast.success(`Si parte con la fase "${next.label}": calorie e macro aggiornati`);
  };
  const moveDate = async () => {
    if (!st.suggestedEnd) return;
    const phases = plan.phases.map((x, i) => (i === plan.current ? { ...x, end: st.suggestedEnd! } : x));
    await settle(update({ goalPlan: reflow({ ...plan, phases }) }));
    toast.success('Scadenza spostata: il piano resta sicuro');
  };

  return (
    <>
      <Card className="space-y-3 border-accent-500/30 p-4" style={{ background: 'linear-gradient(135deg, rgba(61,220,132,0.10), rgba(13,15,14,0.95))' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-3">
              <SectionTitle help="home-goal">
                Obiettivo · fase {plan.current + 1}/{plan.phases.length}
              </SectionTitle>
            </div>
            <div className="font-display text-lg font-extrabold text-fg">
              {PHASE_EMOJI[ph.type]} {ph.label}
            </div>
            <div className="text-sm text-fg-2">
              {range(ph)} kg{ph.targetBf ? ` · ${ph.targetBf}%` : ''} entro il {fmtDate(ph.end)}
            </div>
          </div>
          <button type="button" className="shrink-0 text-sm font-semibold text-accent-400" onClick={() => setOpen(true)}>
            Modifica
          </button>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-fg-3">
            {/* ricomposizione: si avanza sulla % di grasso, il peso resta lo stesso */}
            <span>{recompBar ? `${kg(ph.startBf!)}%` : `${kg(ph.startWeight)} kg`}</span>
            <span className="text-center">
              <span className="font-semibold text-fg">{kg(st.current)} kg reali</span>
              {lastScale?.weight != null && Math.abs(lastScale.weight - st.current) >= 0.2 && <span> (bilancia {kg(lastScale.weight)})</span>}
              {st.bf ? ` · ${kg(st.bf)}%` : ''}
            </span>
            <span>{recompBar ? `${ph.targetBf}%` : `${kg(targetWeight(ph))} kg`}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent-500 shadow-glow" style={{ width: `${Math.round(st.progress * 100)}%` }} />
          </div>
        </div>
        {/* coach adattivo: tempi e ritmo li dà la sezione del coach (data di arrivo stimata), non le scadenze delle fasi */}
        {(!adaptive || st.state === 'reached') && (
          <div className={cn('text-sm font-semibold', tone)}>
            {dot} {STATE_LABEL[st.state].charAt(0).toUpperCase() + STATE_LABEL[st.state].slice(1)}
            {st.state === 'ahead' || st.state === 'behind' ? ` di ${Math.abs(st.weeksOff)} sett.` : ''}
            {st.state !== 'reached' && st.state !== 'expired' ? ` · ${Math.round(st.weeksLeft)} settimane rimaste` : ''}
          </div>
        )}
        {adaptive && <CoachSection />}
        {!adaptive && verdict !== 'ok' && (
          <button type="button" onClick={() => setOpen(true)} className={cn('block w-full rounded-md px-3 py-2 text-left text-sm', verdict === 'no' ? 'bg-danger/10 text-fg' : 'bg-warning/10 text-fg')}>
            {verdict === 'no' ? '❌' : '🟡'} <strong>Il coach:</strong> {verdict === 'no' ? 'con i tuoi dati questo piano non è realistico nei tempi previsti.' : 'il piano è fattibile ma al limite.'}{' '}
            <span className="font-semibold text-accent-400">Vedi le alternative →</span> <NewBadge />
          </button>
        )}
        {fc && !adaptive && (
          <div className="text-sm text-fg-2">
            {fc.wrongWay ? (
              <>📉 Al ritmo delle ultime settimane ({fc.rate >= 0 ? '+' : ''}{fc.rate.toFixed(2).replace('.', ',')} kg/sett) non ti stai avvicinando all'obiettivo.</>
            ) : (
              <>
                🔮 Al ritmo attuale arrivi <strong className="text-fg">tra il {fmtShort(fc.early!)} e il {fmtShort(fc.late!)}</strong> <span className="text-fg-3">(80%)</span>
              </>
            )}
            <NewBadge />
          </div>
        )}
        {water && (
          <p className="border-l-2 border-sky-400 pl-2 text-xs text-fg-2">
            💧 +{kg(water.delta)} kg di acqua il {fmtShort(water.date)} ({water.reason}): rientra in 2–3 giorni. <NewBadge />
          </p>
        )}
        <GoalPhotoButton />
        {!compact && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Calorie', `${nut.target}`],
              ['Ritmo', `${st.rate >= 0 ? '+' : ''}${st.rate.toFixed(2).replace('.', ',')} kg/sett`],
              ['Proteine', `${nut.protein} g`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md bg-surface-2 py-1.5">
                <div className="text-sm font-bold text-fg">{v}</div>
                <div className="text-[10px] uppercase text-fg-3">{l}</div>
              </div>
            ))}
          </div>
        )}
        {st.bfOver && (
          <p className="rounded-md bg-warning-bg p-2 text-sm text-fg-2">
            ⚠️ Massa grassa {kg(st.bf ?? 0)}%, sopra il tetto del {ph.targetBf}% che hai indicato per questa fase: valuta con il coach se anticipare il cut o rallentare il surplus.
          </p>
        )}
        {(st.state === 'reached' || (st.state === 'expired' && !adaptive)) && (
          <Button fullWidth onClick={() => void goNext()}>
            {next ? `Passa alla fase "${next.label}" ${PHASE_EMOJI[next.type]}` : 'Segna obiettivo come completato 🏆'}
          </Button>
        )}
        {!adaptive && st.state === 'late' && st.suggestedEnd && (
          <div className="rounded-md bg-danger-bg p-2 text-sm text-fg-2">
            Con un ritmo sicuro arrivi il <strong className="text-fg">{fmtDate(st.suggestedEnd)}</strong>. Intanto le calorie sono già al massimo sicuro.
            <Button size="sm" className="mt-2" fullWidth variant="secondary" onClick={() => void moveDate()}>
              Sposta la scadenza
            </Button>
          </div>
        )}
        {next && st.state !== 'reached' && (adaptive || st.state !== 'expired') && (
          <p className="text-xs text-fg-3">
            Poi: {PHASE_EMOJI[next.type]} {next.label} fino a {range(next)} kg{next.targetBf ? ` · ${next.targetBf}%` : ''} ({fmtDate(next.end)})
          </p>
        )}
        {!compact && (
          <button type="button" className="text-xs font-semibold text-violet-400" onClick={() => navigate('/body?tab=weight')}>
            Vedi il percorso nel grafico del peso →
          </button>
        )}
      </Card>
      <GoalPlanModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
