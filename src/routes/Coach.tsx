import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { nutrition, type UserProfile } from '@/lib/metabolism';
import { generateProgram, sessionMinutes, SLOT_LABEL, type CoachPrefs } from '@/lib/program-generator';
import { askCoach, coachContext, interpretTrainingRequest, type ChatMessage } from '@/lib/coach';
import { NutritionPlanner, RecipesTab } from '@/components/food/NutritionPlanner';
import { WeeklyCheckIn } from '@/components/coach/WeeklyCheckIn';
import { groupColor } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Day } from '@/types';

type Tab = 'train' | 'food' | 'recipes' | 'chat';

/** Profilo con peso e massa grassa più recenti registrati in "Corpo". */
function useEffectiveProfile(): UserProfile | null {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  return useMemo(() => {
    const p = settings.profile;
    if (!p) return null;
    const w = bodyLogs.find((b) => b.weight != null)?.weight;
    const bf = bodyLogs.find((b) => b.bodyFat != null)?.bodyFat;
    return { ...p, weightKg: w ?? p.weightKg, bodyFatPct: bf ?? p.bodyFatPct };
  }, [settings.profile, bodyLogs]);
}

export default function Coach() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'train';
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
            { value: 'train', label: 'Scheda' },
            { value: 'food', label: 'Dieta' },
            { value: 'recipes', label: 'Ricette' },
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
          ) : tab === 'food' ? (
            <NutritionPlanner profile={profile} header={<WeeklyCheckIn profile={profile} autoOpen={params.get('checkin') === '1'} />} />
          ) : tab === 'recipes' ? (
            <RecipesTab profile={profile} />
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
  const { settings, update } = useSettings();
  const { save } = useSchedule();
  const toast = useToast();
  const ai = useAITask();
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<{ prefs: CoachPrefs; days: Day[] } | null>(null);
  const current = settings.coachPrefs;

  const submit = async () => {
    const text = request.trim();
    if (text.length < 5) return;
    const prefs = await ai.run((o) => interpretTrainingRequest(text, profile, o));
    if (prefs) setProposal({ prefs, days: generateProgram(profile, prefs) });
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
        <TextArea
          className="mt-3"
          label="Cosa vuoi dal tuo allenamento?"
          rows={3}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
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
            <ProgramPreview days={proposal.days} />
            <p className="text-xs text-fg-3">La scheda attuale verrà sostituita; lo storico degli allenamenti resta.</p>
            <Button size="lg" fullWidth onClick={() => void apply(proposal.prefs, proposal.days)}>
              Applica questa scheda
            </Button>
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
  const [input, setInput] = useState('');
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
    const ctx = coachContext(profile, nutrition(profile, settings.kcalAdjust ?? 0), sessions, bodyLogs);
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
            m.role === 'user' ? 'self-end bg-accent-500 text-white' : 'self-start border border-line-subtle bg-surface text-fg',
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
