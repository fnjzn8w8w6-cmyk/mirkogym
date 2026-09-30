import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Osserva lo stato di autenticazione; se non c'è utente, esegue il login anonimo.
 * Firebase salva l'UID in IndexedDB, quindi resta lo stesso tra le sessioni.
 */
export function watchAnonymousUser(onUser: (user: User) => void, onError: (err: Error) => void): () => void {
  return onAuthStateChanged(
    auth(),
    (user) => {
      if (user) {
        onUser(user);
        return;
      }
      signInAnonymously(auth()).catch((e: unknown) => onError(e instanceof Error ? e : new Error(String(e))));
    },
    (err) => onError(err),
  );
}
