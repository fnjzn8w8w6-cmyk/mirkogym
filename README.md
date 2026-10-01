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

## 5. Account, questionario e scheda su misura

Al primo avvio l'**account è obbligatorio** (email + password): i dati sono sempre salvati e
disponibili su ogni dispositivo. Dopo la registrazione un questionario guidato chiede:

1. **Lingua** delle istruzioni degli esercizi (IT, EN, ES, FR, DE, PT)
2. **Sesso, età, altezza, peso**
3. **Attività quotidiana** (da sedentario a molto attivo)
4. **Livello**: neofita, intermedio, avanzato
5. **Obiettivo**: definizione, massa, forza, mantenimento
6. **Giorni a settimana e attrezzatura** (+ circonferenze opzionali vita/collo/fianchi)

Poi mostra l'**analisi**: metabolismo basale (Mifflin-St Jeor), consumo giornaliero (× fattore di
attività), calorie obiettivo e macronutrienti, **massa grassa stimata** (metodo US Navy con le
circonferenze, altrimenti formula di Deurenberg), massa magra, BMI e FFMI. Infine propone una
**scheda su misura** (split in base ai giorni, esercizi in base all'attrezzatura, serie/ripetizioni/RIR/
recuperi in base a obiettivo e livello, carichi di partenza indicativi) oppure un modello.
Il profilo si aggiorna da **Profilo → Aggiorna profilo e obiettivo**.

**Massa grassa più precisa**: le formule da BMI sovrastimano chi è muscoloso. Si può quindi inserire
un valore misurato (plicometria, bioimpedenza, DEXA) oppure usare **"BF da foto"** (pagina Corpo o
questionario): una foto frontale (+ profilo opzionale) viene analizzata da Gemini tramite Firebase AI
Logic (gratuito, vedi SETUP.md passo 7). Errore tipico delle stime da foto: 2–4 punti; l'ultimo valore
registrato in "Corpo" è quello usato da Profilo e calcoli.

Prima di ogni allenamento il **check di prontezza** (sonno, energia, indolenzimento) adatta i carichi:
giornata "no" → −10% sui suggerimenti.

Gli utenti anonimi delle versioni precedenti, creando l'account, mantengono tutti i dati.

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

## Coach AI: personal trainer + dietologo

Pagina **Coach** (menu in basso). Approccio ibrido: **i numeri li calcola l'app** (calorie, macro,
serie, ripetizioni, carichi, aggiustamenti) con formule verificate; **Gemini** (Firebase AI Logic,
gratuito) interpreta il linguaggio naturale e scrive i commenti. Ogni risposta dell'AI è validata
e, se l'AI non risponde, l'app continua a funzionare con le regole.

- **Allenamento**: scrivi cosa vuoi ("togli l'hack squat, mi fa male il ginocchio", "max 50 minuti").
  Il coach vede la tua scheda attuale e fa **modifiche mirate**: sostituisce, toglie o aggiunge esercizi,
  cambia le serie o accorcia le sedute troppo lunghe; il resto resta invariato. Le sostituzioni evitano i
  movimenti a rischio (es. ginocchio → niente squat/affondi). L'anteprima mostra ogni modifica
  (vecchio → nuovo); una scheda nuova da zero solo se la chiedi. Dolori ed esercizi da evitare restano
  memorizzati per le schede future.
