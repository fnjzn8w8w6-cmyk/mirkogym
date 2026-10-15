import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { NewBadge } from '@/components/ui/Help';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';
import { photoId, usePhotos } from '@/hooks/use-photos';
import { useGoalPhotos } from '@/hooks/use-goal-photos';
import { bodyFatNow } from '@/lib/bodyfat-estimate';
import { composition } from '@/lib/metabolism';
import { PHASE_EMOJI } from '@/lib/goal-plan';
import { ensurePuterUser, generateGoalPhoto, goalPrompt, loadPuter, projectPhases } from '@/lib/goal-photo';
import { cn } from '@/lib/cn';

const CONSENT = 'vl.goalphoto.consent';
const kg = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const delta = (v: number) => (Math.abs(v) < 0.05 ? 'invariata' : `${v > 0 ? '+' : '−'}${kg(Math.abs(v))} kg`);
const readConsent = () => {
  try {
    return localStorage.getItem(CONSENT) === '1';
  } catch {
    return false;
  }
};

/** Foto obiettivo nella card dell'obiettivo: quelle salvate (sempre visibili) e il pulsante per crearne. */
export function GoalPhotoButton() {
  const { settings } = useSettings();
  const { goalPhotos } = useGoalPhotos();
  const [open, setOpen] = useState<number | null>(null);
  const plan = settings.goalPlan;
  // l'ultima foto per ogni fase che resta da fare
  const saved = useMemo(() => {
    if (!plan) return [];
    return plan.phases
      .map((ph, i) => ({ ph, i, photo: goalPhotos.find((g) => g.phaseIndex === i && g.phaseType === ph.type) }))
      .filter((x) => x.i >= plan.current && x.photo);
  }, [plan, goalPhotos]);
  return (
    <>
      {saved.length > 0 ? (
        <div className="rounded-md border border-violet-500/40 bg-violet-500/10 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wider text-fg-3">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" aria-hidden /> Le tue foto obiettivo <NewBadge />
          </div>
          <div className="flex gap-2">
            {saved.map(({ ph, i, photo }) => (
              <button key={i} type="button" onClick={() => setOpen(i)} className="w-24 shrink-0 text-left" aria-label={`Foto obiettivo: fine ${ph.label}`}>
                <img src={photo!.thumb} alt="" className="aspect-[3/4] w-full rounded-md object-cover ring-1 ring-violet-500/50" />
                <span className="mt-0.5 block truncate text-xs font-semibold text-fg">Fine {ph.label.toLowerCase()}</span>
                <span className="block text-[11px] text-fg-3">
                  {kg(photo!.weight)} kg · {Math.round(photo!.bf)}%
                </span>
              </button>
            ))}
            <button type="button" onClick={() => setOpen(plan?.current ?? 0)} className="flex w-24 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-violet-500/50 text-xs font-semibold text-violet-400">
              <Sparkles className="mb-1 h-5 w-5" aria-hidden />
              Crea o rigenera
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(plan?.current ?? 0)} className="flex w-full items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-left text-sm font-semibold text-fg">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
          <span className="flex-1">Foto obiettivo con l'AI</span>
          <NewBadge />
        </button>
      )}
      {open != null && <GoalPhotoModal startPhase={open} onClose={() => setOpen(null)} />}
    </>
  );
}

type State = { kind: 'idle' } | { kind: 'busy'; step: string } | { kind: 'done'; image: string; model: string } | { kind: 'error'; message: string };

