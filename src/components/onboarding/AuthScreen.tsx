import { useState } from 'react';
import { BarChart3, Dumbbell, LogIn, ShieldCheck, Trophy, UserPlus } from 'lucide-react';
import { useData } from '@/hooks/data-context';
import { Button } from '../ui/Button';
import { AccountModal, type AccountMode } from '../modals/AccountModal';
import { Logo } from './Screens';

const FEATURES = [
  { icon: Dumbbell, text: '876 esercizi con demo animata e istruzioni' },
  { icon: BarChart3, text: 'Scheda su misura per obiettivo e livello' },
  { icon: Trophy, text: 'Progressione automatica, PR, livelli e traguardi' },
  { icon: ShieldCheck, text: 'Dati salvati nel tuo account, su ogni dispositivo' },
];

/** Primo avvio / dopo il logout: registrazione o accesso (obbligatori). */
export function AuthScreen() {
  const { isAnonymous, uid, sessions } = useData();
  const [mode, setMode] = useState<AccountMode | null>(null);
  const legacyWithData = Boolean(uid && isAnonymous && sessions.length > 0);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6"
      style={{ paddingTop: 'calc(var(--safe-top) + 40px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Logo size={88} />
        <h1 className="mt-6 font-display text-3xl font-extrabold text-fg">How<span className="text-accent-500">To</span>Gym</h1>
        <p className="mt-2 text-lg font-medium text-fg-2">Il tuo coach di palestra personale.</p>
        <ul className="mt-8 w-full space-y-3 text-left">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-base text-fg-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-glow text-accent-500">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
        {legacyWithData && (
          <p className="mt-6 rounded-md border border-warning/30 bg-warning-bg p-3 text-sm text-fg-2">
            Hai già {sessions.length} allenamenti registrati su questo dispositivo: crea l'account per salvarli.
          </p>
        )}
      </div>
      <div className="space-y-3">
        <Button size="lg" fullWidth icon={<UserPlus className="h-5 w-5" />} onClick={() => setMode('create')}>
          Crea account
        </Button>
        <Button size="lg" fullWidth variant="secondary" icon={<LogIn className="h-5 w-5" />} onClick={() => setMode('login')}>
          Ho già un account
        </Button>
      </div>
      <AccountModal open={mode !== null} mode={mode ?? 'create'} onClose={() => setMode(null)} onModeChange={setMode} />
    </div>
  );
}
