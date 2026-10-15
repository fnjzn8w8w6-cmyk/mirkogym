import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { NewBadge } from '@/components/ui/Help';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';
import { photoId, usePhotos } from '@/hooks/use-photos';
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

/** Pulsante e finestra "Foto obiettivo" (prova tecnica con Puter.js). */
export function GoalPhotoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-left text-sm font-semibold text-fg">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
        <span className="flex-1">Foto obiettivo con l'AI (prova)</span>
        <NewBadge />
      </button>
      {open && <GoalPhotoModal onClose={() => setOpen(false)} />}
    </>
  );
}

type State = { kind: 'idle' } | { kind: 'busy'; step: string } | { kind: 'done'; image: string; model: string } | { kind: 'error'; message: string };

function GoalPhotoModal({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const p = useEffectiveProfile();
  const { photos, images } = usePhotos();
  const plan = settings.goalPlan;
  const [pick, setPick] = useState(0);
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

  const save = async () => {
    if (state.kind !== 'done') return;
    const blob = await (await fetch(state.image)).blob();
    const file = new File([blob], 'foto-obiettivo.png', { type: blob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => undefined);
    else {
      const a = document.createElement('a');
      a.href = state.image;
      a.download = 'foto-obiettivo.png';
      a.click();
    }
  };

  const busy = state.kind === 'busy';
  return (
    <Modal open onClose={busy ? () => undefined : onClose} title="Foto obiettivo (prova)" dismissible={!busy}>
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
                    {state.kind === 'done' ? (
                      <img src={state.image} alt="Foto obiettivo generata dall'AI" className="h-full w-full object-cover" />
                    ) : busy ? (
                      <span className="animate-pulse px-3 text-center text-xs">✨ {state.step}</span>
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
                {puterReady === 'loading' ? 'Preparo l’AI…' : state.kind === 'done' ? 'Rigenera' : 'Genera'}
              </Button>
              {state.kind === 'done' && (
                <Button variant="secondary" onClick={() => void save()}>
                  Salva
                </Button>
              )}
            </div>
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