- **Dieta**: scrivi cosa vuoi. Per un pasto preciso ("domani a cena mangio una pizza", "giovedì a pranzo
  qualcosa col pollo") cambia solo quel pasto (pasto libero con valori stimati, oppure una ricetta adatta)
  e ricalcola gli altri pasti di quel giorno; il resto della settimana non cambia. Per le preferenze
  permanenti ("sono intollerante al lattosio, ho poco tempo, adoro il salmone") L'AI la traduce in modifiche validate: dieta, numero di
  pasti, allergie, cibi graditi/sgraditi, tempo per cucinare, stile dei macro (bilanciata, più proteine,
  pochi carboidrati, più carboidrati) e correzione calorica (massimo ±400 kcal per volta, ±600 in totale,
  mai sotto il minimo di sicurezza); nel piano cambiano solo i pasti che non rispettano più le preferenze.
  L'anteprima mostra i pasti realmente cambiati prima di applicare.
- **Chiedi al coach**: chat con il coach, che conosce profilo, obiettivi e ultimi allenamenti.

## Coach con memoria

- **Profilo dell'atleta** (`src/lib/athlete.ts`, calcolato in locale da tutto lo storico): dolori e fastidi segnalati (resoconti e note, attivi finché non li segni come passati), giorni della scheda saltati, esercizi in stallo, progressi, voto ed energia medi, note, diario alimentare (calorie, proteine, sgarri). Entra in check-in settimanale, chat, modifiche a scheda e dieta, analisi.
- **Prima della sessione**: se c'è un fastidio attivo il coach chiede come va e indica gli esercizi del giorno che caricano quella zona.
- **Home → "Il coach ha notato"** e **Allenamento → Analisi**: osservazioni calcolate + resoconto completo del coach (salvato, aggiornabile).
- **Allenamento** diviso in Scheda · Sessioni (con resoconto e confronto con la volta prima) · Esercizi (ultima sessione vs media, per gruppo muscolare) · Analisi.
- **In sessione**: riquadro "Volta scorsa" per ogni esercizio e frecce ▲/▼ per ogni serie.
- **Gioco**: oltre 80 traguardi (forza, costanza, dieta, coach, sfide), 3 sfide settimanali da +150 XP, striscia di settimane in Home.

## Importazioni con foto e PDF

- **Scheda del personal trainer** (Allenamento → "Hai già un personal trainer?"): Gemini legge foto o PDF e ricava giorni, esercizi, serie, ripetizioni e recuperi; gli esercizi vengono collegati alla libreria quando il nome corrisponde. Anteprima modificabile prima di salvare.
- **Dieta del nutrizionista** (Dieta → Piano → "Hai già un nutrizionista?"): pasti e grammature diventano il piano settimanale con porzioni fisse (niente ricalcolo automatico); i macro sono calcolati dal database alimenti.
- **Foto del piatto** (Diario → "Foto piatto"): l'AI stima alimenti e grammi (errore tipico 20-30%), l'app calcola i macro; si possono correggere i grammi prima di aggiungere.

## Aspetto e navigazione

Nell'app il nome è **HowToGym** (repository e indirizzo restano invariati). Tema "Toxic": viola notte e
verde fluo, titoli in Unbounded. Barra in basso: Home · Allenamento (scheda, storico, mappa muscolare) ·
Dieta · Coach · Corpo · Profilo. La mappa muscolare è anatomica (contorni da
[react-body-highlighter](https://github.com/giavinh79/react-body-highlighter), MIT), con proporzioni
maschili o femminili in base al profilo e nel colore dell'app.

**Dettatura vocale**: il pulsante 🎙 nei campi del coach, del check-in e dei resoconti usa il
riconoscimento vocale del telefono; se non è disponibile (web app su iPhone) registra l'audio e lo
trascrive Gemini. **Resoconti**: a fine allenamento (voto, energia, dolori, nota) e in fondo al diario
(aderenza, fame, sgarri, nota) si inviano al coach, che li salva per il resoconto personale.
**Corpo**: composizione corporea, avviso sull'andamento (nell'obiettivo / sgarro da recuperare), grafici
di peso e massa grassa (1M-1A), misurazioni. **Rimani connesso** nella schermata di accesso.

## Dieta: diario, piano settimanale e ricette

Pagina **Dieta** (menu in basso), tre sezioni:

- **Diario** (stile MyFitnessPal): per ogni giorno colazione, pranzo, cena e spuntini con totali di
  calorie, proteine, carboidrati e grassi rispetto all'obiettivo. Aggiungi un alimento:
  - cercandolo tra i **210 alimenti base** in italiano (valori per 100 g da USDA FoodData Central),
  - tra i **prodotti confezionati** di [Open Food Facts](https://world.openfoodfacts.org) (ricerca online),
  - **scansionando il codice a barre** con la fotocamera (su iPhone con un lettore WebAssembly incluso
    nell'app, su Android con quello del sistema; si può anche digitare il codice),
  - creando un alimento dall'etichetta (se il prodotto non è nel database),
  - oppure scegliendo una ricetta (in porzioni).
  Inserisci i grammi e l'app calcola subito kcal e macro. Gli alimenti usati restano tra i "recenti"
  (disponibili anche offline). "Copia i pasti del piano" riempie il giorno con il piano settimanale.
- **Piano**: 7 giorni di pasti diversi calcolati dall'app (nessuna quota AI) in base a dieta, allergie,
  cibi non graditi e amati, tempo per cucinare e macro dell'obiettivo; porzioni calibrate, contorno di
  verdure con i secondi, integrazione proteica se servono proteine. "Cambia" per un singolo pasto,
  lista della spesa, rigenerazione, ricalcolo porzioni quando cambia l'obiettivo, check-in settimanale.
- **Ricette**: **612 ricette italiane** (ricerca e filtri), con calorie e macro per porzione calcolati
  dagli ingredienti; foto verificate una per una (184 ricette: dove non c'è una foto coerente l'app
  non ne mostra una a caso). **Crea le tue ricette**: foto, porzioni, ingredienti con i grammi
  (macro calcolati in automatico) e preparazione; il piano settimanale le usa.
- **Check-in settimanale**: 6 domande veloci (energia, sonno, stress, dolori, fame, aderenza alla dieta)
  più i dati raccolti dall'app (allenamenti fatti/previsti, volume rispetto alla settimana prima, record,
  andamento del peso stile MacroFactor). L'app calcola indice di fatica, correzione calorica e
  consiglio di deload; l'AI scrive un commento (se non risponde restano i consigli calcolati).
  Applicando le modifiche le porzioni del piano vengono ricalcolate. Promemoria in Home ogni 7 giorni.
- Sicurezza: mai sotto metabolismo basale né sotto 1500/1200 kcal; con dolori, patologie o disturbi
  alimentari il coach rimanda a medico/professionista.

La libreria esercizi si apre dall'icona in alto nella pagina Coach e dall'editor della scheda.

## Libreria esercizi, schede e gamification

- **Istruzioni in lingua**: in italiano sono curate a mano per i ~100 esercizi più usati; per gli altri
  esercizi e per le altre lingue vengono tradotte automaticamente (servizio gratuito MyMemory) alla prima
  apertura e salvate sul dispositivo. Se la traduzione non è disponibile si mostra il testo originale.
- **Ricette**: [dispensa-dati](https://github.com/GenPocoto/dispensa-dati) — ricette originali FrigoDispensa e
  [Wikibooks, Libro di cucina](https://it.wikibooks.org/wiki/Libro_di_cucina), licenza
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); fonte indicata su ogni ricetta.
  `npm run recipes` rigenera `public/ricette.json` calcolando i macro dagli ingredienti.
- **Alimenti base**: [USDA FoodData Central](https://fdc.nal.usda.gov) (pubblico dominio), tramite
  [CodeJetNet/food-data](https://github.com/CodeJetNet/food-data); nomi italiani in
  `scripts/foods-it.mjs`, `npm run foods` rigenera `public/foods.json`.
- **Prodotti e codici a barre**: [Open Food Facts](https://world.openfoodfacts.org) (ODbL), interrogato dal telefono.
- **Foto delle ricette**: Wikimedia Commons (licenze libere, autore e licenza nel dettaglio della ricetta),
  cercate dal workflow `Recipe photos` (pagina Wikibooks della ricetta o voce Wikipedia del piatto) e
  controllate a mano; quelle scartate sono in `scripts/recipe-photos-reject.json`.
- **876 esercizi** da [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (pubblico dominio):
  foto di inizio/fine movimento alternate come **simulazione animata**, muscoli principali/secondari
  sulla figura del corpo, istruzioni passo-passo, livello, attrezzo e link al **video su YouTube**.
  Ricerca anche in italiano ("panca", "rematore", "alzate laterali"…) e filtri per muscolo/attrezzo.
  Rigenera il file con `npm run exercises`.
- **Schede per tutti**: all'avvio ogni nuovo utente sceglie un modello (Scheda di Mirko, Full Body,
  Upper/Lower, Push/Pull/Legs o da zero). Nell'editor si aggiungono esercizi dalla libreria,
  si aggiungono/rinominano/eliminano giorni (fino a 7) o si carica un altro modello.
- **Profilo**: livello ed XP, **ranghi di forza** (Ferro → Campione, stile Liftoff) sui fondamentali in
  base a 1RM stimato / peso corporeo, **mappa muscolare** della settimana e **19 traguardi**.
- **Fine allenamento**: XP guadagnati, nuovo livello, traguardi sbloccati e **card condivisibile**
  (immagine 1080×1350 per Instagram/WhatsApp), disponibile anche dallo storico.

## Funzioni in sessione

Ispirate alle migliori app del 2026 (Hevy, Strong, Alpha Progression, Fitbod):

- **Colonna "Prec."**: peso×reps della stessa serie l'ultima volta; un tocco li copia nella serie.
- **Obiettivo reps per serie**: dopo un aumento di carico si riparte dal fondo del range, altrimenti +1 rep
  rispetto all'ultima volta (placeholder nel campo reps).
- **Tipi di serie**: tocca il numero della serie per passare a **W** riscaldamento, **D** drop set,
  **F** cedimento. Il riscaldamento non conta per volume, PR e progressione.
- **Riscaldamento automatico** (multiarticolari): 40/60/80% del carico di lavoro, arrotondato a 2,5 kg.
- **Calcolatore dischi**: dischi per lato con disegno del bilanciere (20/15/10 kg o nessuno).
- **Note fisse** per esercizio (es. "sedile 4"): restano sulla scheda e compaiono ogni volta.
- **Sostituisci esercizio** (macchina occupata): scegli dalla scheda o scrivine uno nuovo.
- **Schermo sempre acceso** durante l'allenamento (disattivabile in Impostazioni).
- A fine sessione: confronto del volume con l'ultima volta dello stesso giorno.

In Home, la card **Questa settimana** mostra sessioni, serie e volume (vs settimana scorsa), le
**serie per muscolo** rispetto alla fascia obiettivo (impostabile: 6–12, 10–20, 12–24) e lo
**stato di recupero** di ogni muscolo. Nel dettaglio esercizio c'è la tabella dei **carichi stimati
per 1–15 ripetizioni**.

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
users/{uid}/config/foods           alimenti personali e recenti
users/{uid}/foodLogs/{YYYY-MM-DD}   diario alimentare del giorno
users/{uid}/recipes/{id}            ricette create dall'utente
```

`settings` e `activeSession` stanno nella sottocollezione `config` perché Firestore richiede un
numero pari di segmenti nel percorso di un documento.
