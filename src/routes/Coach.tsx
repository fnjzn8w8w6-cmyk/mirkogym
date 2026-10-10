import { useEffect, useRef, useState } from 'react';
import { useCoachMemory } from '@/hooks/use-training-model';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dumbbell, Library, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { AIBusy, AINote, useAITask } from '@/components/coach/AIBusy';
import { settle } from '@/lib/firestore';
import type { UserProfile } from '@/lib/metabolism';
import { generateProgram, sessionMinutes, SLOT_LABEL, type CoachPrefs } from '@/lib/program-generator';
import { askCoach, coachContext, userNutrition, type ChatMessage } from '@/lib/coach';
import { applyTrainingChange, interpretTrainingChange, type TrainingDiff } from '@/lib/training-edits';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';
import { DietCoach } from '@/components/coach/DietCoach';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { MicButton, appendText } from '@/components/ui/MicButton';
import { CoachThread, threadContext, useThread, type ThreadMsg } from '@/components/coach/CoachThread';
import { GoalCard } from '@/components/goal/GoalPlan';
import { SectionTitle } from '@/components/ui/Help';
import type { Day } from '@/types';
import { NAME_IT } from '@/lib/exercise-library';

type Tab = 'train' | 'diet' | 'chat';

export default function Coach() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'chat' || raw === 'diet' ? raw : 'train';
  // Vecchi collegamenti alla nutrizione: ora è nella pagina Dieta
  useEffect(() => {
    if (raw === 'food' || raw === 'recipes') navigate(`/food?tab=${raw === 'food' ? 'plan' : 'recipes'}${params.get('checkin') ? '&checkin=1' : ''}`, { replace: true });
  }, [raw, navigate, params]);
  const profile = useEffectiveProfile();

  return (
    <div>
      <TopBar
        title="Coach"
        subtitle="Personal trainer e dietologo su misura"
        large
        right={
          <IconButton label="Libreria esercizi" onClick={() => navigate('/exercises')} className="-mr-2">
            <Library className="h-6 w-6" />
          </IconButton>
        }
      />
      <div className="page pt-3">
        {profile && tab !== 'chat' && (
          <div className="mb-3">
            <GoalCard compact />
          </div>
        )}
        <Segmented<Tab>
          label="Sezione coach"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'train', label: 'Allenamento' },
            { value: 'diet', label: 'Dieta' },
            { value: 'chat', label: 'Chiedi' },
          ]}
        />
        <div className="mt-4">
          {!profile ? (
            <EmptyState
              title="Completa il tuo profilo"
              description="Servono i tuoi dati per creare piani su misura."
              action={<Button onClick={() => navigate('/profile')}>Vai al profilo</Button>}
            />
          ) : tab === 'train' ? (
            <TrainingCoach profile={profile} />
          ) : tab === 'diet' ? (
            <DietCoach profile={profile} />
          ) : (
            <ChatCoach profile={profile} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allenamento                                                         */
/* ------------------------------------------------------------------ */

const TRAIN_EXAMPLES = [
  'Voglio spalle più larghe e braccia più grosse',
  'Ho male al ginocchio destro, niente squat',
  'Ho al massimo 45 minuti a seduta',
  'Togli l’hack squat, mi fa male il ginocchio',
  'Voglio migliorare i glutei e il core',
];

function PrefsChips({ prefs }: { prefs: CoachPrefs }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {prefs.priorities.map((p) => (
        <Chip key={p} tone="accent">
          ⬆ {p}
        </Chip>
      ))}
      {prefs.avoidSlots.map((s) => (
        <Chip key={s} tone="danger">
          ✕ {SLOT_LABEL[s].split(' (')[0]}
        </Chip>
      ))}
      {prefs.maxMinutes && <Chip tone="info">⏱ max {prefs.maxMinutes} min</Chip>}
      {prefs.injuries.map((i) => (
        <Chip key={i} tone="warning">
          ⚠ {i}
        </Chip>
      ))}
    </div>
  );
}

/** Preferenze attive modificabili: ogni voce si toglie con la ✕ (es. il dolore alla spalla è passato). */
function ActivePrefs({ prefs, onRemove }: { prefs: CoachPrefs; onRemove: (next: CoachPrefs, what: string) => void }) {
  const items: { key: string; label: string; tone: 'accent' | 'danger' | 'info' | 'warning'; next: () => CoachPrefs }[] = [
    ...prefs.injuries.map((i) => ({ key: `i-${i}`, label: `Dolore: ${i}`, tone: 'warning' as const, next: () => ({ ...prefs, injuries: prefs.injuries.filter((x) => x !== i) }) })),
    ...prefs.avoidSlots.map((sl) => ({ key: `s-${sl}`, label: `Evita: ${SLOT_LABEL[sl].split(' (')[0]}`, tone: 'danger' as const, next: () => ({ ...prefs, avoidSlots: prefs.avoidSlots.filter((x) => x !== sl) }) })),
    ...prefs.avoidExercises.map((id) => ({ key: `e-${id}`, label: `Evita: ${NAME_IT[id] ?? id.replace(/_/g, ' ')}`, tone: 'danger' as const, next: () => ({ ...prefs, avoidExercises: prefs.avoidExercises.filter((x) => x !== id) }) })),
    ...prefs.priorities.map((pr) => ({ key: `p-${pr}`, label: `Insisti: ${pr}`, tone: 'accent' as const, next: () => ({ ...prefs, priorities: prefs.priorities.filter((x) => x !== pr) }) })),
    ...(prefs.maxMinutes ? [{ key: 'm', label: `Massimo ${prefs.maxMinutes} min`, tone: 'info' as const, next: () => ({ ...prefs, maxMinutes: undefined }) }] : []),
  ];
  if (!items.length) return <p className="text-sm text-fg-3">Nessuna preferenza attiva.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-label={`Togli ${it.label}`}
          onClick={() => onRemove(it.next(), it.label)}
          className={cn(
            'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border py-1 pl-3 pr-2 text-sm',
            it.tone === 'warning' && 'border-warning/40 bg-warning-bg text-warning',
            it.tone === 'danger' && 'border-danger/40 bg-danger-bg text-danger',
            it.tone === 'accent' && 'border-accent-500/40 bg-accent-glow text-accent-400',
            it.tone === 'info' && 'border-info/40 bg-info-bg text-info',
          )}
        >
          <span className="text-left">{it.label}</span>
          <X className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function ProgramPreview({ days }: { days: Day[] }) {
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <Card key={d.id} className="p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold text-fg">
              {d.name} · {d.subtitle}
            </span>
            <span className="text-sm text-fg-3">~{sessionMinutes(d)} min</span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {d.exercises.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm text-fg-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: groupColor(e.group) }} aria-hidden />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="shrink-0 text-fg-3">
                  {e.sets}×{e.repMin}-{e.repMax}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

type TrainProposal = { prefs: CoachPrefs; days: Day[]; diff: TrainingDiff[]; rebuild: boolean };

const describeTrain = (p: TrainProposal) =>
  p.rebuild ? 'scheda nuova da zero' : p.diff.length ? p.diff.map((d) => `${d.day}: ${d.before ?? ''} → ${d.after ?? ''}`).join('; ') : 'nessuna modifica alla scheda';

function TrainDiffList({ p }: { p: TrainProposal }) {
  if (p.rebuild) return <ProgramPreview days={p.days} />;
  if (!p.diff.length) return <p className="text-sm text-fg-2">Nessuna modifica alla scheda: salvo solo le tue preferenze.</p>;
  return (
    <ul className="space-y-1.5">
      {p.diff.map((d, i) => (
        <li key={i} className="rounded-md bg-surface p-2 text-sm">
          <div className="text-xs uppercase text-fg-3">{d.day}</div>
          <div className="text-fg">
            {d.kind === 'replace' && (
              <>
                <span className="text-fg-3 line-through">{d.before}</span> → <strong>{d.after}</strong>
              </>
            )}
            {d.kind === 'remove' && (
              <>
                Tolto: <span className="line-through">{d.before}</span>
              </>
            )}
            {d.kind === 'add' && <>Aggiunto: <strong>{d.after}</strong></>}
            {(d.kind === 'sets' || d.kind === 'time') && (
              <>
                {d.before} → <strong>{d.after}</strong>
              </>
            )}
          </div>
          {d.reason && <div className="text-xs text-fg-3">{d.reason}</div>}
        </li>
      ))}
    </ul>
  );
}

function TrainingCoach({ profile }: { profile: UserProfile }) {
  const coachMem = useCoachMemory();
  const { settings, update } = useSettings();
  const { save, days: currentDays } = useSchedule();
  const toast = useToast();
  const ai = useAITask();
  const [msgs, setMsgs] = useThread<TrainProposal>('vl.thread.train');
  const current = settings.coachPrefs;

  const send = async (text: string) => {
    const history = msgs;
    setMsgs([...history, { role: 'user', text, at: Date.now() }]);
    const request = threadContext(history, text, describeTrain);
    const change = await ai.run((o) => interpretTrainingChange(request, profile, currentDays, current, o, coachMem));
    if (!change) {
      setMsgs((m) => [...m, { role: 'coach', text: 'Non sono riuscito a rispondere: riprova o riformula.', at: Date.now() }]);
      return;
    }
    const proposal: TrainProposal =
      change.scope === 'rebuild' || currentDays.length === 0
        ? { prefs: change.prefs, days: generateProgram(profile, change.prefs), diff: [], rebuild: true }
        : (() => {
            // Modifiche mirate: il resto della scheda resta com'è
            const res = applyTrainingChange(currentDays, change, profile);
            return { prefs: change.prefs, days: res.days, diff: res.diff, rebuild: false };
          })();
    setMsgs((m) => [...m, { role: 'coach', text: change.prefs.summary, proposal, at: Date.now() }]);
  };

  const apply = async (msg: ThreadMsg<TrainProposal>) => {
    if (!msg.proposal) return;
    await settle(save(msg.proposal.days));
    await settle(update({ coachPrefs: msg.proposal.prefs }));
    setMsgs((m) => m.map((x) => (x === msg ? { ...x, applied: true } : x)));
    toast.success('Scheda aggiornata dal coach');
  };

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4">
        <div className="flex items-center gap-2 text-lg text-fg">
          <Dumbbell className="h-5 w-5 text-accent-500" aria-hidden /> <SectionTitle help="coach-training">Il tuo personal trainer</SectionTitle>
        </div>
        {msgs.length === 0 && (
          <>
            <p className="mt-1 text-sm text-fg-2">
              Scrivi cosa vuoi, come parleresti a un trainer: muscoli da migliorare, dolori, tempo a disposizione, esercizi che non ti piacciono. Se la
              proposta non ti convince, rispondigli: la corregge.
            </p>
            <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
              {TRAIN_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={ai.busy}
                  onClick={() => void send(ex)}
                  className="h-9 shrink-0 rounded-full border border-line bg-surface-2 px-3 text-sm text-fg-2"
                >
                  {ex}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-3">
          <CoachThread
            msgs={msgs}
            busy={ai.busy}
            busyView={<AIBusy status={ai.status} onCancel={ai.cancel} />}
            placeholder={msgs.length ? 'Rispondi al coach…' : 'Cosa vuoi dal tuo allenamento?'}
            onSend={(t) => void send(t)}
            onReset={() => setMsgs([])}
            renderProposal={(p, active, msg) => (
              <div className="space-y-2">
                <PrefsChips prefs={p.prefs} />
                {p.prefs.injuries.length > 0 && active && (
                  <p className="text-xs text-warning">⚠ Con dolori o infortuni fatti valutare da un medico o fisioterapista: il coach evita i movimenti a rischio ma non fa diagnosi.</p>
                )}
                <TrainDiffList p={p} />
                {active && (
                  <>
                    <Button fullWidth onClick={() => void apply(msg)}>
                      {p.rebuild ? 'Applica la nuova scheda' : 'Applica alla scheda'}
                    </Button>
                    {!p.rebuild && (
                      <button type="button" className="h-9 w-full text-sm text-fg-3" onClick={() => void send('Preferisco una scheda nuova da zero')}>
                        Preferisco una scheda nuova da zero
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          />
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

      {current && (
        <Card className="p-4">
          <div className="section-title">
            <SectionTitle help="coach-prefs" isNew>
              Preferenze attive
            </SectionTitle>
          </div>
          <p className="mb-2 text-sm text-fg-2">Il coach ne tiene conto in ogni proposta. Tocca la ✕ per togliere quelle che non valgono più (es. un dolore passato).</p>
          <ActivePrefs
            prefs={current}
            onRemove={async (next, what) => {
              await settle(update({ coachPrefs: next }));
              // anche la conversazione lo sa, così il coach non lo ripropone
              setMsgs((m) => (m.length ? [...m, { role: 'user', text: `Ho tolto «${what}» dalle preferenze: non vale più, non tenerne conto.`, at: Date.now() }] : m));
              toast.success(`Tolto: ${what}`);
            }}
          />
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => {
              await settle(save(generateProgram(profile, null)));
              await settle(update({ coachPrefs: undefined }));
              toast.success('Scheda standard ripristinata');
            }}
          >
            Torna alla scheda standard
          </Button>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

const CHAT_KEY = 'mirkogym.coachChat';
const CHAT_EXAMPLES = [
  'Cosa mangio prima di allenarmi?',
  'Sono in stallo sulla panca, cosa faccio?',
  'Quante proteine mi servono davvero?',
  'Come recupero meglio dopo le gambe?',
];

function ChatCoach({ profile }: { profile: UserProfile }) {
  const { settings } = useSettings();
  const { sessions } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const ai = useAITask();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? '[]') as ChatMessage[];
    } catch {
      return [];
    }
  });
  const coachMem = useCoachMemory();
  const [input, setInput] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('q') ?? '');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      /* ignorato */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, ai.busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || ai.busy) return;
    const history = [...messages, { role: 'user' as const, text: q }];
    setMessages(history);
    setInput('');
    const ctx = `${coachContext(profile, userNutrition(profile, settings), sessions, bodyLogs)}\nMEMORIA DEL COACH (storico completo):\n${coachMem}`;
    const answer = await ai.run((o) => askCoach(q, messages, ctx, o));
    if (answer) setMessages([...history, { role: 'coach', text: answer }]);
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-lg text-fg">
            <MessageCircle className="h-5 w-5 text-accent-500" aria-hidden /> <SectionTitle help="coach-chat">Chiedi al coach</SectionTitle>
          </div>
          <p className="mt-1 text-sm text-fg-2">Allenamento, alimentazione, recupero: il coach conosce il tuo profilo e i tuoi ultimi allenamenti.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CHAT_EXAMPLES.map((q) => (
              <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-line bg-surface-2 px-3 py-2 text-sm text-fg-2">
                {q}
              </button>
            ))}
          </div>
        </Card>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            'max-w-[88%] whitespace-pre-wrap rounded-xl px-4 py-3 text-base',
            m.role === 'user' ? 'self-end bg-accent-500 text-onaccent' : 'self-start border border-line-subtle bg-surface text-fg',
          )}
        >
          {m.text}
        </div>
      ))}
      {ai.busy && <AIBusy status={ai.status} onCancel={ai.cancel} />}
      {ai.error && (
        <p className="text-sm text-danger" role="alert">
          {ai.error}
        </p>
      )}
      <div ref={endRef} />
      <form
        className="sticky flex gap-2 bg-base py-2"
        style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom))' }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Scrivi una domanda…"
          aria-label="Domanda per il coach"
          className="h-12 flex-1 rounded-full border border-line bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent-500"
        />
        <MicButton className="!h-12 !w-12" onText={(t) => setInput((r) => appendText(r, t))} />
        <Button type="submit" className="!h-12 !w-12 !rounded-full !px-0" disabled={!input.trim() || ai.busy} aria-label="Invia">
          <Send className="h-5 w-5" />
        </Button>
      </form>
      {messages.length > 0 && (
        <button type="button" className="text-sm text-fg-3" onClick={() => setMessages([])}>
          Nuova conversazione
        </button>
      )}
      <AINote />
    </div>
  );
}
