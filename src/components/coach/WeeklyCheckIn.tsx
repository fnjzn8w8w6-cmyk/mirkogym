import { useEffect, useMemo, useRef, useState } from 'react';
import { HUNGER_WORDS, LevelScale } from '@/components/ui/LevelScale';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useSessions } from '@/hooks/use-sessions';
import { useAthlete, useRecentFoodLogs } from '@/hooks/use-athlete';
import { usePhotos } from '@/hooks/use-photos';
import { useCyclingDays, useLearnedFavorites, useProposals } from '@/hooks/use-habits';
import { useSchedule } from '@/hooks/use-schedule';
import { weekTargets } from '@/lib/habits';
import { NewBadge, SectionTitle } from '@/components/ui/Help';
import { analyzeWeekPhoto, compressPhoto, thumbOf, type WeekPhotoResult } from '@/lib/progress-photos';
import { toISODate } from '@/lib/date-utils';
import { estimateTdee, planRate, planStatus } from '@/lib/goal-plan';
import { userNutrition } from '@/lib/coach';
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
import { MicButton, appendText } from '@/components/ui/MicButton';
import { formatTonnage } from '@/lib/analytics';
import type { UserProfile } from '@/lib/metabolism';
import { checkInDue, checkInSummary, evaluate, weekStats, type CheckIn, type CheckInAnswers } from '@/lib/checkin';
import { loadRecipes, rescalePlan, setCustomMeal, type WeekPlan } from '@/lib/recipes';
import { DEFAULT_NUTRITION, planPrefs } from '@/components/food/NutritionPlanner';