function GoalPhotoModal({ onClose, startPhase }: { onClose: () => void; startPhase: number }) {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const p = useEffectiveProfile();
  const { photos, images } = usePhotos();
  const plan = settings.goalPlan;
  const { goalPhotos, image, save: keep, remove } = useGoalPhotos();
  const [pick, setPick] = useState(Math.max(0, startPhase - (plan?.current ?? 0)));
  const [savedImg, setSavedImg] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(readConsent);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [puterReady, setPuterReady] = useState<'loading' | 'ok' | string>('loading');
  const [photo, setPhoto] = useState<string | null>(null);

  // Puter si carica subito: al tocco su "Genera" la sua finestra deve aprirsi senza attese
  useEffect(() => {
    loadPuter().then(
      () => setPuterReady('ok'),
      (e: Error) => setPuterReady(e.message),
    );
  }, []);

  // ultima foto del check-in (o, se manca, l'ultima foto del corpo)
  const source = useMemo(() => {
    const sorted = [...photos].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.find((x) => x.kind === 'checkin') ?? sorted[0] ?? null;
  }, [photos]);
  useEffect(() => {
    if (!source) return;
    void images(photoId(source)).then((im) => setPhoto(im?.front ?? null));
  }, [source, images]);

  const projections = useMemo(() => {
    if (!p || !plan) return [];
    const bf = bodyFatNow(bodyLogs)?.value ?? composition(p).bf.value;
    return projectPhases(p, { weight: p.weightKg, bf }, plan.phases, plan.current);
  }, [p, plan, bodyLogs]);
  const pr = projections[Math.min(pick, projections.length - 1)];
  // la foto di partenza è sempre quella di oggi
  const today = projections[0]?.from;
  // foto obiettivo già salvata per questa fase (la più recente)
  const saved = pr ? goalPhotos.find((g) => g.phaseIndex === pr.index && g.phaseType === pr.phase.type) ?? null : null;
  useEffect(() => {
    setSavedImg(null);
    if (saved) void image(saved.id).then(setSavedImg);
  }, [saved, image]);
  // creata con numeri diversi da quelli di adesso: conviene rigenerarla
  const outdated = saved && pr && (Math.abs(saved.weight - pr.to.weight) >= 1 || Math.abs(saved.bf - pr.to.bf) >= 1);

  const generate = async () => {
    const puter = window.puter;
    if (!puter || !photo || !pr || !p) return;
    try {
      localStorage.setItem(CONSENT, '1');
    } catch {
      /* il consenso vale comunque per questa volta */
    }
    try {
      setState({ kind: 'busy', step: 'Accesso a Puter…' });
      // prima cosa dopo il tocco: la finestra di Puter si apre solo durante un tocco
      await ensurePuterUser(puter);
      setState({ kind: 'busy', step: "L'AI sta creando la tua foto obiettivo… (fino a 1 minuto)" });
      // la foto è quella di oggi: l'AI parte dal fisico di oggi e arriva a fine fase (anche passando per le fasi prima)
      const weeks = projections.slice(0, projections.indexOf(pr) + 1).reduce((t, x) => t + x.weeks, 0);
      const res = await generateGoalPhoto(puter, photo, goalPrompt({ ...pr, from: today, weeks }, p.sex === 'f', projections.slice(0, projections.indexOf(pr) + 1).map((x) => x.phase.type)));
      setState({ kind: 'done', ...res });
      // resta nell'app: si rivede ogni volta dalla card dell'obiettivo
      setSavedNote('Salvo la foto nell’app…');
      const id = await keep(
        { phaseIndex: pr.index, phaseType: pr.phase.type, phaseLabel: pr.phase.label, weight: pr.to.weight, bf: pr.to.bf, fromWeight: today.weight, fromBf: today.bf, model: res.model },
        res.image,
      );
      setSavedNote(id ? '✅ Salvata nell’app: la ritrovi nella card dell’obiettivo.' : 'Non sono riuscito a salvarla nell’app: usa "Salva sul telefono".');
    } catch (e) {
      const raw = e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e);
      const message = /popup_blocked/.test(raw)
        ? 'La finestra di Puter è stata bloccata: riprova toccando di nuovo "Genera".'
        : /auth_window_closed/.test(raw)
          ? 'La finestra di Puter è stata chiusa prima di finire: riprova.'
          : /insufficient|funds|credit|quota|limit|402|429/i.test(raw)
            ? 'Quota gratuita di Puter esaurita per oggi (o per questo mese).'
            : 'Non sono riuscito a generare la foto.';
      setState({ kind: 'error', message: `${message}\nDettagli: ${raw.slice(0, 400)}` });
    }
  };

  const shown = state.kind === 'done' ? state.image : savedImg;
  const save = async () => {
    if (!shown) return;
    const blob = await (await fetch(shown)).blob();
    const file = new File([blob], 'foto-obiettivo.png', { type: blob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => undefined);
    else {
      const a = document.createElement('a');
      a.href = shown;
      a.download = 'foto-obiettivo.png';
      a.click();
    }
  };

  const busy = state.kind === 'busy';
  return (
    <Modal open onClose={busy ? () => undefined : onClose} title="Foto obiettivo" dismissible={!busy}>
      <div className="space-y-3 text-sm text-fg-2">
        {!plan || !pr ? (
          <p>Imposta prima il tuo obiettivo a fasi: la foto si basa sul peso e sulla massa grassa di fine fase.</p>
        ) : (
          <>
            {projections.length > 1 && (
              <div className="flex rounded-md bg-surface-2 p-1" role="radiogroup" aria-label="Fase">
                {projections.map((x, i) => (
                  <button
                    key={x.index}
                    type="button"
                    role="radio"
                    aria-checked={i === pick}
                    disabled={busy}
                    onClick={() => {
                      setPick(i);
                      setState({ kind: 'idle' });
                      setSavedNote(null);
                    }}
                    className={cn('flex-1 rounded-sm px-2 py-2 text-center font-semibold', i === pick ? 'bg-surface-3 text-fg' : 'text-fg-3')}
                  >
                    Fine {x.phase.label.toLowerCase()}
                    <span className="block text-xs font-normal">
                      {kg(x.to.weight)} kg · {Math.round(x.to.bf)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p>
              {PHASE_EMOJI[pr.phase.type]} {pr === projections[0] ? 'Da oggi' : 'Da fine fase precedente'}: <strong className="text-fg">{kg(pr.from.weight)} kg · {Math.round(pr.from.bf)}%</strong> →{' '}
              <strong className="text-fg">{kg(pr.to.weight)} kg · {Math.round(pr.to.bf)}%</strong>: massa magra {delta(pr.to.lean - pr.from.lean)}, grasso{' '}
              {delta(pr.to.fat - pr.from.fat)}.
            </p>
            {pr.note && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-fg-2">⚠️ {pr.note}</p>}

            {!source || !photo ? (
              <p className="rounded-md bg-surface-2 px-3 py-2">{!source ? 'Serve una tua foto del corpo: fai un check-in con la foto frontale.' : 'Carico la tua ultima foto…'}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <figure>
                  <img src={photo} alt="La tua ultima foto" className="aspect-[3/4] w-full rounded-md object-cover" />
                  <figcaption className="mt-1 text-center text-xs">
                    <strong className="text-fg">Oggi</strong> · {kg(today.weight)} kg · {Math.round(today.bf)}%
                  </figcaption>
                </figure>
                <figure>
                  <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md bg-surface-2 ring-2 ring-violet-500/50">
                    {busy ? (
                      <span className="animate-pulse px-3 text-center text-xs">✨ {state.step}</span>
                    ) : shown ? (
                      <img src={shown} alt="Foto obiettivo generata dall'AI" className="h-full w-full object-cover" />
                    ) : saved ? (
                      <span className="animate-pulse px-3 text-center text-xs">Carico la foto salvata…</span>
                    ) : (
                      <span className="px-3 text-center text-xs text-fg-3">La foto obiettivo comparirà qui</span>
                    )}
                  </div>
                  <figcaption className="mt-1 text-center text-xs">
                    <strong className="text-violet-400">Fine {pr.phase.label.toLowerCase()}</strong> · {kg(pr.to.weight)} kg · {Math.round(pr.to.bf)}%
                  </figcaption>
                </figure>
              </div>
            )}

            {saved && state.kind !== 'done' && !busy && (
              <p className="text-xs text-fg-3">
                Creata il {new Date(saved.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} per {kg(saved.weight)} kg · {Math.round(saved.bf)}%.
                {outdated && <span className="text-warning"> Il piano ora dice {kg(pr.to.weight)} kg · {Math.round(pr.to.bf)}%: rigenerala per vederti con i numeri aggiornati.</span>}
              </p>
            )}
            {savedNote && <p className="text-xs text-fg-2">{savedNote}</p>}
            {state.kind === 'error' && <p className="whitespace-pre-line rounded-md bg-danger/10 px-3 py-2 text-xs text-fg">❌ {state.message}</p>}

            {!consent ? (
              <label className="flex gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-accent-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Ho capito che la mia foto viene inviata a <strong className="text-fg">Puter</strong> (puter.com) e al modello immagini di <strong className="text-fg">Google</strong> per
                  creare la foto obiettivo. La prima volta Puter apre una finestra e crea un utente temporaneo anonimo: non serve registrarsi. È gratis entro la quota di Puter.
                </span>
              </label>
            ) : (
              <p className="text-xs text-fg-3">La foto viene inviata a Puter e a Google solo quando tocchi "Genera". Gratis entro la quota di Puter.</p>
            )}

            <div className="flex gap-2">
              <Button
                fullWidth
                icon={<Sparkles className="h-4 w-4" />}
                loading={busy}
                disabled={!consent || !photo || puterReady !== 'ok' || busy}
                onClick={() => void generate()}
              >
                {puterReady === 'loading' ? 'Preparo l’AI…' : state.kind === 'done' || saved ? 'Rigenera' : 'Genera'}
              </Button>
              {shown && (
                <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => void save()} disabled={busy}>
                  Sul telefono
                </Button>
              )}
            </div>
            {saved && !busy && (
              <button
                type="button"
                className="text-xs font-semibold text-danger"
                onClick={async () => {
                  await remove(saved.id);
                  setState({ kind: 'idle' });
                  setSavedNote('Foto obiettivo eliminata dall’app.');
                }}
              >
                Elimina questa foto obiettivo dall'app
              </button>
            )}
            {puterReady !== 'ok' && puterReady !== 'loading' && <p className="text-xs text-danger">Puter non si carica: {puterReady}</p>}
            <p className="text-xs text-fg-3">
              È una simulazione dell'AI basata sui numeri realistici del tuo piano: il risultato vero dipende da allenamento, dieta e genetica. {state.kind === 'done' ? `Modello: ${state.model}.` : ''}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
