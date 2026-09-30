# 🏋️ MirkoGym

Progressive Web App personale per il tracking degli allenamenti in palestra: scheda a 5 giorni,
progressione automatica (double progression + RIR), mesocicli con deload, PR, 1RM stimato,
analytics e tracking della composizione corporea.

**App live:** https://fnjzn8w8w6-cmyk.github.io/mirkogym/

Stack: Vite 5 · React 18 · TypeScript strict · Tailwind CSS 3.4 · Firebase (Firestore + Auth email/password con avvio anonimo) ·
Recharts · Framer Motion · date-fns (it) · vite-plugin-pwa · deploy su GitHub Pages via GitHub Actions.

---

## 1. Setup Firebase

Tutti i passaggi (creazione progetto, Firestore, login anonimo, regole di sicurezza, dominio
autorizzato) sono in **[SETUP.md](./SETUP.md)**. Ci vogliono circa 10 minuti.

## 2. GitHub Secrets (per il deploy)

Il workflow `.github/workflows/deploy.yml` compila l'app con la configurazione Firebase letta dai secret.

1. Repo su GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. Crea questi 6 secret (i valori sono nella configurazione della tua app web Firebase, vedi SETUP.md):

| Secret | Esempio |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `mirkogym-xxxx.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `mirkogym-xxxx` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `mirkogym-xxxx.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `VITE_FIREBASE_APP_ID` | `1:123456789012:web:abc123` |

> La `apiKey` di Firebase non è un segreto vero e proprio (finisce comunque nel bundle JS):
> la protezione dei dati è data dalle **regole Firestore** (`firestore.rules`), che permettono
> a ogni utente di leggere/scrivere solo i propri documenti.

Se l'app viene pubblicata senza secret, mostra una schermata "Configurazione Firebase mancante"
invece di andare in errore.

## 3. Attivare GitHub Pages

1. Repo → **Settings** → **Pages**
2. In **Build and deployment → Source** scegli **GitHub Actions**
3. Ogni push su `main` avvia build + deploy (tab **Actions** per seguirlo). Puoi anche lanciarlo a mano
   da Actions → *Deploy to GitHub Pages* → **Run workflow**.

L'app usa `HashRouter` (URL tipo `.../mirkogym/#/history`), quindi non serve nessun fallback 404
lato server. Il base path `/mirkogym/` è configurato in `vite.config.ts`.

## 4. Installare la PWA su iPhone

1. Apri **https://fnjzn8w8w6-cmyk.github.io/mirkogym/** con **Safari**
2. Tocca **Condividi** (quadrato con freccia) → **Aggiungi alla schermata Home** → **Aggiungi**
3. Apri MirkoGym dall'icona: gira a schermo intero, funziona anche offline e si aggiorna da sola.

Su Android (Chrome): menu ⋮ → **Installa app**.

> Nota iPhone: Safari non supporta `navigator.vibrate`, quindi su iOS le vibrazioni non sono
> disponibili; il suono di fine recupero sì (attivabile in Impostazioni).

## 5. Account e salvataggio dei dati

Al primo avvio l'app parte subito con un utente anonimo (dati legati a quel dispositivo).
Per non perdere mai i dati: **Impostazioni → Account → Crea account** (email + password).

- L'utente anonimo viene **collegato** all'account: stesso UID, tutto ciò che hai già registrato resta.
- Su un altro telefono (o dopo aver reinstallato l'app / cancellato i dati di Safari): all'avvio tocca
  **"Hai già un account? Accedi"**, oppure Impostazioni → Account → Accedi.
- **Esci** da Impostazioni → Account; i dati restano nell'account. *Password dimenticata?* invia
  un'email per reimpostarla.
- Finché sei senza account, la Home mostra il promemoria "Proteggi i tuoi dati".

## 6. Backup dei dati

Anche con l'account, un backup ogni tanto non fa male:

- **Impostazioni → Dati → Esporta**: scarica `mirkogym-backup-AAAA-MM-GG.json` con scheda, sessioni,
  body log, mesocicli e impostazioni. Consigliato: una volta a settimana / a fine mesociclo,
  salvandolo su iCloud Drive o Google Drive.
- **Impostazioni → Dati → Importa**: carica un backup e **sostituisce** tutti i dati attuali
  (con conferma).
- Impostazioni → App mostra l'**UID** (utile per ritrovare i dati in Firebase Console).

---

## Sviluppo locale

```bash
npm install
cp .env.example .env.local   # poi compila i valori Firebase
npm run dev                  # http://localhost:5173/mirkogym/
```

Altri comandi:

| Comando | Cosa fa |
|---|---|
| `npm run build` | typecheck (`tsc -b`) + build di produzione in `dist/` |
| `npm run preview` | serve la build (con service worker) |
| `npm run typecheck` | solo controllo TypeScript |
| `npm run icons` | rigenera le icone PWA in `public/` (script `scripts/generate-icons.mjs`, usa `sharp`) |

### Emulatori Firebase (opzionale)

Per sviluppare senza toccare i dati reali: installa `firebase-tools` (serve Java), poi

```bash
firebase emulators:start --only auth,firestore --project demo-mirkogym
# in .env.local: VITE_USE_EMULATORS=true (+ valori fittizi per le altre VITE_FIREBASE_*)
npm run dev
```

Gli emulatori applicano anche `firestore.rules`.

## Come funziona

- **Progressione** (`src/lib/progression.ts`): se in tutte le serie dell'ultima sessione hai
  raggiunto il top del rep range con RIR ≥ al target minimo → +2,5 kg (multi-articolari) o +1,25 kg
  (isolamento). Se sei nel range → stesso peso. Due sessioni di fila sotto il range → deload
  dell'esercizio −10%. In settimana di deload → carico ridotto della percentuale impostata.
- **PR** (`src/lib/analytics.ts`): peso massimo, reps massime a parità di peso e 1RM stimato (Epley:
  `peso × (1 + reps/30)`), confrontati con lo storico dell'esercizio.
- **Mesociclo**: la settimana corrente è calcolata dalla data di inizio; l'ultima settimana è il deload
  (se "Deload automatico" è attivo). Alla scadenza si apre automaticamente il mesociclo successivo.
- **Sessione in corso**: salvata in tempo reale (localStorage + Firestore), sopravvive a chiusure e
  reload; dalla home compare il banner "Riprendi".
- **Offline**: cache persistente Firestore su IndexedDB + service worker Workbox.

## Struttura dati (Firestore)

```
users/{uid}/schedule/current        scheda (5 giorni)
users/{uid}/sessions/{id}           sessioni completate
users/{uid}/bodyLogs/{id}           peso, BF%, sonno, energia, note
users/{uid}/mesocycles/{id}         mesocicli
users/{uid}/config/settings         impostazioni
users/{uid}/config/activeSession    sessione in corso (bozza)
```

`settings` e `activeSession` stanno nella sottocollezione `config` perché Firestore richiede un
numero pari di segmenti nel percorso di un documento.
