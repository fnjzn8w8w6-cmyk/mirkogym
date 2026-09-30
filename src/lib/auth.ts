import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from './firebase';

/** Dopo un "Esci" non ricreiamo in automatico un utente anonimo: mostriamo la schermata di accesso. */
const SIGNED_OUT_KEY = 'mirkogym.signedOut';

function isSignedOutFlag(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}
function setSignedOutFlag(v: boolean): void {
  try {
    if (v) localStorage.setItem(SIGNED_OUT_KEY, '1');
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignorato */
  }
}

/** Dati locali legati all'utente corrente (bozza sessione, timer): da pulire al cambio account. */
function clearLocalUserState(): void {
  try {
    localStorage.removeItem('mirkogym.activeSession');
    localStorage.removeItem('mirkogym.restTimer');
  } catch {
    /* ignorato */
  }
}

/**
 * Osserva lo stato di autenticazione. Se non c'è nessun utente (primo avvio) crea un utente
 * anonimo, così l'app è subito usabile; l'utente può poi trasformarlo in un account con email.
 * Dopo un logout esplicito invece restituisce `null` (schermata di accesso).
 */
export function watchUser(onUser: (user: User | null) => void, onError: (err: Error) => void): () => void {
  return onAuthStateChanged(
    auth(),
    (user) => {
      if (user) {
        onUser(user);
        return;
      }
      if (isSignedOutFlag()) {
        onUser(null);
        return;
      }
      signInAnonymously(auth()).catch((e: unknown) => onError(e instanceof Error ? e : new Error(String(e))));
    },
    (err) => onError(err),
  );
}

/** Usa l'app senza account (utente anonimo, dati legati a questo dispositivo). */
export async function continueAnonymously(): Promise<void> {
  setSignedOutFlag(false);
  clearLocalUserState();
  await signInAnonymously(auth());
}

/**
 * Crea un account email/password. Se l'utente attuale è anonimo lo COLLEGA all'account:
 * l'UID non cambia e tutti i dati già registrati restano.
 */
export async function createAccount(email: string, password: string): Promise<User> {
  const current = auth().currentUser;
  const credential = EmailAuthProvider.credential(email.trim(), password);
  if (current?.isAnonymous) {
    const res = await linkWithCredential(current, credential);
    await res.user.reload();
    setSignedOutFlag(false);
    return res.user;
  }
  throw new Error('Sei già collegato a un account');
}

/** Accede a un account esistente (su un nuovo dispositivo o dopo un logout). */
export async function signIn(email: string, password: string): Promise<User> {
  clearLocalUserState();
  const res = await signInWithEmailAndPassword(auth(), email.trim(), password);
  setSignedOutFlag(false);
  return res.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email.trim());
}

export async function logOut(): Promise<void> {
  setSignedOutFlag(true);
  clearLocalUserState();
  await signOut(auth());
}

/** Messaggi d'errore Firebase Auth in italiano. */
export function authErrorMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : '';
  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'Esiste già un account con questa email. Usa "Accedi".';
    case 'auth/invalid-email':
      return 'Indirizzo email non valido.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Password troppo debole: usa almeno 6 caratteri.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Email o password non corretti.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Connessione assente: serve internet per accedere.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Accesso con email non attivo su Firebase (vedi SETUP.md, passo 3).';
    case 'auth/unauthorized-domain':
      return 'Dominio non autorizzato su Firebase (vedi SETUP.md, passo 4).';
    case 'auth/missing-password':
      return 'Inserisci la password.';
    default:
      return e instanceof Error ? e.message : 'Errore sconosciuto';
  }
}
