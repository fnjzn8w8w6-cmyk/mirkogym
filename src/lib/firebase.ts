import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** true se le variabili VITE_FIREBASE_* sono state fornite al build. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // Persistenza offline su IndexedDB (sostituto moderno di enableIndexedDbPersistence,
  // deprecato nell'SDK v10+), con supporto multi-tab.
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  // initializeAuth senza popupRedirectResolver: con il solo login anonimo evitiamo di
  // caricare lo script gapi (apis.google.com). L'UID persiste in IndexedDB.
  _auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // Sviluppo locale con Firebase Emulator Suite (`VITE_USE_EMULATORS=true`)
  if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectFirestoreEmulator(_db, '127.0.0.1', 8080);
    connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`Firebase non configurato: ${name} non disponibile`);
  return value;
}

export const db = (): Firestore => required(_db, 'Firestore');
export const auth = (): Auth => required(_auth, 'Auth');