const QUESTIONS: { key: keyof Omit<CheckInAnswers, 'note'>; label: string; scale: string[] }[] = [
  { key: 'energy', label: 'Energia durante la settimana', scale: ['A terra', 'Bassa', 'Normale', 'Alta', 'Al top'] },
  { key: 'sleep', label: 'Qualità del sonno', scale: ['Pessima', 'Scarsa', 'Normale', 'Buona', 'Ottima'] },
  { key: 'stress', label: 'Stress (lavoro, studio, vita)', scale: ['Nessuno', 'Poco', 'Normale', 'Alto', 'Altissimo'] },
  { key: 'soreness', label: 'Dolori muscolari / articolari', scale: ['Nessuno', 'Lievi', 'Medi', 'Forti', 'Intensi'] },
  { key: 'hunger', label: 'Fame durante il giorno', scale: HUNGER_WORDS },
  { key: 'adherence', label: 'Quanto hai rispettato calorie e macro?', scale: ['0–20%', '40%', '60%', '80%', '100%'] },
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
  const cyclingDays = useCyclingDays();
  const { settings, update } = useSettings();
  const { sessions } = useSessions();
  const athlete = useAthlete();
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
    // aperto dal link (Home, Corpo): si apre sempre, anche se il check-in non è ancora "dovuto"
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const foodLogs = useRecentFoodLogs(28);
  const stats = useMemo(() => {
    const plan = settings.goalPlan;
    const st = plan ? planStatus(plan, bodyLogs, profile.weightKg) : null;
    const rate = plan ? planRate(plan, bodyLogs, profile.weightKg) : null;
    const est = estimateTdee(foodLogs, bodyLogs);
    const current = userNutrition(profile, settings).target;
    const desired = est ? est.tdee + (rate ?? 0) * 1100 + 0 : 0;
    let goalLine: string | undefined;
    if (st) {
      const kg = (v: number) => v.toFixed(1).replace('.', ',');
      goalLine =
        st.state === 'reached'
          ? `🏁 Obiettivo della fase "${st.phase.label}" raggiunto (${kg(st.current)} kg)! Dalla Home puoi passare alla fase successiva.`
          : st.state === 'late'
            ? `⚠️ ${st.phase.label}: con un ritmo sicuro arrivi a ${kg((st.phase.weightMin + st.phase.weightMax) / 2)} kg il ${new Date(st.suggestedEnd!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}. Correggo le calorie al massimo sicuro e ti propongo di spostare la scadenza.`
            : `🎯 ${st.phase.label}: peso di tendenza ${kg(st.current)} kg, previsto oggi ${kg(st.expectedToday)} kg → ${st.state === 'on-track' ? 'in linea' : st.state === 'ahead' ? `in anticipo di ${Math.abs(st.weeksOff)} sett.` : st.state === 'behind' ? `in ritardo di ${Math.abs(st.weeksOff)} sett.` : 'scadenza superata'}. Mancano ${Math.round(st.weeksLeft)} settimane.`;
    }
    return weekStats(sessions, bodyLogs, profile, Date.now(), {
      expectedRate: rate,
      diary: est && !settings.metabolism ? { ...est, desired, current } : null,
      goalLine,
      metabolism: settings.metabolism?.tdee ?? null,
    });
  }, [sessions, bodyLogs, profile, settings, foodLogs]);
  const deloadAvailable = Boolean(meso.mesocycle) && !meso.isDeloadWeek;
  const result = useMemo(() => evaluate(answers, stats, deloadAvailable), [answers, stats, deloadAvailable]);

  const photosApi = usePhotos();
  const proposals = useProposals();
  const learned = useLearnedFavorites();
  const { days, save: saveSchedule } = useSchedule();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const { save: saveBody } = useBodyLogs();
  const [front, setFront] = useState<string | null>(null);
  const [side, setSide] = useState<string | null>(null);
  const [photoRes, setPhotoRes] = useState<WeekPhotoResult | null>(null);

  // Giorni in obiettivo negli ultimi 7 giorni, dal diario (conta il rispetto di calorie e macro, non del piano)
  const diaryAdherence = useMemo(() => {
    const t = userNutrition(profile, settings);
    const from = toISODate(new Date(Date.now() - 7 * 86400000));
    const days = foodLogs.filter((l) => l.date >= from && l.entries.length && l.recap?.complete !== false);
    if (days.length < 3) return null;
    const ok = days.filter((l) => {
      const m = l.entries.reduce(
        (a, e) => {
          const k = e.unit === 'g' ? e.qty / 100 : e.qty;
          return { kcal: a.kcal + e.per.kcal * k, protein: a.protein + e.per.protein * k };
        },
        { kcal: 0, protein: 0 },
      );
      return Math.abs(m.kcal - t.target) <= t.target * 0.1 && m.protein >= t.protein * 0.85;
    }).length;
    const ratio = ok / days.length;
    return { ok, days: days.length, value: ratio >= 0.85 ? 5 : ratio >= 0.65 ? 4 : ratio >= 0.45 ? 3 : ratio >= 0.25 ? 2 : 1 };
  }, [foodLogs, profile, settings]);

  // precompila anche quando il check-in si apre da un link o il diario arriva dopo l'apertura
  const touched = useRef(false);
  useEffect(() => {
    if (open && step === 'ask' && diaryAdherence && !touched.current) setAnswers((a) => ({ ...a, adherence: diaryAdherence.value }));
  }, [open, step, diaryAdherence]);

  const start = () => {
    touched.current = false;
    setStep('ask');
    setSummary(null);
    setAnswers(diaryAdherence ? { ...DEFAULT_ANSWERS, adherence: diaryAdherence.value } : DEFAULT_ANSWERS);
    setFront(null);
    setSide(null);
    setPhotoRes(null);
    setOpen(true);
  };

  const analyze = async () => {
    setStep('result');
    setApplyKcal(result.kcalChange !== 0);
    setApplyDeload(result.deload);
    let photoNote = '';
    if (front) {
      const today = toISODate(new Date());
      const prevMeta = photosApi.photos.find((x) => x.date < today);
      const prevImg = prevMeta ? await photosApi.images(prevMeta.date).catch(() => null) : null;
      const weight = bodyLogs.find((b) => b.weight != null)?.weight ?? profile.weightKg;
      const phase = settings.goalPlan?.phases[settings.goalPlan.current];
      const pr = await ai.run((o) =>
        analyzeWeekPhoto(
          { front, side: side ?? undefined },
          prevImg && prevMeta ? { front: prevImg.front, date: prevMeta.date, bodyFat: prevMeta.bodyFat } : null,
          { sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: weight, goal: phase ? `${phase.label} (${phase.type})` : profile.goal },
          o,
        ),
      );
      // la foto si salva comunque, anche se la stima non è riuscita
      await photosApi.save(
        { date: today, thumb: await thumbOf(front), weight, ...(pr ? { bodyFat: pr.bodyFat, low: pr.low, high: pr.high, comment: pr.comment, ...(pr.regions ? { regions: pr.regions } : {}) } : {}), hasSide: Boolean(side), createdAt: Date.now() },
        { front, ...(side ? { side } : {}) },
      );
      if (pr) {
        setPhotoRes(pr);
        const todayLog = bodyLogs.find((b) => b.date === today);
        await settle(saveBody(todayLog ? { ...todayLog, bodyFat: pr.bodyFat, bodyFatSource: 'photo' } : { date: today, bodyFat: pr.bodyFat, bodyFatSource: 'photo', notes: 'Massa grassa: stima AI dalla foto del check-in' }));
        photoNote = `\nFOTO DI QUESTA SETTIMANA: massa grassa stimata ${pr.bodyFat}% (forbice ${pr.low}-${pr.high}%). Osservazioni: ${pr.comment}`;
      }
    }
    const text = await ai.run((o) => checkInSummary(answers, stats, result, profile, o, athlete.text + photoNote));
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
      summary: summary ?? [...result.points, ...athlete.report.insights.map((i) => i.text)].join(' '),
    };
    const newAdjust = Math.max(-600, Math.min(600, (settings.kcalAdjust ?? 0) + kcalChange));
    const patch: Parameters<typeof update>[0] = { checkIns: [entry, ...history].slice(0, 12) };
    if (kcalChange !== 0) {
      patch.kcalAdjust = newAdjust;
      // il piano pasti segue il nuovo obiettivo (stesse ricette, porzioni ricalcolate)
      if (settings.weekPlan && settings.weekPlan.source !== 'nutrizionista') {
        try {
          const data = await loadRecipes();
          const t = userNutrition(profile, { ...settings, kcalAdjust: newAdjust });
          patch.weekPlan = rescalePlan(
            settings.weekPlan,
            data,
            t,
            planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, settings.favoriteRecipes ?? []),
            cyclingDays ? weekTargets(t, cyclingDays) : undefined,
          );
        } catch {
          /* il piano verrà ricalibrato dalla sezione Dieta */
        }
      }
    }
    // Proposte accettate (niente cambia senza conferma)
    const accepted = proposals.filter((p) => picked[p.id]);
    if (accepted.length) {
      const target = userNutrition(profile, { ...settings, ...patch });
      const pp = planPrefs(settings.nutritionPrefs ?? DEFAULT_NUTRITION, [...(settings.favoriteRecipes ?? []), ...learned.map((l) => l.id)]);
      let plan: WeekPlan | undefined = patch.weekPlan ?? settings.weekPlan ?? undefined;
      let cycling = cyclingDays;
      let schedule = days;
      for (const pr of accepted) {
        if (pr.kind === 'meso') schedule = pr.days;
        if (pr.kind === 'reorder') {
          const moved = schedule.find((d) => d.id === pr.dayId);
          if (moved) schedule = [moved, ...schedule.filter((d) => d.id !== pr.dayId)].map((d, i) => ({ ...d, order: i + 1 }));
        }
        if (pr.kind === 'cycling') cycling = pr.weekdays;
      }
      if (plan && plan.source !== 'nutrizionista') {
        try {
          const data = await loadRecipes();
          for (const pr of accepted)
            if (pr.kind === 'cheat' && plan) plan = setCustomMeal(plan, pr.weekday, 'cena', 'Pasto libero (sgarro pianificato)', { kcal: 900, protein: 35, carbs: 100, fat: 38 }, data, target, pp);
          if (plan && accepted.some((p) => p.kind === 'cycling')) plan = rescalePlan(plan, data, target, pp, weekTargets(target, cycling));
          patch.weekPlan = plan;
        } catch {
          /* il piano verrà aggiornato dalla sezione Dieta */
        }
      }
      if (cycling !== cyclingDays) patch.carbCycling = cycling;
      if (schedule !== days) await settle(saveSchedule(schedule));
    }
    await settle(update(patch));
    if (deload) await settle(meso.forceDeload());
    setSaving(false);
    setOpen(false);
    toast.success(kcalChange || deload || accepted.length ? 'Check-in salvato e piano aggiornato' : 'Check-in salvato');
  };

  const last = history[0];

  return (
    <>
      <Card className={cn('p-4', due && 'border-accent-500/50')}>
        <div className="flex items-center gap-2 text-base font-semibold text-fg">
          <ClipboardCheck className="h-5 w-5 text-accent-500" aria-hidden /> <SectionTitle help="coach-checkin">Check-in settimanale</SectionTitle>
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
                {q.key !== 'adherence' ? (
                  <LevelScale label={q.label} value={answers[q.key]} words={q.scale} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
                ) : (
                  <Scale label={q.label} value={answers[q.key]} options={q.scale} onChange={(v) => {
                    if (q.key === 'adherence') touched.current = true;
                    setAnswers({ ...answers, [q.key]: v });
                  }} />
                )}
                {q.key === 'adherence' && diaryAdherence && (
                  <p className="mt-1 text-xs text-fg-3">
                    Precompilato dal diario: {diaryAdherence.ok} giorni su {diaryAdherence.days} in obiettivo (calorie ±10%, proteine). Puoi correggerlo. <NewBadge />
                  </p>
                )}
              </div>
            ))}
            <div className="relative [&_textarea]:pr-14">
              <TextArea
                label="Qualcosa da dire al coach? (facoltativo)"
                rows={2}
                value={answers.note ?? ''}
                onChange={(e) => setAnswers({ ...answers, note: e.target.value })}
              />
              <MicButton size="sm" className="absolute right-2 top-2" onText={(t) => setAnswers((a) => ({ ...a, note: appendText(a.note ?? '', t) }))} />
            </div>
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
              <div className="text-base font-semibold text-fg">📸 Foto della settimana</div>
              <p className="mt-0.5 text-xs text-fg-2">
                Per confrontarle bene: stesso posto e stessa luce, al mattino a digiuno, busto scoperto, braccia rilassate. Restano solo nel tuo account.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PhotoPick label="Fronte" value={front} onChange={setFront} />
                <PhotoPick label="Profilo (facoltativa)" value={side} onChange={setSide} />
              </div>
            </div>
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
                  style={{ width: `${result.fatigue}%`, backgroundColor: result.fatigue >= 70 ? '#EF4444' : result.fatigue >= 55 ? '#EAB308' : '#3DDC84' }}
                />
              </div>
            </div>

            {photoRes && (
              <div className="flex gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
                {front && <img src={front} alt="Foto della settimana" className="h-24 w-18 shrink-0 rounded-md object-cover" style={{ width: 72 }} />}
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-fg">
                    📸 Massa grassa stimata: <span className="font-display text-accent-400">{String(photoRes.bodyFat).replace('.', ',')}%</span>{' '}
                    <span className="text-xs text-fg-3">
                      ({photoRes.low}–{photoRes.high}%)
                    </span>
                  </div>
                  <p className="mt-1 text-fg-2">{photoRes.comment}</p>
                </div>
              </div>
            )}
            {ai.busy ? (
              <AIBusy persona={front && !photoRes ? 'photo' : 'both'} status={ai.status} onCancel={ai.cancel} />
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

            {athlete.report.insights.length > 0 && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
                <div className="section-title !mb-1">Dal tuo storico</div>
                <ul className="space-y-1.5">
                  {athlete.report.insights.map((i) => (
                    <li key={i.text} className="text-sm text-fg-2">
                      {i.emoji} {i.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(result.kcalChange !== 0 || result.deload) && (
              <div className="space-y-2 rounded-lg bg-surface-2 p-3">
                <div className="section-title !mb-1">Modifiche consigliate</div>
                {result.kcalChange !== 0 && (
                  <label className="flex items-center gap-3 text-base text-fg">
                    <input type="checkbox" className="h-5 w-5 accent-[#3DDC84]" checked={applyKcal} onChange={(e) => setApplyKcal(e.target.checked)} />
                    Calorie {result.kcalChange > 0 ? '+' : ''}
                    {result.kcalChange} kcal/giorno{settings.weekPlan ? ' (porzioni del piano ricalcolate)' : ''}
                  </label>
                )}
                {result.deload && (
                  <label className="flex items-center gap-3 text-base text-fg">
                    <input type="checkbox" className="h-5 w-5 accent-[#3DDC84]" checked={applyDeload} onChange={(e) => setApplyDeload(e.target.checked)} />
                    Settimana di scarico (carichi −{settings.deloadPercentage}%)
                  </label>
                )}
              </div>
            )}
            {proposals.length > 0 && (
              <div className="space-y-2">
                <div className="section-title !mb-0">
                  <SectionTitle help="coach-proposals" isNew>
                    Proposte per la prossima settimana
                  </SectionTitle>
                </div>
                {proposals.map((pr) => (
                  <label key={pr.id} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', picked[pr.id] ? 'border-accent-500 bg-accent-glow' : 'border-line-subtle bg-surface-2')}>
                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#3DDC84]" checked={Boolean(picked[pr.id])} onChange={(e) => setPicked((x) => ({ ...x, [pr.id]: e.target.checked }))} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">
                        {pr.emoji} {pr.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-2">{pr.detail}</span>
                    </span>
                  </label>
                ))}
                <p className="text-xs text-fg-3">Si applicano solo quelle che selezioni, quando salvi il check-in.</p>
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

/** Scelta di una foto (fotocamera o galleria), compressa subito sul telefono. */
function PhotoPick({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        data-testid={`photo-${label}`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onChange(await compressPhoto(f).catch(() => null));
        }}
      />
      <button
        type="button"
        onClick={() => (value ? onChange(null) : ref.current?.click())}
        className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-2 text-sm text-fg-3"
      >
        {value ? <img src={value} alt={label} className="h-full w-full object-cover" /> : <span className="px-2 text-center">📷 {label}</span>}
        {value && <span className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white">✕</span>}
      </button>
    </div>
  );
}
