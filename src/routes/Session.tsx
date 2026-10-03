import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Clock, Dumbbell, Flag, Play, Plus, Trophy, X } from 'lucide-react';
import type { ActiveSession, DraftSet, Exercise, Session as SessionT, SetLog } from '@/types';
import { useSchedule } from '@/hooks/use-schedule';
import { useSessions } from '@/hooks/use-sessions';
import { useSettings } from '@/hooks/use-settings';
import { useMesocycle } from '@/hooks/use-mesocycle';
import { parseNum, useActiveSession, useSessionDraft } from '@/hooks/use-active-session';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { useToast } from '@/components/ui/Toast';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { settle } from '@/lib/firestore';
import { WorkoutRecapForm } from '@/components/coach/Recaps';
import { Modal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { OfflineBadge } from '@/components/layout/TopBar';
import { ExerciseCard } from '@/components/session/ExerciseCard';
import { Confetti } from '@/components/celebration/Confetti';
import { calculateSuggestion, describeLog, parseRestSeconds, previousLogsFor, repTargets } from '@/lib/progression';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useLibrary } from '@/hooks/use-library';
import { ExerciseBrowser } from '@/components/library/ExerciseBrowser';
import { ExerciseInfoModal } from '@/components/library/ExerciseInfoModal';
import { displayName, groupForLibrary, type LibraryExercise } from '@/lib/exercise-library';
import { libraryIdOf } from '@/lib/seed-data';
import { ACHIEVEMENTS, computeStats, isUnlocked, levelOf, xpOf } from '@/lib/gamification';
import { renderShareCard, shareImage } from '@/lib/share-card';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { Share2 } from 'lucide-react';
import { ExerciseNoteModal, PlateCalculatorModal, SwapExerciseModal } from '@/components/modals/SessionTools';
import type { SetType } from '@/types';
import { detectPR, exerciseKey, formatKg, formatTonnage, isAnyPR, sessionTonnage } from '@/lib/analytics';
import { formatClock, formatDuration } from '@/lib/date-utils';
import { haptics, unlockAudio } from '@/lib/haptics';
import { MUSCLE_GROUPS } from '@/lib/seed-data';
import { useAthlete } from '@/hooks/use-athlete';
import { useStatsExtra } from '@/hooks/use-progress';
import { useTrainingModel } from '@/hooks/use-training-model';
import { calibrationBump, convertLoad, kindOf, rirCalibration, type Conversion } from '@/lib/training-model';
import { PAIN_LABEL, exercisesStressing, type PainInfo } from '@/lib/athlete';

