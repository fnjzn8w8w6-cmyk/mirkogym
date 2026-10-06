import { useEffect, useState } from 'react';
import { AlertTriangle, Mail, ShieldCheck } from 'lucide-react';
import { useData } from '@/hooks/data-context';
import { authErrorMessage, createAccount, resetPassword, setRemember, signIn } from '@/lib/auth';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export type AccountMode = 'create' | 'login' | 'reset';

interface Props {
  open: boolean;
  mode: AccountMode;
  onClose: () => void;
  onModeChange: (m: AccountMode) => void;
}

const titles: Record<AccountMode, string> = {
  create: 'Crea il tuo account',
  login: 'Accedi',
  reset: 'Recupera password',
};

export function AccountModal({ open, mode, onClose, onModeChange }: Props) {
  const toast = useToast();
  const { refreshUser, isAnonymous, sessions, bodyLogs, uid } = useData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRememberState] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirm('');
    setError(null);
    setBusy(false);
  }, [open, mode]);

  const hasLocalData = Boolean(uid) && isAnonymous && (sessions.length > 0 || bodyLogs.length > 0);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const valid =
    mode === 'reset'
      ? emailOk
      : mode === 'login'
        ? emailOk && password.length > 0
        : emailOk && password.length >= 6 && password === confirm;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (mode !== 'reset') await setRemember(remember);
      if (mode === 'create') {
        await createAccount(email, password);
        refreshUser();
        toast.success('Account creato: i tuoi dati sono al sicuro');
        onClose();
      } else if (mode === 'login') {
        await signIn(email, password);
        toast.success('Accesso effettuato');
        onClose();
      } else {
        await resetPassword(email);
        toast.success('Email per reimpostare la password inviata');
        onModeChange('login');
      }
      if (mode === 'reset') setBusy(false);
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titles[mode]}
      dismissible={!busy}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={!valid} onClick={submit}>
          {mode === 'create' ? 'Crea account' : mode === 'login' ? 'Accedi' : 'Invia email'}
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'create' && uid && isAnonymous && (
          <div className="flex gap-3 rounded-md border border-success/25 bg-success-bg p-3 text-sm text-fg-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
            <span>
              Tutto quello che hai già registrato resta nel tuo account. Potrai accedere da qualsiasi dispositivo e non
              perderai i dati se cancelli l'app o la cronologia di Safari.
            </span>
          </div>
        )}
        {mode === 'login' && hasLocalData && (
          <div className="flex gap-3 rounded-md border border-warning/25 bg-warning-bg p-3 text-sm text-fg-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
            <span>
              Su questo dispositivo ci sono dati registrati senza account: non verranno uniti a quelli dell'account. Se ti
              servono, esportali prima da Impostazioni → Dati.
            </span>
          </div>
        )}
        {mode === 'reset' && (
          <p className="text-base text-fg-2">Ti mandiamo un link per scegliere una nuova password.</p>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'reset' && (
          <Input
            label={mode === 'create' ? 'Password (min. 6 caratteri)' : 'Password'}
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {mode === 'create' && (
          <Input
            label="Ripeti password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        {mode === 'create' && confirm.length > 0 && password !== confirm && (
          <p className="text-sm text-danger">Le password non coincidono.</p>
        )}
        {mode !== 'reset' && (
          <label className="flex items-center gap-3 text-base text-fg">
            <input type="checkbox" className="h-5 w-5 accent-[#3DDC84]" checked={remember} onChange={(e) => setRememberState(e.target.checked)} />
            Rimani connesso
          </label>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {/* submit con Invio da tastiera */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />

        <div className="flex flex-col items-center gap-1 pt-1 text-sm">
          {mode === 'login' && (
            <>
              <button type="button" className="h-11 font-semibold text-accent-400" onClick={() => onModeChange('reset')}>
                Password dimenticata?
              </button>
              {(isAnonymous || !uid) && (
                <button type="button" className="h-11 text-fg-2" onClick={() => onModeChange('create')}>
                  Non hai un account? <span className="font-semibold text-accent-400">Crealo</span>
                </button>
              )}
            </>
          )}
          {mode === 'create' && (
            <button type="button" className="h-11 text-fg-2" onClick={() => onModeChange('login')}>
              Hai già un account? <span className="font-semibold text-accent-400">Accedi</span>
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="flex h-11 items-center gap-1.5 text-fg-2" onClick={() => onModeChange('login')}>
              <Mail className="h-4 w-4" aria-hidden /> Torna all'accesso
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
