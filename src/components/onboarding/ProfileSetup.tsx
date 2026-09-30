import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Check, ChevronLeft, Flame, Info, Sparkles } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { parseNum } from '@/hooks/use-active-session';
import { settle } from '@/lib/firestore';
import { LANGUAGES, type Lang } from '@/lib/exercise-i18n';
import {
  ACTIVITY,
  EXPERIENCE,
  GOALS,
  bfCategory,
  bmiCategory,
  composition,
  nutrition,
  type Equipment,
  type Experience,
  type Goal,
  type Sex,
  type UserProfile,
} from '@/lib/metabolism';
import { generateProgram, weeklySetsFor } from '@/lib/program-generator';
import { type Template } from '@/lib/templates';
import { todayISO } from '@/lib/date-utils';
import { formatKg, groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TemplatePicker } from './TemplatePicker';
import { BodyFatPhotoModal } from '../modals/BodyFatPhotoModal';
import { BF_METHOD_LABEL } from '@/lib/metabolism';

type Step = 'lang' | 'body' | 'activity' | 'experience' | 'goal' | 'availability' | 'results' | 'program';
const STEPS: Step[] = ['lang', 'body', 'activity', 'experience', 'goal', 'availability', 'results', 'program'];

const EQUIPMENT: { value: Equipment; label: string; description: string; emoji: string }[] = [
  { value: 'gym', label: 'Palestra completa', description: 'Bilancieri, macchine e cavi', emoji: '🏟️' },
  { value: 'dumbbells', label: 'Manubri e panca', description: 'Allenamento a casa con manubri', emoji: '🏠' },
  { value: 'bodyweight', label: 'Corpo libero', description: 'Nessun attrezzo (o quasi)', emoji: '🤸' },
];

