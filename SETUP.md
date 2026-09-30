# Setup Firebase per MirkoGym

Tempo: ~10 minuti. Serve solo un account Google. Il piano gratuito **Spark** è più che sufficiente.

## 1. Crea il progetto

1. Vai su https://console.firebase.google.com → **Aggiungi progetto**
2. Nome: `mirkogym` (Firebase aggiunge un suffisso, es. `mirkogym-a1b2c`)
3. Google Analytics: puoi disattivarlo → **Crea progetto**

## 2. Registra l'app web e copia la configurazione

1. Nella home del progetto clicca l'icona **Web** (`</>`)
2. Nickname: `MirkoGym` · **non** serve Firebase Hosting → **Registra app**
3. Firebase mostra un blocco `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
   Copia i 6 valori: ti servono per i GitHub Secrets (vedi README) e per `.env.local`.

   | Campo in `firebaseConfig` | Variabile / Secret |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

   Li ritrovi sempre in ⚙️ **Impostazioni progetto → Generali → Le tue app**.

## 3. Attiva i metodi di accesso

1. Menu **Build → Authentication** → **Inizia**
2. Tab **Metodo di accesso** → **Anonimo** → **Attiva** → **Salva**
3. Sempre in **Metodo di accesso** → **Aggiungi nuovo provider** → **Email/password** →
   attiva il primo interruttore (*Email/password*; il "link email" non serve) → **Salva**

**Email/password è obbligatorio**: al primo avvio l'app chiede di creare l'account o di accedere.
L'accesso anonimo serve solo agli utenti delle prime versioni, che creando l'account mantengono i dati.

## 4. Autorizza il dominio di GitHub Pages

1. **Authentication → Impostazioni → Domini autorizzati** → **Aggiungi dominio**
2. Aggiungi: `fnjzn8w8w6-cmyk.github.io`

(`localhost` è già presente per lo sviluppo.)

## 5. Crea il database Firestore

1. Menu **Build → Firestore Database** → **Crea database**
2. Località: `eur3 (europe-west)` o `europe-west8 (Milano)`
3. Modalità: **produzione** → **Crea**

## 6. Imposta le regole di sicurezza

1. Firestore → tab **Regole**
2. Sostituisci tutto con il contenuto del file [`firestore.rules`](./firestore.rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. **Pubblica**. Ogni utente anonimo può leggere e scrivere solo `users/{proprio uid}/...`.

## 7. Stima della massa grassa da foto (Firebase AI Logic, gratuito)

La funzione "BF da foto" usa Gemini tramite **Firebase AI Logic**, disponibile nel piano gratuito
Spark (senza carta di credito).

1. Firebase Console → menu **Build → AI Logic** (o "Firebase AI Logic") → **Inizia / Get started**
2. Scegli **Gemini Developer API** (non Vertex AI) e conferma: Firebase crea e collega la chiave in automatico
3. Fatto: non servono nuovi secret su GitHub, l'app usa la configurazione Firebase esistente

Note:
- L'app prova in automatico i modelli Gemini Flash più recenti (3.x, poi `gemini-flash-latest`) e si
  ricorda il primo disponibile. Google ritira periodicamente i modelli (i 2.0 sono spenti, i 2.5 sono
  riservati ai progetti che li usavano già): se compare "Nessun modello Gemini disponibile", controlla
  in Firebase Console → AI Logic il nome di un modello Flash attivo e impostalo su GitHub in
  **Settings → Secrets and variables → Actions → Variables** come `VITE_GEMINI_MODEL`, poi rilancia il deploy.
- Consigliato: attiva **App Check** (Build → App Check, provider reCAPTCHA Enterprise) per impedire
  che altri usino la quota AI del tuo progetto.
- Privacy: le foto vengono ridimensionate sul telefono e inviate a Google solo per l'analisi; l'app
  non le salva. Con il piano gratuito Google può usare i contenuti per migliorare i propri servizi:
  l'utente lo accetta esplicitamente prima di ogni analisi.

## 8. Configura GitHub e fai il deploy

Segui le sezioni **2** e **3** del [README](./README.md): 6 secret + GitHub Pages con sorgente
"GitHub Actions". Poi fai un push su `main` (o lancia il workflow a mano).

## 9. Primo avvio

Apri https://fnjzn8w8w6-cmyk.github.io/mirkogym/ :

1. L'app crea l'utente anonimo e carica la tua scheda (Day 1–5)
2. Onboarding in 3 slide
3. (Opzionale) inserisci i carichi di partenza per ogni esercizio — puoi saltare
4. **Impostazioni → Account → Crea account** con email e password: da quel momento i dati sono legati
   al tuo account (quelli già registrati restano) e puoi accedere da qualsiasi telefono
5. Sei pronto: **Inizia sessione** 💪

## Risoluzione problemi

| Messaggio | Causa / soluzione |
|---|---|
| "Configurazione Firebase mancante" | I secret non erano impostati al momento del build: aggiungili e rilancia il workflow |
| "Impossibile connettersi" + `auth/admin-restricted-operation` o `operation-not-allowed` | Accesso anonimo non attivo (passo 3) |
| "Accesso con email non attivo su Firebase" | Provider Email/password non attivo (passo 3) |
| "Firebase AI Logic non è attivo nel progetto" | Attiva AI Logic con Gemini Developer API (passo 7) |
| Password dimenticata | Schermata di accesso → *Password dimenticata?*: arriva un'email per reimpostarla |
| "Impossibile connettersi" + `permission-denied` | Regole Firestore non pubblicate (passo 6) |
| `auth/unauthorized-domain` | Dominio GitHub Pages non autorizzato (passo 4) |
| L'app non si aggiorna dopo un deploy | Chiudila e riaprila: il service worker si aggiorna automaticamente al successivo avvio |