export default function SessionRoute() {
  const { dayId = '' } = useParams();
  const navigate = useNavigate();
  const { getDay } = useSchedule();
  const { activeSession, start } = useActiveSession();
  const { isDeloadWeek } = useMesocycle();
  const [starting, setStarting] = useState(false);
  // Mantiene montata la vista anche dopo che la bozza remota viene chiusa (celebrazione finale)
  const [viewing, setViewing] = useState<ActiveSession | null>(activeSession);
  const day = getDay(dayId);

  useEffect(() => {
    if (activeSession && activeSession.id !== viewing?.id) setViewing(activeSession);
  }, [activeSession, viewing?.id]);

  if (activeSession && activeSession.dayId !== dayId) return <Navigate to={`/session/${activeSession.dayId}`} replace />;
  const current = activeSession ?? viewing;
  if (current) return <SessionView key={current.id} initial={current} />;

  return (
    <div className="page" style={{ paddingTop: 'calc(var(--safe-top) + 24px)' }}>
      <EmptyState
        title={day ? `${day.name} · ${day.subtitle}` : 'Giorno non trovato'}
        description={day ? `${day.exercises.length} esercizi pronti. Vuoi iniziare?` : 'Torna alla home e scegli un giorno.'}
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Home
            </Button>
            {day && (
              <Button
                loading={starting}
                icon={<Play className="h-5 w-5 fill-current" />}
                onClick={async () => {
                  setStarting(true);
                  await start(day, isDeloadWeek);
                  setStarting(false);
                }}
              >
                Inizia
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}

const EXTRA_DEFAULTS: Omit<Exercise, 'id' | 'name' | 'group'> = {
  sets: 3,
  repMin: 8,
  repMax: 12,
  rirTarget: '1-2',
  rest: '90 sec',
};

function SessionView({ initial }: { initial: ActiveSession }) {
  const navigate = useNavigate();
  const toast = useToast();
  const timer = useRestTimer();
  const { getDay, exerciseIndex, days, save: saveSchedule } = useSchedule();
  const { sessions, nameOf, save: saveSessionRecap } = useSessions();
  const { bodyLogs } = useBodyLogs();
  const { settings, update: updateSettings } = useSettings();
  const athlete = useAthlete();
  const statsExtra = useStatsExtra();
  const { discard } = useActiveSession();
  const [sharing, setSharing] = useState(false);
  const {
    draft,
    updateSet,
    addSet,
    removeSet,
    addExercise,
    removeExercise,
    setNotes,
    setReadiness,
    insertWarmups,
    replaceExercise,
    finish,
    cancelSync,
  } = useSessionDraft(initial);

  const day = getDay(draft.dayId);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exitOpen, setExitOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<SessionT | null>(null);
  const [plates, setPlates] = useState<{ weight: number | null } | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [libPick, setLibPick] = useState<{ mode: 'extra' } | { mode: 'swap'; idx: number } | null>(null);
  const [info, setInfo] = useState<LibraryExercise | null>(null);
  const library = useLibrary();
  const model = useTrainingModel();
  const [conversions, setConversions] = useState<Record<string, Conversion>>({});
  /** Sostituzione con carico equivalente calcolato dal vecchio esercizio. */
  const swapWith = (idx: number, choice: { exerciseId: string; name: string; group: string; extra?: boolean; libraryId?: string }) => {
    const old = draft.exercises[idx];
    const typed = parseNum(old?.sets.find((x) => x.type !== 'warmup' && x.weight)?.weight ?? '');
    const w = typed ?? suggestions[idx]?.suggestion.weight ?? null;
    const oldEx = exercises[idx];
    const conv =
      w != null && oldEx
        ? convertLoad(
            { name: oldEx.name, equipment: oldEx.libraryId ? library.byId.get(oldEx.libraryId)?.e : undefined, weight: w },
            { name: choice.name, equipment: choice.libraryId ? library.byId.get(choice.libraryId)?.e : undefined },
            sessions,
            nameOf,
          )
        : null;
    if (conv) setConversions((c) => ({ ...c, [choice.exerciseId]: conv }));
    replaceExercise(idx, choice);
    toast.success(conv ? `Sostituito con ${choice.name}: carico equivalente ${conv.label}` : `Sostituito con ${choice.name}`);
  };

  useWakeLock(settings.keepScreenOn && !result);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Definizione di esercizio per ciascun elemento della bozza (extra = default generici)
  const exercises = useMemo(
    () =>
      draft.exercises.map(
        (d): Exercise =>
          exerciseIndex.get(d.exerciseId) ?? {
            id: d.exerciseId,
            name: d.name,
            group: d.group,
            libraryId: d.libraryId,
            ...EXTRA_DEFAULTS,
          },
      ),
    [draft.exercises, exerciseIndex],
  );

  // Suggerimenti calcolati una volta per sessione (dallo storico, non dalla bozza)
  const suggestions = useMemo(
    () =>
      exercises.map((ex) => {
        const prev = previousLogsFor(ex, sessions);
        const last = prev[prev.length - 1];
        let base = calculateSuggestion(ex, prev, draft.deload, settings.deloadPercentage);
        const libEq = ex.libraryId ? library.byId.get(ex.libraryId)?.e : undefined;
        const dumbbell = kindOf(ex.name, libEq) === 'dumbbell';
        // Carico equivalente dopo una sostituzione (se non c'è ancora storico per il nuovo esercizio)
        const conv = conversions[ex.id];
        if (conv && (base.type === 'first' || base.type === 'start'))
          base = { weight: conv.weight, hint: `Carico equivalente: ${conv.label}${conv.personal ? ' (dai tuoi dati)' : ' (stima standard)'}`, type: 'start' };
        // RIR calibrato: se lasci più ripetizioni di quelle che dichiari, si sale un po' di più
        const cal = rirCalibration(prev);
        if (base.weight != null && (base.type === 'progress' || base.type === 'maintain')) {
          const bump = calibrationBump(base.weight, cal, dumbbell);
          if (bump > 0)
            base = { ...base, weight: base.weight + bump, hint: `${base.hint} · RIR calibrato: ti restano ~${String(cal!.offset).replace('.', ',')} rip. in più → +${formatKg(bump, 2)} kg` };
        }
        // Settimana leggera mirata per i gruppi affaticati
        const fat = model.fatigue.get(ex.group);
        if (fat?.light && base.weight != null && !draft.deload)
          base = { ...base, weight: Math.round(base.weight * 0.7 * 4) / 4, hint: `Settimana leggera ${ex.group.toLowerCase()} (fatica ${fat.score}/100): −30% e una serie in meno`, type: 'deload' };
        // Autoregolazione: giornata "no" → -10% sul carico suggerito
        const suggestion =
          draft.readiness === 'low' && base.weight != null && !draft.deload
            ? { ...base, weight: Math.round(base.weight * 0.9 * 4) / 4, hint: `Giornata no: -10% · ${base.hint}` }
            : draft.readiness === 'high' && base.type === 'maintain'
              ? { ...base, hint: `${base.hint} — sei in forma, prova a superare i target!` }
              : base;
        const lastWorking = (last?.sets ?? []).filter((x) => x.type !== 'warmup');
        return {
          suggestion,
          lastText: last ? describeLog(last) : undefined,
          lastDate: last?.date,
          prevSets: lastWorking.map((x) => ({ weight: formatKg(x.weight, 2), reps: x.reps })),
          repTargets: repTargets(ex, last, suggestion, Math.max(ex.sets, 10)),
        };
      }),
    [exercises, sessions, draft.deload, draft.readiness, settings.deloadPercentage, conversions, model, library.byId],
  );

  // Storico set per nome esercizio (PR detection)
  const historyByKey = useMemo(() => {
    const m = new Map<string, SetLog[]>();
    for (const s of sessions) {
      for (const l of s.logs) {
        const k = exerciseKey(l.name ?? exerciseIndex.get(l.exerciseId)?.name ?? '');
        m.set(k, [...(m.get(k) ?? []), ...l.sets]);
      }
    }
    return m;
  }, [sessions, exerciseIndex]);

  const totalSets = draft.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = draft.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const allDone = totalSets > 0 && doneSets === totalSets;
  const elapsed = Math.floor((now - draft.startedAt) / 1000);

  const toggleDone = (exIdx: number, setIdx: number): boolean => {
    const ex = draft.exercises[exIdx];
    const set = ex.sets[setIdx];
    if (set.done) {
      updateSet(exIdx, setIdx, { done: false, isPersonalRecord: false });
      return true;
    }
    const isWarmup = set.type === 'warmup';
    const sugg = suggestions[exIdx]?.suggestion;
    const weightStr = set.weight || (!isWarmup && sugg?.weight != null ? String(sugg.weight).replace('.', ',') : '');
    const weight = parseNum(weightStr);
    const reps = parseNum(set.reps);
    if (weight == null || reps == null || reps <= 0 || weight < 0) {
      toast.error(weight == null ? 'Inserisci il peso' : 'Inserisci le ripetizioni');
      return false;
    }
    unlockAudio();
    if (isWarmup) {
      updateSet(exIdx, setIdx, { done: true, weight: weightStr, isPersonalRecord: false });
      haptics.setDone();
      return true;
    }

    // PR: storico + serie già completate in questa sessione per lo stesso esercizio
    const key = exerciseKey(ex.name);
    const sessionPrev: SetLog[] = draft.exercises
      .filter((e) => exerciseKey(e.name) === key)
      .flatMap((e) => e.sets.filter((s) => s.done && s.type !== 'warmup').map((s) => ({ weight: parseNum(s.weight) ?? 0, reps: parseNum(s.reps) ?? 0 })));
    // Senza storico precedente la prima volta non è un record (nemmeno rispetto alle serie di oggi)
    const history = historyByKey.get(key) ?? [];
    const flags = history.length ? detectPR([...history, ...sessionPrev], { weight, reps }) : detectPR([], { weight, reps });
    const isPR = isAnyPR(flags);

    const patch: Partial<DraftSet> = { done: true, weight: weightStr, isPersonalRecord: isPR };
    updateSet(exIdx, setIdx, patch);
    // Precompila il peso della serie successiva
    const nextSet = ex.sets[setIdx + 1];
    if (nextSet && !nextSet.done && nextSet.type !== 'warmup' && nextSet.weight === '') updateSet(exIdx, setIdx + 1, { weight: weightStr });

    if (isPR) {
      haptics.pr();
      const what = flags.weightPR ? 'peso massimo' : flags.estimated1RMPR ? '1RM stimato' : 'reps a questo peso';
      toast.pr(`Nuovo PR — ${ex.name}: ${formatKg(weight, 2)}×${reps} (${what})`);
    } else {
      haptics.setDone();
    }

    if (settings.restTimerEnabled && settings.restTimerAutoStart) {
      const isLastOfSession = doneSets + 1 === totalSets;
      if (!isLastOfSession) timer.start(parseRestSeconds(exercises[exIdx].rest), `Dopo ${ex.name} · serie ${setIdx + 1}`);
    }
    return true;
  };

  const doFinish = async () => {
    setConfirmFinish(null);
    setFinishing(true);
    try {
      const s = await finish();
      timer.skip();
      if (s) {
        haptics.sessionSaved();
        setResult(s);
      }
    } catch (e) {
      console.error(e);
      toast.error('Salvataggio non riuscito, riprova');
    } finally {
      setFinishing(false);
    }
  };

  const requestFinish = () => {
    if (doneSets === 0) {
      toast.info('Nessuna serie completata: puoi solo scartare la sessione');
      setDiscardOpen(true);
      return;
    }
    if (!allDone) {
      setConfirmFinish(`Hai ${totalSets - doneSets} serie non completate: non verranno salvate. Terminare comunque?`);
      return;
    }
    void doFinish();
  };

  // Gamification: XP guadagnati, livello e traguardi sbloccati con questa sessione
  const reward = useMemo(() => {
    if (!result) return null;
    const before = sessions.filter((x) => x.id !== result.id);
    const sb = computeStats(before, bodyLogs, nameOf, statsExtra);
    const sa = computeStats([...before, result], bodyLogs, nameOf, statsExtra);
    const ub = ACHIEVEMENTS.filter((a) => isUnlocked(a, sb));
    const ua = ACHIEVEMENTS.filter((a) => isUnlocked(a, sa));
    const lb = levelOf(xpOf(sb, ub.length));
    const la = levelOf(xpOf(sa, ua.length));
    return { xp: la.xp - lb.xp, level: la, levelUp: la.level > lb.level, unlocked: ua.filter((a) => !ub.includes(a)) };
    // Calcolato una sola volta, al termine della sessione
  }, [result]);

  const share = async () => {
    if (!result) return;
    setSharing(true);
    try {
      const blob = await renderShareCard(result, day?.name ?? 'Allenamento', day?.subtitle ?? '', nameOf);
      const how = await shareImage(blob, `mirkogym-${new Date(result.date).toISOString().slice(0, 10)}.png`);
      if (how === 'downloaded') toast.success('Immagine salvata');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Condivisione non riuscita');
    } finally {
      setSharing(false);
    }
  };

  const prCount = result ? result.logs.reduce((a, l) => a + l.sets.filter((s) => s.isPersonalRecord).length, 0) : 0;
  // Confronto con l'ultima sessione dello stesso giorno (sessions è ordinato dal più recente)
  const prevSameDay = result ? sessions.find((s) => s.dayId === result.dayId && s.id !== result.id) : undefined;
  const volumeDelta =
    result && prevSameDay && sessionTonnage(prevSameDay) > 0
      ? Math.round(((sessionTonnage(result) - sessionTonnage(prevSameDay)) / sessionTonnage(prevSameDay)) * 100)
      : null;

  return (
    <div>
      {/* Top bar sessione */}
      <header
        className="sticky top-0 z-30 border-b border-line-subtle bg-base/90 backdrop-blur-xl"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="mx-auto flex min-h-[60px] max-w-2xl items-center gap-2 px-4">
          <IconButton label="Esci dalla sessione" className="-ml-3" onClick={() => setExitOpen(true)}>
            <X className="h-6 w-6" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg text-fg">{day?.name ?? 'Sessione'}</h1>
              {draft.deload && <Chip tone="accent">DELOAD</Chip>}
            </div>
            <div className="truncate text-sm text-fg-3">{day?.subtitle}</div>
          </div>
          <OfflineBadge />
          <div className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5" aria-label="Durata sessione">
            <Clock className="h-4 w-4 text-accent-500" aria-hidden />
            <span className="text-base font-bold text-fg">{formatClock(elapsed)}</span>
          </div>
        </div>
        <div className="h-1 bg-surface-2">
          <div
            className="h-full bg-accent-500 transition-[width] duration-300"
            style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
            role="progressbar"
            aria-label="Serie completate"
            aria-valuenow={doneSets}
            aria-valuemin={0}
            aria-valuemax={totalSets}
          />
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
        {draft.exercises.map((ex, i) => (
          <ExerciseCard
            key={`${ex.exerciseId}-${i}`}
            index={i}
            draft={ex}
            exercise={exercises[i]}
            suggestion={suggestions[i].suggestion}
            lastText={suggestions[i].lastText}
            lastDate={suggestions[i].lastDate}
            expanded={Boolean(expanded[i])}
            onToggleExpanded={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
            onSetChange={(j, patch) => updateSet(i, j, patch)}
            onToggleDone={(j) => toggleDone(i, j)}
            onAddSet={() => addSet(i)}
            onRemoveSet={() => removeSet(i, ex.sets.length - 1)}
            onRemoveExercise={ex.extra ? () => removeExercise(i) : undefined}
            prevSets={suggestions[i].prevSets}
            repTargets={suggestions[i].repTargets}
            onCycleType={(j) => {
              const order: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
              const cur = ex.sets[j].type ?? 'normal';
              const next = order[(order.indexOf(cur) + 1) % order.length];
              updateSet(i, j, { type: next === 'normal' ? undefined : next, isPersonalRecord: false });
              haptics.tap();
            }}
            onAddWarmups={(w) => {
              insertWarmups(i, w);
              toast.info(`${w.length} serie di riscaldamento aggiunte`);
            }}
            onPlates={(w) => setPlates({ weight: w })}
            onNote={() => setNoteFor(i)}
            onSwap={() => setSwapFor(i)}
            libraryId={ex.libraryId ?? libraryIdOf(exercises[i])}
            onInfo={() => {
              const id = ex.libraryId ?? libraryIdOf(exercises[i]);
              const lib = id ? library.byId.get(id) : undefined;
              if (lib) setInfo(lib);
              else toast.info('Caricamento della libreria…');
            }}
          />
        ))}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => setLibPick({ mode: 'extra' })}
            className="flex h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-line text-base font-semibold text-fg-2 hover:border-line-strong hover:text-fg"
          >
            <Plus className="h-5 w-5" aria-hidden /> Aggiungi esercizio extra
          </button>
          <button
            type="button"
            onClick={() => setExtraOpen(true)}
            className="h-14 rounded-lg border border-dashed border-line px-4 text-sm font-semibold text-fg-3 hover:text-fg"
          >
            Personalizzato
          </button>
        </div>

        <TextArea label="Note sessione (opzionale)" value={draft.notes ?? ''} onChange={(e) => setNotes(e.target.value)} rows={2} />

        <Button
          size="lg"
          fullWidth
          variant={allDone ? 'primary' : 'secondary'}
          icon={<Flag className="h-5 w-5" />}
          loading={finishing}
          onClick={requestFinish}
        >
          Termina sessione · {doneSets}/{totalSets}
        </Button>
      </div>

      {/* Uscita */}
      <Modal open={exitOpen} onClose={() => setExitOpen(false)} title="Uscire dalla sessione?">
        <p className="text-base text-fg-2">
          La sessione resta salvata: potrai riprenderla dalla home in qualsiasi momento.
        </p>
        <div className="mt-5 space-y-3">
          <Button fullWidth size="lg" onClick={() => navigate('/')}>
            Continua più tardi
          </Button>
          <Button
            fullWidth
            size="lg"
            variant="danger"
            onClick={() => {
              setExitOpen(false);
              setDiscardOpen(true);
            }}
          >
            Scarta sessione
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={discardOpen}
        title="Scartare la sessione?"
        message="Tutte le serie registrate in questa sessione andranno perse."
        confirmLabel="Scarta"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={async () => {
          timer.skip();
          cancelSync();
          await discard();
          navigate('/');
          toast.info('Sessione scartata');
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmFinish)}
        title="Terminare la sessione?"
        message={confirmFinish ?? ''}
        confirmLabel="Termina"
        destructive={false}
        onCancel={() => setConfirmFinish(null)}
        onConfirm={doFinish}
      />

      <AddExtraModal
        open={extraOpen}
        onClose={() => setExtraOpen(false)}
        onAdd={(name, group, sets) => {
          addExercise(name, group, sets);
          setExtraOpen(false);
          toast.success(`${name} aggiunto`);
          window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 150);
        }}
      />

      <PlateCalculatorModal open={Boolean(plates)} initial={plates?.weight ?? null} onClose={() => setPlates(null)} />
      <ExerciseNoteModal
        open={noteFor != null}
        name={noteFor != null ? draft.exercises[noteFor]?.name ?? '' : ''}
        initial={noteFor != null ? exercises[noteFor]?.notes ?? '' : ''}
        onClose={() => setNoteFor(null)}
        onSave={(note) => {
          const target = noteFor != null ? draft.exercises[noteFor] : undefined;
          setNoteFor(null);
          if (!target || !exerciseIndex.has(target.exerciseId)) {
            toast.info('Le note si salvano solo sugli esercizi della scheda');
            return;
          }
          // Nota fissa: salvata sulla scheda, visibile in tutte le sessioni future
          const next = days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e) => (e.id === target.exerciseId ? { ...e, notes: note || undefined } : e)),
          }));
          void saveSchedule(next);
          toast.success('Nota salvata');
        }}
      />
      <SwapExerciseModal
        open={swapFor != null}
        days={days}
        current={swapFor != null ? draft.exercises[swapFor] ?? null : null}
        onClose={() => setSwapFor(null)}
        onPick={(c) => {
          if (swapFor == null) return;
          swapWith(swapFor, c);
          setSwapFor(null);
        }}
        onLibrary={() => {
          if (swapFor == null) return;
          setLibPick({ mode: 'swap', idx: swapFor });
          setSwapFor(null);
        }}
      />
      <Modal open={libPick != null} onClose={() => setLibPick(null)} title={libPick?.mode === 'swap' ? 'Sostituisci con…' : 'Aggiungi esercizio'}>
        <ExerciseBrowser
          pickLabel={libPick?.mode === 'swap' ? 'Usa questo esercizio' : 'Aggiungi alla sessione'}
          onPick={(lib) => {
            const pick = libPick;
            setLibPick(null);
            if (!pick) return;
            const choice = { exerciseId: `lib-${lib.id}`, name: displayName(lib), group: groupForLibrary(lib), extra: true, libraryId: lib.id };
            if (pick.mode === 'swap') {
              swapWith(pick.idx, choice);
            } else {
              addExercise(choice.name, choice.group, 3, lib.id);
              toast.success(`${choice.name} aggiunto`);
              window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 150);
            }
          }}
        />
      </Modal>
      <ExerciseInfoModal exercise={info} onClose={() => setInfo(null)} />

      <ReadinessModal
        open={draft.readiness == null && doneSets === 0 && !result}
        onPick={setReadiness}
        pains={athlete.report.pains.filter((p) => p.active)}
        todayNames={exercises.map((e) => e.name)}
        onResolved={(part) => void settle(updateSettings({ painResolved: { ...(settings.painResolved ?? {}), [part]: Date.now() } }))}
      />

      {/* Celebrazione */}
      {result && <Confetti />}
      <Modal open={Boolean(result)} onClose={() => navigate('/')} variant="center" dismissible={false}>
        {result && (
          <div className="pt-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-glow shadow-glow">
              <Trophy className="h-10 w-10 text-accent-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-2xl text-fg">Sessione completata!</h2>
            <p className="mt-1 text-base text-fg-2">
              {day?.name} · {day?.subtitle}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Stat icon={<Clock className="h-4 w-4" />} label="Durata" value={formatDuration(result.duration)} />
              <Stat icon={<Dumbbell className="h-4 w-4" />} label="Volume" value={formatTonnage(sessionTonnage(result))} />
              <Stat icon={<Trophy className="h-4 w-4" />} label="PR" value={String(prCount)} highlight={prCount > 0} />
            </div>
            {volumeDelta != null && (
              <p className={`mt-4 text-base font-semibold ${volumeDelta >= 0 ? 'text-success' : 'text-fg-2'}`}>
                Volume {volumeDelta >= 0 ? '+' : ''}
                {volumeDelta}% rispetto all'ultimo {day?.name}
              </p>
            )}
            {prCount > 0 && (
              <p className="mt-4 text-base font-semibold text-warning">
                Hai stabilito {prCount} {prCount === 1 ? 'nuovo PR' : 'nuovi PR'}! 🔥
              </p>
            )}
            {reward && (
              <div className="mt-5 rounded-lg border border-accent-500/30 bg-accent-glow p-3 text-left">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-accent-400">+{reward.xp} XP</span>
                  <span className="text-sm text-fg-2">
                    {reward.levelUp ? '🎉 Nuovo livello! ' : ''}Liv. {reward.level.level} · {reward.level.title}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${reward.level.progress * 100}%` }} />
                </div>
                {reward.unlocked.map((a) => (
                  <div key={a.id} className="mt-3 flex items-center gap-3">
                    <span className="text-3xl" aria-hidden>
                      {a.emoji}
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wide text-warning">Traguardo sbloccato</span>
                      <span className="block text-base font-semibold text-fg">{a.title}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5">
              <WorkoutRecapForm
                initial={result.recap}
                onSend={async (recap) => {
                  const next = { ...result, recap };
                  setResult(next);
                  await settle(saveSessionRecap(next));
                }}
              />
            </div>
            <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
              <Button size="lg" variant="secondary" loading={sharing} icon={<Share2 className="h-5 w-5" />} onClick={share}>
                Condividi
              </Button>
              <Button size="lg" onClick={() => navigate('/')}>
                Torna alla home
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? 'border-warning/30 bg-warning-bg' : 'border-line-subtle bg-surface-2'}`}>
      <div className="flex items-center justify-center gap-1 text-xs uppercase text-fg-3">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl ${highlight ? 'text-warning' : 'text-fg'}`}>{value}</div>
    </div>
  );
}

function AddExtraModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, group: string, sets: number) => void;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [sets, setSets] = useState('3');
  const valid = name.trim().length > 1;
  return (
    <Modal open={open} onClose={onClose} title="Esercizio extra">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onAdd(name, group, Math.min(Math.max(Number(sets) || 3, 1), 10));
          setName('');
        }}
      >
        <Input label="Nome esercizio" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div>
          <div className="section-title">Gruppo muscolare</div>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                aria-pressed={g === group}
                className={`h-10 rounded-full border px-4 text-sm font-semibold ${
                  g === group ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <Input label="Serie" kind="number" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, ''))} />
        <Button type="submit" size="lg" fullWidth disabled={!valid}>
          Aggiungi
        </Button>
      </form>
    </Modal>
  );
}

