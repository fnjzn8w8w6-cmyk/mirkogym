import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { authErrorMessage, continueAnonymously } from '@/lib/auth';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { AccountModal, type AccountMode } from '../modals/AccountModal';
import { Logo } from './Screens';

/** Mostrata dopo "Esci": accedi al tuo account oppure usa l'app senza account. */
export function AuthScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<AccountMode | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <Logo size={80} />
      <h1 className="mt-6 text-3xl text-fg">MirkoGym</h1>
      <p className="mt-2 text-lg font-medium text-fg-2">Accedi per ritrovare allenamenti, progressi e scheda.</p>
      <div className="mt-8 w-full space-y-3">
        <Button size="lg" fullWidth icon={<LogIn className="h-5 w-5" />} onClick={() => setMode('login')}>
          Accedi
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="ghost"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await continueAnonymously();
            } catch (e) {
              toast.error(authErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          Continua senza account
        </Button>
      </div>
      <AccountModal open={mode !== null} mode={mode ?? 'login'} onClose={() => setMode(null)} onModeChange={setMode} />
    </div>
  );
}
