import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { cn } from '@/lib/cn';
import { callAI } from '@/lib/ai';
import { useToast } from './Toast';

/**
 * Dettatura vocale: il testo detto viene aggiunto al campo (la risposta del coach resta scritta).
 * 1) riconoscimento vocale del telefono/browser (gratuito, in tempo reale);
 * 2) se non disponibile (es. web app su iPhone) registra l'audio e lo trascrive Gemini (1 richiesta).
 */

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const SpeechRec = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

async function transcribe(blob: Blob): Promise<string> {
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('Audio non leggibile'));
    r.readAsDataURL(blob);
  });
  const mimeType = (blob.type || 'audio/mp4').split(';')[0];
  const text = await callAI(
    [
      { text: 'Trascrivi fedelmente in italiano ciò che dice la persona nell’audio. Rispondi SOLO con il testo trascritto, senza commenti.' },
      { inlineData: { mimeType, data: base64 } },
    ],
    { prefer: 'lite', temperature: 0, label: 'Trascrivo…' },
  );
  return text.trim();
}

export function MicButton({ onText, className, size = 'md' }: { onText: (text: string) => void; className?: string; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'listening' | 'recording' | 'working'>('idle');
  const recRef = useRef<Rec | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const useRecorder = useRef(false);

  useEffect(
    () => () => {
      recRef.current?.stop();
      mediaRef.current?.state === 'recording' && mediaRef.current.stop();
    },
    [],
  );

  const startRecorder = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Dettatura non disponibile su questo dispositivo');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('working');
        try {
          const text = await transcribe(new Blob(chunks, { type: rec.mimeType }));
          if (text) onText(text);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Trascrizione non riuscita');
        } finally {
          setState('idle');
        }
      };
      mediaRef.current = rec;
      rec.start();
      setState('recording');
      // limite di sicurezza: 60 secondi
      window.setTimeout(() => rec.state === 'recording' && rec.stop(), 60_000);
    } catch {
      toast.error('Microfono non disponibile: consenti l’accesso nelle impostazioni');
      setState('idle');
    }
  };

  const startSpeech = () => {
    const Ctor = SpeechRec();
    if (!Ctor || useRecorder.current) return void startRecorder();
    const rec = new Ctor();
    rec.lang = 'it-IT';
    rec.interimResults = false;
    rec.continuous = true;
    let got = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0].transcript.trim()) {
          got = true;
          onText(r[0].transcript.trim());
        }
      }
    };
    rec.onerror = (e) => {
      // riconoscimento non consentito (es. web app installata su iPhone): passo alla registrazione
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error) && !got) {
        useRecorder.current = true;
        setState('idle');
        void startRecorder();
      }
    };
    rec.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
    recRef.current = rec;
    try {
      rec.start();
      setState('listening');
    } catch {
      useRecorder.current = true;
      void startRecorder();
    }
  };

  const toggle = () => {
    if (state === 'listening') {
      recRef.current?.stop();
      setState('idle');
    } else if (state === 'recording') mediaRef.current?.stop();
    else if (state === 'idle') startSpeech();
  };

  const active = state === 'listening' || state === 'recording';
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === 'working'}
      aria-label={active ? 'Ferma la dettatura' : 'Detta con la voce'}
      aria-pressed={active}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full transition-colors',
        dim,
        active ? 'bg-danger text-white' : 'bg-accent-500 text-onaccent shadow-glow',
        className,
      )}
    >
      {active && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden />}
      {state === 'working' ? <Loader2 className="h-5 w-5 animate-spin" /> : active ? <Square className="relative h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
    </button>
  );
}

/** Aggiunge il testo dettato a quello già scritto. */
export const appendText = (cur: string, add: string) => (cur.trim() ? `${cur.trim()} ${add}` : add);
