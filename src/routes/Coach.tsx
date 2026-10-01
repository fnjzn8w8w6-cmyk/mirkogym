import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAthlete } from '@/hooks/use-athlete';
import { Dumbbell, Library, MessageCircle, RefreshCw, Send, Sparkles } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented, TextArea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
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
import type { Day } from '@/types';

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

function TrainingCoach({ profile }: { profile: UserProfile }) {
  const athleteMem = useAthlete();
  const { settings, update } = useSettings();
  const { save, days: currentDays } = useSchedule();
  const toast = useToast();
  const ai = useAITask();
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<{ prefs: CoachPrefs; days: Day[]; diff: TrainingDiff[]; rebuild: boolean } | null>(null);
  const current = settings.coachPrefs;

  const submit = async () => {
    const text = request.trim();
    if (text.length < 5) return;
    const change = await ai.run((o) => interpretTrainingChange(text, profile, currentDays, current, o, athleteMem.text));
    if (!change) return;
    if (change.scope === 'rebuild' || currentDays.length === 0) {
      setProposal({ prefs: change.prefs, days: generateProgram(profile, change.prefs), diff: [], rebuild: true });
      return;
    }
    // Modifiche mirate: il resto della scheda resta com'è
    const res = applyTrainingChange(currentDays, change, profile);
    setProposal({ prefs: change.prefs, days: res.days, diff: res.diff, rebuild: false });
  };

  const apply = async (prefs: CoachPrefs | null, days: Day[]) => {
    await settle(save(days));
    await settle(update({ coachPrefs: prefs ?? undefined }));
    setProposal(null);
    setRequest('');
    toast.success('Scheda aggiornata dal coach');
  };

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4">
        <div className="flex items-center gap-2 text-lg text-fg">
          <Dumbbell className="h-5 w-5 text-accent-500" aria-hidden /> Il tuo personal trainer
        </div>
        <p className="mt-1 text-sm text-fg-2">
          Scrivi cosa vuoi, come parleresti a un trainer: muscoli da migliorare, dolori, tempo a disposizione, esercizi che non ti piacciono.
        </p>
        <div className="relative mt-3 [&_textarea]:pr-14">
          <TextArea label="Cosa vuoi dal tuo allenamento?" rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
          <MicButton size="sm" className="absolute right-2 top-2" onText={(t) => setRequest((r) => appendText(r, t))} />
        </div>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          {TRAIN_EXAMPLES.map((ex) => (
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
            <Button fullWidth icon={<Sparkles className="h-5 w-5" />} disabled={request.trim().length < 5} onClick={submit}>
              Adatta la mia scheda
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

      {current && !proposal && (
        <Card className="p-4">
          <div className="section-title">Preferenze attive</div>
          <p className="mb-2 text-sm text-fg-2">“{current.request}”</p>
          <PrefsChips prefs={current} />
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void apply(null, generateProgram(profile, null))}
          >
            Torna alla scheda standard
          </Button>
        </Card>
      )}

      <Modal open={Boolean(proposal)} onClose={() => setProposal(null)} title="Proposta del coach">
        {proposal && (
          <div className="space-y-4">
            <div className="rounded-lg border border-accent-500/30 bg-accent-glow p-3">
              <p className="text-base text-fg">{proposal.prefs.summary}</p>
              <div className="mt-2">
                <PrefsChips prefs={proposal.prefs} />
              </div>
            </div>
            {proposal.prefs.injuries.length > 0 && (
              <p className="text-sm text-warning">
                ⚠ Con dolori o infortuni fatti valutare da un medico o fisioterapista prima di caricare: il coach evita i movimenti a rischio ma non fa
                diagnosi.
              </p>
            )}
            {proposal.rebuild ? (
              <>
                <ProgramPreview days={proposal.days} />
                <p className="text-xs text-fg-3">La scheda attuale verrà sostituita con una nuova; lo storico degli allenamenti resta.</p>
              </>
            ) : proposal.diff.length === 0 ? (
              <p className="text-sm text-fg-2">Nessuna modifica necessaria alla scheda: salvo solo le tue preferenze per le prossime schede.</p>
            ) : (
              <div>
                <div className="section-title">Modifiche alla tua scheda</div>
                <ul className="space-y-2">
                  {proposal.diff.map((d, i) => (
                    <li key={i} className="rounded-md bg-surface-2 p-2.5 text-sm">
                      <div className="text-xs uppercase text-fg-3">{d.day}</div>
                      <div className="text-base text-fg">
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
                <p className="mt-2 text-xs text-fg-3">Tutto il resto della scheda resta invariato. Serie, ripetizioni e recuperi vengono mantenuti.</p>
              </div>
            )}
            <Button size="lg" fullWidth onClick={() => void apply(proposal.prefs, proposal.days)}>
              {proposal.rebuild ? 'Applica la nuova scheda' : 'Applica le modifiche'}
            </Button>
            {!proposal.rebuild && (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setProposal({ ...proposal, days: generateProgram(profile, proposal.prefs), diff: [], rebuild: true })}
              >
                Preferisco una scheda nuova da zero
              </Button>
            )}
          </div>
        )}
      </Modal>
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
  const athlete = useAthlete();
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
    const ctx = `${coachContext(profile, userNutrition(profile, settings), sessions, bodyLogs)}\nMEMORIA DEL COACH (storico completo):\n${athlete.text}`;
    const answer = await ai.run((o) => askCoach(q, messages, ctx, o));
    if (answer) setMessages([...history, { role: 'coach', text: answer }]);
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-lg text-fg">
            <MessageCircle className="h-5 w-5 text-accent-500" aria-hidden /> Chiedi al coach
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
