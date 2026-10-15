import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { SwitchCamera, Timer, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ghostFromMask } from '@/lib/body-align';
import { NewBadge } from '@/components/ui/Help';

const TIMERS = [0, 3, 5, 10] as const;
const TIMER_KEY = 'vl.camera.timer';
const FACING_KEY = 'vl.camera.facing';
const GHOST_KEY = 'vl.camera.ghost';

const readNum = (k: string, def: number) => {
  try {
    const v = Number(localStorage.getItem(k));
    return Number.isFinite(v) && localStorage.getItem(k) != null ? v : def;
  } catch {
    return def;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* navigazione privata */
  }
};

/** Bip breve per il conto alla rovescia (più acuto all'ultimo secondo). */
function beep(ctx: AudioContext | null, last: boolean) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = last ? 1320 : 880;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (last ? 0.35 : 0.15));
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.4);
}

/**
 * Fotocamera dentro l'app con autoscatto: appoggi il telefono, scegli 3/5/10 secondi e ti metti in posa.
 * Restituisce la foto come data URL JPEG (lato lungo max 1000 px).
 * `ghost`: sagoma del corpo dell'ultima foto, sovrapposta all'anteprima per metterti alla stessa distanza e nella stessa posa.
 */
export function TimerCamera({ open, onClose, onShot, ghost }: { open: boolean; onClose: () => void; onShot: (dataUrl: string) => void; ghost?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>(() => (readNum(FACING_KEY, 0) === 1 ? 'environment' : 'user'));
  const [timer, setTimer] = useState<number>(() => readNum(TIMER_KEY, 5));
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState<string | null>(null);
  const [showGhost, setShowGhost] = useState(() => readNum(GHOST_KEY, 1) === 1);

  // l'audio dei bip si chiude con la fotocamera (i telefoni ne permettono pochi aperti)
  useEffect(() => {
    if (open) return;
    void audioRef.current?.close().catch(() => undefined);
    audioRef.current = null;
  }, [open]);
  useEffect(() => () => void audioRef.current?.close().catch(() => undefined), []);

  // contorno della sagoma (una volta per foto)
  useEffect(() => {
    setOutline(null);
    if (!open || !ghost) return;
    let alive = true;
    const img = new Image();
    img.onload = () => void ghostFromMask(ghost, img.width * 2, img.height * 2).then((u) => alive && setOutline(u), () => undefined);
    img.src = ghost;
    return () => {
      alive = false;
    };
  }, [open, ghost]);

  // avvia/ferma la fotocamera
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (alive) setError('Non riesco ad aprire la fotocamera. Controlla il permesso nelle impostazioni del telefono, oppure scegli una foto dalla galleria.');
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing]);

  // conto alla rovescia
  useEffect(() => {
    if (count == null) return;
    if (count === 0) {
      shoot();
      return;
    }
    beep(audioRef.current, count === 1);
    const t = window.setTimeout(() => setCount((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => {
    if (!open) setCount(null);
  }, [open]);

  const shoot = () => {
    const v = videoRef.current;
    setCount(null);
    if (!v || !v.videoWidth) return;
    const k = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext('2d')!;
    // con la fotocamera frontale la foto è come la vedi nell'anteprima (a specchio)
    if (facing === 'user') {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    onShot(c.toDataURL('image/jpeg', 0.8));
  };

  const start = () => {
    // l'audio si può attivare solo dopo un tocco
    try {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    } catch {
      audioRef.current = null;
    }
    if (timer === 0) shoot();
    else setCount(timer);
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-label="Fotocamera">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn('absolute inset-0 h-full w-full object-cover', facing === 'user' && '-scale-x-100')}
      />
      {outline && showGhost && (
        <img src={outline} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90 drop-shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
      )}
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

      <div className="relative z-10 flex items-center justify-between px-4" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
        <button type="button" onClick={onClose} aria-label="Chiudi fotocamera" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
          <X className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-1 rounded-full bg-black/50 p-1" role="radiogroup" aria-label="Autoscatto">
          <Timer className="ml-2 h-4 w-4 text-white/80" aria-hidden />
          {TIMERS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={timer === t}
              disabled={count != null}
              onClick={() => {
                setTimer(t);
                write(TIMER_KEY, String(t));
              }}
              className={cn('h-9 min-w-[44px] rounded-full px-2 text-sm font-bold', timer === t ? 'bg-accent-500 text-onaccent' : 'text-white')}
            >
              {t === 0 ? 'No' : `${t}s`}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={count != null}
          onClick={() => {
            const next = facing === 'user' ? 'environment' : 'user';
            setFacing(next);
            write(FACING_KEY, next === 'environment' ? '1' : '0');
          }}
          aria-label="Cambia fotocamera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <SwitchCamera className="h-6 w-6" />
        </button>
      </div>

      {outline && (
        <button
          type="button"
          aria-pressed={showGhost}
          onClick={() => {
            setShowGhost(!showGhost);
            write(GHOST_KEY, showGhost ? '0' : '1');
          }}
          className="relative z-10 mx-auto mt-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-sm text-white"
        >
          <span>{showGhost ? 'Mettiti dentro la sagoma dell’ultima foto' : 'Sagoma dell’ultima foto'}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', showGhost ? 'bg-accent-500 text-onaccent' : 'bg-white/20 text-white')}>{showGhost ? 'ON' : 'OFF'}</span>
          <NewBadge className="ml-0" />
        </button>
      )}

      {count != null && count > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-live="assertive">
          <motion.span
            key={count}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="font-display text-[160px] font-extrabold leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
          >
            {count}
          </motion.span>
        </div>
      )}

      {error && <p className="relative z-10 mx-4 mt-6 rounded-md bg-black/70 p-3 text-center text-base text-white">{error}</p>}

      <div className="relative z-10 mt-auto flex flex-col items-center gap-3 pb-6" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <p className="rounded-full bg-black/50 px-3 py-1 text-sm text-white">
          {count != null ? 'Mettiti in posa…' : timer ? `Appoggia il telefono: scatta dopo ${timer} secondi` : 'Scatto immediato'}
        </p>
        <button
          type="button"
          onClick={() => (count != null ? setCount(null) : start())}
          disabled={Boolean(error)}
          aria-label={count != null ? 'Annulla autoscatto' : 'Scatta'}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          <span className={cn('block rounded-full transition-all', count != null ? 'h-7 w-7 rounded-md bg-danger' : 'h-14 w-14 bg-white')} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
