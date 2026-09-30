import { motion } from 'framer-motion';
import { AlertOctagon, Settings2 } from 'lucide-react';

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
      width={size}
      height={size}
      alt=""
      className="rounded-[22%] shadow-glow"
    />
  );
}

export function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5" aria-busy="true" aria-label="Caricamento">
      <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}>
        <Logo />
      </motion.div>
      <div className="text-lg text-fg">MirkoGym</div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full w-1/2 rounded-full bg-accent-500"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}

export function FatalError({ error }: { error: Error }) {
  const isRules = /permission|insufficient/i.test(error.message);
  const isAuth = /auth\/(admin-restricted|operation-not-allowed|configuration)/i.test(error.message);
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-bg text-danger">
        <AlertOctagon className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-xl text-fg">Impossibile connettersi</h1>
      <p className="mt-2 max-w-sm text-base text-fg-2">
        {isAuth
          ? "Attiva l'accesso Anonimo in Firebase Console → Authentication → Metodo di accesso."
          : isRules
            ? 'Le regole di sicurezza Firestore bloccano l’accesso. Copia il file firestore.rules in Firebase Console.'
            : 'Controlla la connessione e riprova.'}
      </p>
      <pre className="mt-4 max-w-sm overflow-x-auto rounded-md bg-surface-2 p-3 text-left text-sm text-fg-3">{error.message}</pre>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 h-11 rounded-md bg-accent-500 px-5 font-semibold text-white"
      >
        Riprova
      </button>
    </div>
  );
}

export function SetupRequired() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-6 text-2xl text-fg">Configurazione Firebase mancante</h1>
      <p className="mt-2 text-base text-fg-2">
        L'app è stata compilata senza le variabili <code className="text-accent-400">VITE_FIREBASE_*</code>.
      </p>
      <div className="card mt-6 w-full p-4 text-left text-sm text-fg-2">
        <div className="mb-2 flex items-center gap-2 text-base text-fg">
          <Settings2 className="h-5 w-5 text-accent-500" aria-hidden /> Come risolvere
        </div>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>In locale: copia <code>.env.example</code> in <code>.env.local</code> e compila i valori.</li>
          <li>
            Su GitHub Pages: aggiungi i 6 secret in Settings → Secrets and variables → Actions, poi rilancia il workflow
            di deploy.
          </li>
          <li>Dettagli completi nel file SETUP.md del repository.</li>
        </ol>
      </div>
    </div>
  );
}