/** Questionario iniziale: lingua, dati fisici, attività, esperienza, obiettivo → analisi e scheda su misura. */
export function ProfileSetup() {
  const { settings, update } = useSettings();
  const { save, days: currentDays } = useSchedule();
  const { sessions } = useSessions();
  const { save: saveBodyLog } = useBodyLogs();
  const prev = settings.profile;

  const [step, setStep] = useState<Step>('lang');
  const [lang, setLang] = useState<Lang>(settings.language ?? 'it');
  const [sex, setSex] = useState<Sex | null>(prev?.sex ?? null);
  const [age, setAge] = useState(prev ? String(prev.age) : '');
  const [height, setHeight] = useState(prev ? String(prev.heightCm) : '');
  const [weight, setWeight] = useState(prev ? String(prev.weightKg).replace('.', ',') : '');
  const [activity, setActivity] = useState<UserProfile['activity'] | null>(prev?.activity ?? null);
  const [experience, setExperience] = useState<Experience | null>(prev?.experience ?? null);
  const [goal, setGoal] = useState<Goal | null>(prev?.goal ?? null);
  const [days, setDays] = useState(prev?.daysPerWeek ?? 4);
  const [equipment, setEquipment] = useState<Equipment>(prev?.equipment ?? 'gym');
  const [waist, setWaist] = useState(prev?.waistCm ? String(prev.waistCm) : '');
  const [neck, setNeck] = useState(prev?.neckCm ? String(prev.neckCm) : '');
  const [hip, setHip] = useState(prev?.hipCm ? String(prev.hipCm) : '');
  const [programChoice, setProgramChoice] = useState<'generated' | 'template' | 'keep'>('generated');
  const [template, setTemplate] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [bfKnown, setBfKnown] = useState(prev?.bodyFatPct != null ? String(prev.bodyFatPct).replace('.', ',') : '');
  const [bfSource, setBfSource] = useState<'manual' | 'photo' | undefined>(prev?.bodyFatSource);
  const [photoOpen, setPhotoOpen] = useState(false);

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  const a = parseNum(age);
  const h = parseNum(height);
  const w = parseNum(weight);
  const bodyValid = sex != null && a != null && a >= 14 && a <= 90 && h != null && h >= 130 && h <= 230 && w != null && w >= 35 && w <= 250;

  const profile: UserProfile | null =
    bodyValid && activity && experience && goal
      ? {
          sex: sex as Sex,
          age: a as number,
          heightCm: h as number,
          weightKg: w as number,
          activity,
          experience,
          goal,
          daysPerWeek: days,
          equipment,
          waistCm: parseNum(waist) ?? undefined,
          neckCm: parseNum(neck) ?? undefined,
          hipCm: parseNum(hip) ?? undefined,
          bodyFatPct: parseNum(bfKnown) ?? undefined,
          bodyFatSource: parseNum(bfKnown) != null ? (bfSource ?? 'manual') : undefined,
        }
      : null;

  const analysis = useMemo(() => (profile ? { n: nutrition(profile), c: composition(profile) } : null), [profile]);
  const generated = useMemo(() => (profile ? generateProgram(profile) : []), [profile]);
  const hasHistory = sessions.length > 0;

  const canNext: Record<Step, boolean> = {
    lang: true,
    body: bodyValid,
    activity: activity != null,
    experience: experience != null,
    goal: goal != null,
    availability: true,
    results: true,
    program: programChoice !== 'template' || template != null,
  };

  const finish = async () => {
    if (!profile || !analysis) return;
    setBusy(true);
    const ws = weeklySetsFor(profile.experience);
    if (programChoice === 'generated') await settle(save(generated));
    else if (programChoice === 'template' && template) await settle(save(template.days()));
    await settle(
      saveBodyLog({
        date: todayISO(),
        weight: profile.weightKg,
        bodyFat: analysis.c.bf.value,
        notes: `Massa grassa: ${BF_METHOD_LABEL[analysis.c.bf.method]}`,
        circumferences: profile.waistCm ? { waist: profile.waistCm } : undefined,
      }),
    );
    await settle(
      update({
        language: lang,
        profile,
        profileCompleted: true,
        weeklySetsMin: ws.min,
        weeklySetsMax: ws.max,
        // I carichi di partenza vanno proposti solo con una scheda nuova
        startingLoadsPrompted: programChoice === 'keep' || hasHistory,
      }),
    );
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
    >
      {/* progresso */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          disabled={idx === 0}
          aria-label="Indietro"
          className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 disabled:opacity-0"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="flex flex-1 gap-1" aria-label={`Passo ${idx + 1} di ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-accent-500' : 'bg-surface-3')} />
          ))}
        </div>
        <span className="w-11 text-right text-sm text-fg-3">
          {idx + 1}/{STEPS.length}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}
          className="flex-1 pb-4 pt-4"
        >
          {step === 'lang' && (
            <>
              <Title title="Scegli la lingua" subtitle="Lingua delle spiegazioni degli esercizi" />
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((l) => (
                  <Option key={l.value} active={lang === l.value} onClick={() => setLang(l.value)} emoji={l.flag} label={l.label} />
                ))}
              </div>
              {lang !== 'it' && lang !== 'en' && (
                <p className="mt-3 flex gap-2 text-sm text-fg-3">
                  <Info className="h-4 w-4 shrink-0" aria-hidden /> Le istruzioni verranno tradotte automaticamente alla prima apertura di ogni esercizio.
                </p>
              )}
            </>
          )}

          {step === 'body' && (
            <>
              <Title title="Parlaci di te" subtitle="Servono per stimare metabolismo e composizione corporea" />
              <div className="grid grid-cols-2 gap-2">
                <Option active={sex === 'm'} onClick={() => setSex('m')} emoji="♂️" label="Uomo" />
                <Option active={sex === 'f'} onClick={() => setSex('f')} emoji="♀️" label="Donna" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Input label="Età" kind="number" suffix="anni" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
                <Input label="Altezza" kind="number" suffix="cm" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} />
                <Input label="Peso" kind="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </>
          )}

          {step === 'activity' && (
            <>
              <Title title="Quanto sei attivo durante la giornata?" subtitle="Escludi gli allenamenti: conta lavoro, passi e movimento quotidiano" />
              <div className="space-y-2">
                {ACTIVITY.map((o) => (
                  <Option key={o.value} active={activity === o.value} onClick={() => setActivity(o.value)} label={o.label} description={o.description} emoji={['🪑', '🚶', '🚴', '🏃', '⛏️'][o.value - 1]} />
                ))}
              </div>
            </>
          )}

          {step === 'experience' && (
            <>
              <Title title="Qual è il tuo livello?" subtitle="Determina volume, intensità e carichi di partenza" />
              <div className="space-y-2">
                {EXPERIENCE.map((o, i) => (
                  <Option key={o.value} active={experience === o.value} onClick={() => setExperience(o.value)} label={o.label} description={o.description} emoji={['🌱', '💪', '🦾'][i]} />
                ))}
              </div>
            </>
          )}

          {step === 'goal' && (
            <>
              <Title title="Qual è il tuo obiettivo?" subtitle="Adattiamo esercizi, serie, ripetizioni e recuperi" />
              <div className="space-y-2">
                {GOALS.map((o) => (
                  <Option key={o.value} active={goal === o.value} onClick={() => setGoal(o.value)} label={o.label} description={o.description} emoji={o.emoji} />
                ))}
              </div>
            </>
          )}

          {step === 'availability' && (
            <>
              <Title title="Quando e dove ti alleni?" />
              <div className="section-title">Giorni a settimana</div>
              <div className="grid grid-cols-5 gap-2">
                {[2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days === d}
                    onClick={() => setDays(d)}
                    className={cn('h-14 rounded-md border text-xl font-bold', days === d ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2')}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="section-title mt-5">Attrezzatura</div>
              <div className="space-y-2">
                {EQUIPMENT.map((o) => (
                  <Option key={o.value} active={equipment === o.value} onClick={() => setEquipment(o.value)} label={o.label} description={o.description} emoji={o.emoji} />
                ))}
              </div>
              <div className="section-title mt-5">Circonferenze (opzionali, per una stima più precisa)</div>
              <div className={cn('grid gap-2', sex === 'f' ? 'grid-cols-3' : 'grid-cols-2')}>
                <Input label="Vita (ombelico)" kind="decimal" suffix="cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
                <Input label="Collo" kind="decimal" suffix="cm" value={neck} onChange={(e) => setNeck(e.target.value)} />
                {sex === 'f' && <Input label="Fianchi" kind="decimal" suffix="cm" value={hip} onChange={(e) => setHip(e.target.value)} />}
              </div>
            </>
          )}

          {step === 'results' && profile && analysis && (
            <>
              <Title title="La tua analisi" subtitle="Stime indicative basate su formule validate" />
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm text-fg-3">
                  <Flame className="h-4 w-4 text-accent-500" aria-hidden /> Fabbisogno calorico
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Metab. basale" value={`${analysis.n.bmr}`} unit="kcal" />
                  <Metric label="Consumo totale" value={`${analysis.n.tdee}`} unit="kcal" />
                  <Metric label={`Obiettivo`} value={`${analysis.n.target}`} unit="kcal" highlight />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Proteine" value={`${analysis.n.protein}`} unit="g" />
                  <Metric label="Carboidrati" value={`${analysis.n.carbs}`} unit="g" />
                  <Metric label="Grassi" value={`${analysis.n.fat}`} unit="g" />
                </div>
              </div>
              <div className="card mt-3 p-4">
                <div className="text-sm text-fg-3">Composizione corporea stimata</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Massa grassa" value={formatKg(analysis.c.bf.value)} unit="%" highlight />
                  <Metric label="Massa magra" value={formatKg(analysis.c.lean)} unit="kg" />
                  <Metric label="BMI" value={formatKg(analysis.c.bmi)} unit="" />
                </div>
                <p className="mt-3 text-sm text-fg-2">
                  {bfCategory(analysis.c.bf.value, profile.sex)} · {bmiCategory(analysis.c.bmi)} · FFMI {formatKg(analysis.c.ffmi)}
                </p>
                <p className="mt-2 text-xs text-fg-3">
                  Massa grassa: {BF_METHOD_LABEL[analysis.c.bf.method]}. Metabolismo: Mifflin-St Jeor. Non sostituisce il parere di un professionista.
                </p>
              </div>
              <div className="card mt-3 p-4">
                <div className="text-base font-semibold text-fg">La massa grassa non ti torna?</div>
                <p className="mt-1 text-sm text-fg-3">Inserisci un valore misurato (plicometria, bioimpedenza, DEXA) o fatti stimare da una foto.</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    label="Massa grassa nota"
                    kind="decimal"
                    suffix="%"
                    value={bfKnown}
                    onChange={(e) => {
                      setBfKnown(e.target.value);
                      setBfSource('manual');
                    }}
                  />
                  <Button variant="secondary" className="h-14" icon={<Camera className="h-5 w-5" />} onClick={() => setPhotoOpen(true)}>
                    Da foto
                  </Button>
                </div>
              </div>
              <BodyFatPhotoModal
                open={photoOpen}
                onClose={() => setPhotoOpen(false)}
                subject={profile}
                onUse={(bf) => {
                  setBfKnown(String(bf).replace('.', ','));
                  setBfSource('photo');
                  setPhotoOpen(false);
                }}
              />
            </>
          )}

          {step === 'program' && profile && (
            <>
              <Title title="La tua scheda" subtitle={`${GOALS.find((g) => g.value === profile.goal)?.label} · ${EXPERIENCE.find((x) => x.value === profile.experience)?.label} · ${profile.daysPerWeek} giorni`} />
              <div className="space-y-2">
                <Option
                  active={programChoice === 'generated'}
                  onClick={() => setProgramChoice('generated')}
                  emoji="✨"
                  label="Scheda su misura (consigliata)"
                  description="Creata per il tuo obiettivo, livello e attrezzatura, con carichi di partenza indicativi"
                />
                {programChoice === 'generated' && (
                  <div className="card space-y-3 p-3">
                    {generated.map((d) => (
                      <div key={d.id}>
                        <div className="text-sm font-semibold text-fg">
                          {d.name} · {d.subtitle}
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {d.exercises.map((e) => (
                            <li key={e.id} className="flex items-center gap-2 text-sm text-fg-2">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: groupColor(e.group) }} aria-hidden />
                              <span className="flex-1 truncate">{e.name}</span>
                              <span className="shrink-0 text-fg-3">
                                {e.sets}×{e.repMin}-{e.repMax}
                                {e.startWeight ? ` · ~${formatKg(e.startWeight, 2)}kg` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                <Option active={programChoice === 'template'} onClick={() => setProgramChoice('template')} emoji="📋" label="Scegli un modello" description="Mirko, Full Body, Upper/Lower, PPL o da zero" />
                {programChoice === 'template' && <TemplatePicker value={template?.id ?? null} onChange={setTemplate} />}
                {(hasHistory || currentDays.length > 0) && (
                  <Option active={programChoice === 'keep'} onClick={() => setProgramChoice('keep')} emoji="📌" label="Tieni la scheda attuale" description="Aggiorna solo profilo e obiettivi" />
                )}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-0 bg-base pt-2">
        {step === 'program' ? (
          <Button size="lg" fullWidth loading={busy} disabled={!canNext.program} icon={<Sparkles className="h-5 w-5" />} onClick={finish}>
            Inizia ad allenarti
          </Button>
        ) : (
          <Button size="lg" fullWidth disabled={!canNext[step]} onClick={next}>
            {step === 'availability' ? 'Calcola la mia analisi' : 'Continua'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl text-fg">{title}</h1>
      {subtitle && <p className="mt-1 text-base text-fg-2">{subtitle}</p>}
    </div>
  );
}

function Option({ active, onClick, label, description, emoji }: { active: boolean; onClick: () => void; label: string; description?: string; emoji?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[60px] w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-accent-500 bg-accent-glow' : 'border-line-subtle bg-surface hover:border-line-strong',
      )}
    >
      {emoji && (
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-fg">{label}</span>
        {description && <span className="block text-sm text-fg-3">{description}</span>}
      </span>
      {active && <Check className="h-5 w-5 shrink-0 text-accent-500" aria-hidden />}
    </button>
  );
}

function Metric({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-md py-2', highlight ? 'bg-accent-glow' : 'bg-surface-2')}>
      <div className={cn('text-xl', highlight ? 'text-accent-400' : 'text-fg')}>
        {value}
        <span className="text-xs text-fg-3"> {unit}</span>
      </div>
      <div className="text-xs text-fg-3">{label}</div>
    </div>
  );
}