const READINESS_QUESTIONS = [
  { key: 'sleep', label: 'Come hai dormito?', options: ['😫 Male', '😐 Così così', '😴 Bene'] },
  { key: 'energy', label: 'Livello di energia', options: ['🪫 Basso', '🙂 Normale', '⚡ Alto'] },
  { key: 'soreness', label: 'Indolenzimento muscolare', options: ['🤕 Molto', '😌 Poco', '💪 Niente'] },
] as const;

/** Check di prontezza pre-allenamento: 3 domande, 3 tocchi. */
function ReadinessModal({
  open,
  onPick,
  pains,
  todayNames,
  onResolved,
}: {
  open: boolean;
  onPick: (r: 'low' | 'normal' | 'high') => void;
  pains: PainInfo[];
  todayNames: string[];
  onResolved: (part: string) => void;
}) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [painState, setPainState] = useState<Record<string, 'ok' | 'still'>>({});
  const complete = READINESS_QUESTIONS.every((q) => answers[q.key] != null);
  const score = READINESS_QUESTIONS.reduce((a, q) => a + (answers[q.key] ?? 1), 0); // 0..6
  const result = score <= 2 ? 'low' : score >= 5 ? 'high' : 'normal';
  return (
    <Modal open={open} onClose={() => onPick('normal')} title="Come ti senti oggi?">
      <p className="-mt-1 mb-4 text-sm text-fg-3">Adattiamo i carichi suggeriti alla tua giornata.</p>
      {pains.map((p) => {
        const risky = exercisesStressing(p.part, todayNames);
        const st = painState[p.part];
        return (
          <div key={p.part} className="mb-4 rounded-lg border border-danger/30 bg-danger-bg p-3">
            <div className="text-base font-semibold text-fg">🩹 Come va {PAIN_LABEL[p.part]}?</div>
            <p className="mt-0.5 text-sm text-fg-2">L'ultima volta ({new Date(p.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}) hai segnalato un fastidio.</p>
            {!st && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className="h-11 rounded-md border border-line bg-surface-2 text-sm font-semibold text-fg" onClick={() => (onResolved(p.part), setPainState((x) => ({ ...x, [p.part]: 'ok' })))}>
                  ✅ Passato
                </button>
                <button type="button" className="h-11 rounded-md border border-danger/40 bg-surface-2 text-sm font-semibold text-fg" onClick={() => setPainState((x) => ({ ...x, [p.part]: 'still' }))}>
                  😣 Ancora un po'
                </button>
              </div>
            )}
            {st === 'ok' && <p className="mt-2 text-sm text-accent-400">Ottimo! Il coach lo segna come passato.</p>}
            {st === 'still' && (
              <div className="mt-2 space-y-2 text-sm text-fg-2">
                {risky.length ? (
                  <p>
                    Oggi caricano {PAIN_LABEL[p.part]}: <strong className="text-fg">{risky.join(', ')}</strong>. Riduci il carico del 20-30%, movimenti controllati e fermati se il dolore aumenta.
                  </p>
                ) : (
                  <p>Gli esercizi di oggi non la caricano molto: procedi con attenzione e fermati se il dolore aumenta.</p>
                )}
                <p className="text-xs text-fg-3">Se il dolore dura più di 1-2 settimane o peggiora, senti un medico o un fisioterapista.</p>
                {risky.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/coach?tab=chat&q=${encodeURIComponent(`${PAIN_LABEL[p.part].charAt(0).toUpperCase()}${PAIN_LABEL[p.part].slice(1)} mi dà ancora fastidio. Oggi ho ${risky.join(', ')}: con cosa li sostituisco per oggi?`)}`,
                      )
                    }
                  >
                    Chiedi al coach un'alternativa
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="space-y-4">
        {READINESS_QUESTIONS.map((q) => (
          <div key={q.key}>
            <div className="mb-2 text-base font-semibold text-fg">{q.label}</div>
            <div className="grid grid-cols-3 gap-2">
              {q.options.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={answers[q.key] === i}
                  onClick={() => setAnswers((a) => ({ ...a, [q.key]: i }))}
                  className={`h-12 rounded-md border text-sm font-semibold ${
                    answers[q.key] === i ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {complete && (
        <p className="mt-4 text-sm text-fg-2">
          {result === 'low'
            ? '🔋 Giornata impegnativa: ridurremo i carichi suggeriti del 10%.'
            : result === 'high'
              ? '🚀 Sei in gran forma: prova a superare i target!'
              : '👍 Tutto nella norma: si segue il piano.'}
        </p>
      )}
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
        <Button variant="ghost" onClick={() => onPick('normal')}>
          Salta
        </Button>
        <Button disabled={!complete} onClick={() => onPick(result)}>
          Inizia l'allenamento
        </Button>
      </div>
    </Modal>
  );
}
