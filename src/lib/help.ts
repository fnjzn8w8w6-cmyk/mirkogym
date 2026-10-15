/** Spiegazioni dei punti interrogativi: come funziona ogni sezione dell'app. */
export const HELP = {
  /* ---------- Home ---------- */
  'home-workout': {
    title: 'Allenamento di oggi',
    body: [
      'È il prossimo giorno della tua scheda, in ordine: dopo il Day 1 viene il Day 2 e così via.',
      'Se un gruppo muscolare è affaticato compare un avviso (es. "Spalle: settimana leggera"): solo quegli esercizi avranno carichi e serie ridotti.',
      'Tocca INIZIA per aprire la sessione con i carichi suggeriti.',
    ],
  },
  'home-goal': {
    title: 'Obiettivo',
    body: [
      'Il tuo obiettivo a fasi (es. massa poi cut) con la scadenza. La barra va dal peso di partenza al peso obiettivo della fase.',
      '"Peso reale" è la tendenza: una media che ignora gli sbalzi giornalieri della bilancia (acqua, sale, pasti). È il numero da guardare.',
      'La previsione è una forchetta: al ritmo delle ultime settimane arrivi tra le due date con circa l\'80% di probabilità.',
      'Quando la fase è completata ti viene proposto il passaggio alla successiva: confermi tu.',
    ],
  },
  'home-diet': {
    title: 'Dieta di oggi',
    body: [
      'Gli anelli mostrano proteine, carboidrati e grassi registrati oggi nel diario rispetto all\'obiettivo del giorno.',
      'Nei giorni di allenamento l\'obiettivo ha più carboidrati, nei giorni di riposo meno: il totale della settimana non cambia.',
    ],
  },
  'home-quests': {
    title: 'Sfide della settimana',
    body: [
      '3 missioni che cambiano ogni lunedì. Completarle dà XP per salire di livello.',
      'La fiamma è la striscia: quante settimane di fila ti sei allenato almeno una volta.',
    ],
  },
  'home-weight': { title: 'Peso', body: ['L\'ultima pesata e la variazione degli ultimi 7 giorni. Tocca per aprire la sezione Corpo con i grafici.'] },
  'home-meso': {
    title: 'Mesociclo',
    body: ['Il blocco di allenamento di alcune settimane (di solito 4). Alla fine il coach ti propone gli aggiustamenti alla scheda nel check-in.'],
  },
  'home-week': { title: 'Questa settimana', body: ['Sessioni, serie e volume della settimana, e le serie per gruppo muscolare rispetto all\'obiettivo.'] },
  'home-checkin': {
    title: 'Check-in settimanale',
    body: ['Una volta a settimana rispondi a poche domande (e se vuoi aggiungi una foto): il coach analizza la settimana e ti propone le modifiche per la successiva.'],
  },
  'home-coach-noticed': {
    title: 'Il coach ha notato',
    body: ['Osservazioni calcolate dai tuoi dati, senza AI: fastidi segnalati, esercizi fermi, giorni saltati, progressi, dieta.'],
  },
  'home-coach': { title: 'Coach', body: ['Fai una domanda a voce o per iscritto. Il coach conosce il tuo storico, i resoconti e il tuo obiettivo.'] },

  /* ---------- Allenamento ---------- */
  'train-plan': {
    title: 'Scheda',
    body: ['I giorni della tua scheda. Il prossimo da fare è evidenziato. Da qui modifichi la scheda, apri la libreria esercizi o il mesociclo.'],
  },
  'train-import': {
    title: 'Importa la scheda',
    body: ['Carica foto o PDF della scheda del tuo personal trainer: l\'AI legge giorni, esercizi, serie e ripetizioni. Prima di salvare controlli e correggi tutto.'],
  },
  'train-sessions': {
    title: 'Sessioni',
    body: [
      'Tutti i tuoi allenamenti. Accanto a ognuno vedi il confronto con la volta prima dello stesso giorno della scheda (▲ meglio, ▼ peggio).',
      'Aprendo una sessione vedi il dettaglio, il tuo resoconto e il confronto esercizio per esercizio.',
    ],
  },
  'train-exercises': {
    title: 'Esercizi',
    body: ['L\'ultima sessione contro la media di tutte, il volume per gruppo muscolare e, per ogni esercizio, l\'ultima volta contro la precedente.'],
  },
  'diet-analysis-ai': {
    title: 'Analisi del dietologo',
    body: [
      'Solo alimentazione (l\'allenamento ha la sua analisi in Allenamento → Analisi).',
      'Giornata: oggi (o l\'ultima giornata registrata) rispetto all\'obiettivo, con idee concrete per il resto della giornata.',
      'Settimana: i giorni registrati da lunedì a oggi, con medie, giorni in obiettivo, proteine, fame e sgarri.',
      'Le calorie obiettivo non cambiano qui: le aggiorna l\'app ogni lunedì.',
    ],
  },
  'train-analysis': {
    title: 'Analisi',
    body: [
      'Solo allenamento (la dieta ha la sua analisi in Dieta → Analisi).',
      'Sessione: l\'ultimo allenamento esercizio per esercizio, confrontato con le volte precedenti, con i carichi per la prossima volta.',
      'Settimana: la settimana in corso fino a oggi (allenamenti fatti e mancanti, serie per muscolo). Se è lunedì non dice che sei calato: guarda cosa resta da fare.',
      'Ogni analisi resta salvata; quando ci sono dati nuovi ti avvisa di aggiornarla.',
    ],
  },
  'session-suggestion': {
    title: 'Carico suggerito',
    body: [
      'L\'app calcola il carico al posto tuo: dalle serie dell\'ultima volta (peso, ripetizioni e sforzo RPE) stima il tuo massimale, cioè quanto alzeresti per 1 ripetizione. Le serie vicine al cedimento sono le più affidabili; quelle senza sforzo segnato contano come fatte a cedimento (stima prudente).',
      'Dal massimale ricava il carico per fare le ripetizioni minime del programma lasciandone in canna quante dice l\'obiettivo (es. 8 ripetizioni a RPE 8 = 2 in canna). Tutte le serie con lo stesso carico, dopo il riscaldamento.',
      'Ogni volta si aggiorna: se fai più ripetizioni o fai meno fatica il massimale sale e sale il carico; se lo stesso carico va bene, si punta a +1 ripetizione. Una giornata storta non fa crollare il carico (si fa la media con la volta prima).',
      'Segna sempre lo sforzo (RPE) di ogni serie: è quello che rende preciso il calcolo.',
      'RIR calibrato: l\'app impara quanto sei preciso quando dici "me ne restavano 2". Se tendi a lasciarne di più, il carico suggerito sale un po\'.',
    ],
  },
  'session-effort': {
    title: 'Sforzo della serie (RPE)',
    body: [
      'RPE = quanto ti è costata la serie, da 6 a 10. 10 vuol dire che non ne avevi nemmeno una in più, 8 che te ne restavano 2.',
      'Il coach ti dà un obiettivo (es. RPE 8-9): ti fermi quando senti che ne avresti ancora 1 o 2. Con questo dato l\'app capisce se alzare il carico la prossima volta.',
      'Preferisci contare le ripetizioni in riserva (RIR)? Lo cambi in Impostazioni → Allenamento.',
    ],
  },
  'session-warmup': {
    title: 'Riscaldamento suggerito',
    body: [
      'Sul primo esercizio multiarticolare di ogni gruppo muscolare trovi già pronte le serie di riscaldamento (W), calcolate dal carico di lavoro: circa 40%, 60% e 80% con poche ripetizioni.',
      'Non contano nel volume e non fanno record. Tocca "Togli" se non ti servono; puoi spegnerle in Impostazioni → Allenamento.',
    ],
  },
  'session-edit': {
    title: 'Modifica esercizio',
    body: [
      'Cambia serie, ripetizioni, sforzo e recupero mentre ti alleni.',
      '"Solo oggi" vale per questa sessione; "Anche nella scheda" salva la modifica per le prossime volte.',
    ],
  },
  'session-previous': {
    title: 'Volta scorsa',
    body: ['Le serie dell\'ultima volta che hai fatto questo esercizio. Accanto a ogni serie: ▲ se stai facendo meglio, = uguale, ▼ peggio.'],
  },
  'session-fatigue': {
    title: 'Settimana leggera (deload mirato)',
    body: [
      'Per ogni gruppo muscolare l\'app calcola un indice di fatica: serie dell\'ultima settimana rispetto alle 4 precedenti, energia e voti dei resoconti, fastidi segnalati.',
      'Sopra 70/100 quel gruppo fa una settimana leggera: carichi suggeriti −30% e, se vuoi, una serie in meno (la togli con il tasto − sotto le serie). Il resto della scheda resta normale.',
    ],
  },
  'session-swap': {
    title: 'Sostituisci esercizio',
    body: ['Scegli un esercizio alternativo. Il carico equivalente è calcolato con rapporti di forza standard tra attrezzi (es. manubri ≈ 80% del bilanciere in totale) e poi con i tuoi dati reali quando hai fatto entrambi gli esercizi.'],
  },

  /* ---------- Corpo ---------- */
  'body-composition': {
    title: 'Composizione corporea',
    body: ['Peso, massa grassa, massa magra e FFMI (quanto muscolo hai rispetto all\'altezza). La massa grassa parte dall\'ultima misura affidabile (foto del check-in, plicometro, bilancia, DEXA) e tra una misura e l\'altra viene aggiornata dal trend del peso: chi dimagrisce perde circa 75% grasso, chi ingrassa ne prende circa 45% (con il surplus giusto il resto è massa magra, come nel coach adattivo).', 'Le misure della bilancia impedenziometrica si leggono come media di 7 giorni, perché oscillano molto. Senza misure negli ultimi 4 mesi si usa la stima dal questionario.'],
  },
  'body-weekcal': {
    title: 'Aggiornamento settimanale delle calorie',
    body: [
      'Ogni lunedì l\'app calcola quanto consumi (basale, passi, allenamenti fatti, digestione), lo confronta con l\'andamento del peso e con il diario, e corregge se il peso non va come previsto (come le app di nutrizione più avanzate). Se il peso cambia troppo in fretta per quello che mangi è acqua: quella settimana non corregge.',
      'Cambi di al massimo 200 kcal a settimana: se il calcolo cambia di più, il resto arriva nelle settimane dopo.',
      'Poi fissa l\'obiettivo della settimana: resta uguale fino al lunedì dopo, così sai sempre cosa mangiare. Check-in, coach e analisi usano questi stessi numeri e non ne propongono altri.',
      'Ritmo di riferimento: in massa +0,25-0,5% del peso a settimana, in definizione −0,5-1%. Se non ti convince puoi annullare l\'aggiornamento della settimana.',
    ],
  },
  'body-status': {
    title: 'Sei nell\'obiettivo?',
    body: ['Confronta la velocità reale con cui cambia il peso con quella necessaria per il tuo obiettivo. Servono almeno 4 pesate distribuite su 2 settimane (senza la prima settimana di assestamento).'],
  },
  'body-muscles': {
    title: 'Muscoli',
    body: [
      'Vista Volume: più è acceso il colore, più serie hai fatto questa settimana per quel muscolo rispetto all\'obiettivo.',
      'Vista Cambiamento: dove le foto settimanali mostrano un cambiamento visibile (verde = migliorato).',
      'Il commento del coach ti dice cosa manca nella settimana e cosa è ancora in recupero.',
    ],
  },
  'body-ideal-volume': {
    title: 'Il tuo volume ideale',
    body: [
      'Per ogni gruppo l\'app confronta le serie fatte ogni settimana con i progressi di forza della settimana dopo, e trova la fascia di serie in cui progredisci di più.',
      'Finché non ci sono abbastanza settimane di dati (circa 6) usa la fascia standard 10–20 serie.',
    ],
  },
  'body-photos': {
    title: 'Foto giornaliere',
    body: [
      'Le tue foto, indipendenti dal check-in (le foto del check-in le trovi aprendo ogni check-in).',
      'Foto del giorno: scatti una foto (anche con l\'autoscatto) e l\'app ci aggiunge giorno, allenamento, peso e muscoli allenati. Puoi farne più di una al giorno: restano tutte.',
      '«Apri la lista delle foto»: tutte le foto con la data di scatto; toccane una per vederla grande, condividerla o eliminarla. Con «Confronta» scegli due foto per il prima/dopo.',
      'Reel: con almeno 2 foto l\'app crea un video con tutte le foto in sequenza, il confronto tra il primo e l\'ultimo giorno e i numeri del percorso.',
      'Corpo allineato e sfondo scuro: il telefono riconosce il tuo corpo in ogni foto e lo mette alla stessa grandezza e posizione, al posto della stanza uno sfondo scuro con la grana e la luce della foto (nel confronto puoi scegliere anche sfocato, cioè la stanza vera sfocata come in un ritratto, chiaro o originale; nel reel allineamento e sfondo si scelgono separatamente). Le foto non escono dal telefono e l\'originale resta sempre salvato. La prima volta scarica i modelli (circa 30 MB).',
      'Sagoma nell\'autoscatto: sopra la fotocamera vedi il contorno del tuo corpo nell\'ultima foto. Mettiti dentro la sagoma per scattare alla stessa distanza e nella stessa posa; puoi spegnerla toccando ON/OFF.',
    ],
  },
  'body-weight-chart': {
    title: 'Grafico del peso',
    body: [
      'Punti: le pesate. Linea verde: il peso reale (tendenza). Linea viola tratteggiata: il percorso verso l\'obiettivo.',
      'Punti azzurri: pesate gonfiate da acqua e glicogeno (es. dopo una pizza o tanti carboidrati). Non sono grasso e rientrano in 2–3 giorni.',
    ],
  },
  'body-bf-chart': { title: 'Massa grassa', body: ['Le misure di massa grassa nel tempo e, se impostato, il percorso verso la massa grassa obiettivo.'] },
  'goal-coach': {
    title: 'Coach adattivo',
    body: [
      'Conta solo il tuo obiettivo finale (peso e percentuale di grasso). Le fasi (massa pulita, ricomposizione, definizione) le decide il coach in base a come rispondi davvero.',
      'A ogni check-in guarda pesate e misure della massa grassa delle ultime settimane: quanta massa magra e quanto grasso stai mettendo o perdendo. Se metti soprattutto muscolo la massa si ferma prima (niente chili inutili), se prendi grasso propone una massa più lenta o una definizione prima.',
      'La data di arrivo è una forchetta che si stringe man mano che il coach ti conosce. Per conoscerti servono almeno 3 misure della massa grassa in 3 settimane: fai la foto a ogni check-in (una foto sbaglia di ±2–3%, la tendenza di più foto è affidabile).',
      'Ogni cambio di percorso è una proposta: si applica solo se tocchi Conferma. Calorie e macro seguono la fase in corso.',
    ],
  },
  'goal-check': {
    title: 'Verifica del coach',
    body: [
      'Il coach controlla se il tuo obiettivo è raggiungibile nei tempi che hai scelto, con i tuoi dati: sesso, età, altezza, livello di allenamento, peso e massa grassa di oggi.',
      'Usa ritmi realistici per chi si allena senza aiuti: un neofita mette circa 0,25 kg di massa magra a settimana, un intermedio circa 0,13, un avanzato circa 0,06 (meno per le donne, dopo i 40 anni e vicino al proprio limite). In definizione il muscolo si mantiene: non cresce.',
      'Se il piano non torna ti propone alternative entro la stessa data: tenere la percentuale di grasso (e scoprire il peso vero), tenere il peso (e scoprire la percentuale vera), oppure quanto tempo serve per avere tutti e due.',
      'Sono stime: allenamento, sonno, dieta e genetica possono spostarle. Il coach non promette risultati oltre questi numeri.',
    ],
  },
  'body-metabolism': {
    title: 'Il tuo consumo',
    body: [
      'Quante calorie consumi al giorno, calcolate voce per voce: metabolismo basale (dalla massa magra, se conosco la massa grassa), movimento (passi + movimento quotidiano), allenamenti (da ogni sessione registrata: durata, serie all\'ora, esercizi per le gambe e consumo dopo l\'allenamento) e digestione (dai macro del diario: le proteine costano di più).',
      'Gli allenamenti sono la media degli ultimi 14 giorni: contano anche nei giorni di riposo. I passi, se non li inserisci, li stimo dal livello di attività.',
      'Poi lo verifico con diario e peso: se le due cose non tornano di oltre il 20% (di solito acqua e glicogeno dopo un cambio di dieta) il dato del diario non viene usato. La prima settimana di pesate non conta.',
      'L\'obiettivo calorico si aggiorna il lunedì e cambia al massimo di 200 kcal a settimana.',
      'Per la verifica col diario servono almeno 7 giornate complete nelle ultime 3 settimane e pesate che coprano almeno 10 giorni dopo la prima settimana. Non serve pesarsi ogni giorno.',
    ],
  },
  'body-measurements': { title: 'Misure', body: ['Le circonferenze registrate, con la differenza rispetto alla misura precedente.'] },

  /* ---------- Dieta ---------- */
  'diet-diary': {
    title: 'Diario',
    body: [
      'Il diario è quello che conta: calorie, metabolismo, check-in e coach si basano su quello che hai mangiato davvero, non sul piano.',
      'In ogni pasto: "Alimento" (ricerca, codice a barre), "Ricetta" (la libreria con le tue ricette e il ricettario), "Piano" (il pasto suggerito dal piano per quel giorno) e la fotocamera per la foto del piatto.',
      'Se un pasto è vuoto e il piano ha un suggerimento, lo vedi nel riquadro tratteggiato: lo aggiungi con un tocco, oppure con le frecce 🔀 ne generi un altro a caso con le stesse calorie (compatibile con dieta e allergie).',
      'In alto vedi quanto ti resta rispetto all\'obiettivo di oggi.',
    ],
  },
  'diet-library': {
    title: 'Libreria ricette',
    body: [
      'Come la libreria esercizi: scegli una ricetta e le porzioni, e finisce nel pasto del diario.',
      '"Mangiate spesso" sono le ricette che hai già registrato, "Le mie" quelle che hai creato tu (puoi crearne una nuova da qui).',
      'Le ricette in verde ci stanno con 1 porzione nelle calorie che ti mancano oggi.',
    ],
  },
  'diet-analysis': {
    title: 'Analisi della dieta',
    body: [
      'Tutto calcolato dal diario, non devi compilare niente. Contano solo le giornate passate registrate (non quelle segnate come incomplete).',
      'Un giorno è "in obiettivo" quando le calorie sono entro ±10% dell\'obiettivo del giorno e le proteine almeno all\'85%.',
    ],
  },
  'diet-analysis-chart': {
    title: 'Calorie per giorno',
    body: ['Ogni barra è un giorno (nei 90 giorni: la media di una settimana). Il tratteggio è l\'obiettivo di quel giorno, che cambia tra allenamento e riposo.'],
  },
  'diet-analysis-macros': {
    title: 'Media vs obiettivo',
    body: ['La media giornaliera di calorie e macro nel periodo, confrontata con la media degli obiettivi. In giallo quello che supera l\'obiettivo di oltre il 10%.'],
  },
  'diet-analysis-meals': {
    title: 'Distribuzione delle calorie',
    body: ['Quanto pesa ogni pasto sul totale della giornata, e in quali giorni della settimana tendi a sforare (+) o a stare sotto (−).'],
  },
  'diet-analysis-foods': { title: 'Cosa mangi di più', body: ['Gli alimenti e le ricette che compaiono più spesso nel diario del periodo.'] },
  'diet-analysis-coach': {
    title: 'Il commento del coach',
    body: ['Consigli calcolati dai numeri del periodo (senza AI): obiettivo centrato, proteine, grassi e i giorni in cui sfori.'],
  },
  'diet-why-kcal': {
    title: 'Perché queste calorie?',
    body: [
      'La scomposizione dell\'obiettivo di oggi: il tuo metabolismo (dal diario o dalla formula), il ritmo necessario per il tuo obiettivo, e l\'aggiustamento del giorno (allenamento o riposo).',
    ],
  },
  'diet-cycling': {
    title: 'Calorie diverse allenamento / riposo',
    body: [
      'Nei giorni di allenamento mangi circa l\'8% in più (quasi tutto carboidrati, per rendere meglio e recuperare), nei giorni di riposo un po\' meno: la media della settimana resta uguale.',
      'I giorni di allenamento sono quelli in cui ti alleni davvero (l\'app li impara dallo storico); all\'inizio sono distribuiti in base agli allenamenti a settimana.',
      'Oggi è diverso dal solito? Tocca «Giorno di allenamento / Giorno di riposo» (nel Diario o nella Home): calorie e macro cambiano subito. Appena inizi un allenamento la giornata diventa da sola di allenamento.',
      'Se salti un allenamento o ne fai uno in più, i giorni che restano della settimana compensano (soprattutto con i carboidrati), così la media settimanale resta quella prevista. Nessun giorno scende più di 150 kcal sotto il suo obiettivo normale: se non basta, si accetta un piccolo sforamento.',
      'Puoi spegnere le calorie diverse in Impostazioni → Allenamento.',
    ],
  },
  'diet-plan': {
    title: 'Piano settimanale',
    body: ['7 giorni di pasti con porzioni calcolate sul tuo obiettivo. Puoi sostituire un pasto, chiedere modifiche al dietologo o importare la dieta del tuo nutrizionista.'],
  },
  'diet-tastes': {
    title: 'Il piano impara i tuoi gusti',
    body: ['Le ricette che registri nel diario vengono proposte più spesso. Quelle del piano che non mangi mai vengono proposte meno.'],
  },
  'diet-recipes': { title: 'Ricette', body: ['Ricettario italiano con macro calcolati dagli ingredienti, più le tue ricette.'] },
  'diet-suggest': {
    title: 'Cosa mangio adesso?',
    body: [
      'Ti propone un pasto adatto a questo momento: l\'app capisce dall\'ora e dal diario se è colazione, pranzo, spuntino, cena o dopo cena (se sbaglia, lo cambi con un tocco).',
      'Le calorie sono la quota normale di quel pasto sul tuo obiettivo (colazione circa 25%, pranzo e cena circa 35%, spuntino circa 10-12%) e non superano mai quello che ti manca alla giornata.',
      'Le idee partono dal tuo storico, poi dal piano di oggi, poi da abbinamenti e ricette compatibili con dieta e allergie. Quello che aggiungi conta come "mi piace", quello che salti viene proposto meno.',
    ],
  },
  'diet-fill': {
    title: 'Ti mancano calorie?',
    body: [
      'Serve a chiudere la giornata: scegli uno o più pasti in cui recuperare le calorie che mancano.',
      '"In proporzione" dà di più ai pasti grandi (la cena prende più della merenda), "In parti uguali" divide in modo uguale. Con un solo pasto, tutte le calorie vanno lì.',
      'Per ogni pasto ricevi una proposta con le quantità già calcolate; con "Un\'altra idea" la cambi.',
    ],
  },
  'session-recap': {
    title: 'Recap del coach',
    body: [
      'Dopo ogni allenamento il coach fa da solo il recap di quella sessione: cosa è andato bene, cosa migliorare e carichi o ripetizioni per la prossima volta, confrontando ogni esercizio con le volte precedenti.',
      'Parte appena invii il resoconto «Com\'è andata?» (che rende il recap più preciso); se non lo invii puoi farlo partire tu con «Fai il recap adesso».',
      'Resta salvato nella sessione: lo ritrovi in Allenamento → Sessioni aprendo quella sessione. Le sessioni vecchie lo fanno la prima volta che le apri.',
    ],
  },
  'day-recap': {
    title: 'Recap del dietologo',
    body: [
      'Per ogni giorno del diario il dietologo fa da solo il recap di quella giornata: cosa va bene, cosa sistemare e idee concrete per il giorno dopo.',
      'Parte quando chiudi la giornata rispondendo a «Com\'è andata oggi?», oppure da solo quando riapri un giorno passato. Durante la giornata puoi farlo anche a metà con «Fai il recap adesso».',
      'Resta salvato in quel giorno del diario: scorri i giorni con le frecce in alto per rileggerli. Se aggiungi o togli cibi, il recap si aggiorna.',
    ],
  },
  'rest-timer-sound': {
    title: 'Timer di recupero e suono',
    body: [
      'A fine recupero l\'app suona per 2-3 secondi, forte e con un timbro che si sente anche sopra la musica. In «Scegli il suono» trovi 5 suoni (Sveglia, Campanella, Fischietto, Campana del ring, Arcade): toccane uno per sentirlo e sceglierlo.',
      'Su iPhone il suono non si sente se il telefono è in modalità silenziosa: in palestra togli il silenzioso (il suono si sente sopra la musica, senza fermarla).',
      'Con lo schermo spento o con un\'altra app aperta l\'iPhone mette in pausa l\'app: il bip suona quando la riapri. Per sentirlo sempre al momento giusto tieni l\'app aperta durante il recupero, con «Schermo sempre acceso».',
      'La vibrazione non è disponibile su iPhone per le app web.',
    ],
  },
  'app-theme': {
    title: 'Tema',
    body: [
      'Scegli i colori dell\'app: Vulcano (scuro, nero e verde, l\'originale), Carta (chiaro, bianco e nero: si legge bene anche al sole) o Grafite (scuro, nero e bianco).',
      'Il tema si salva nel tuo account: lo ritrovi uguale su tutti i dispositivi. Foto del giorno, reel e immagini da condividere restano con i colori di Vulcan Lift.',
      'Con il tema Carta, se l\'ora e la batteria in alto non si leggono bene, chiudi e riapri l\'app.',
    ],
  },
  'complete-day': { title: 'Giornata completa', body: ['Se nel diario manca qualche pasto, rispondi "No": quella giornata non verrà usata per calcolare il tuo metabolismo.'] },

  /* ---------- Coach ---------- */
  'coach-training': { title: 'Coach allenamento', body: ['Chiedi una modifica alla scheda in parole tue (es. "ho male al ginocchio, togli l\'hack squat"): il coach cambia solo quello che serve e ti mostra l\'anteprima.'] },
  'coach-prefs': {
    title: 'Preferenze attive',
    body: [
      'Sono le cose che il coach ha capito dalle tue richieste: dolori, movimenti o esercizi da evitare, muscoli su cui insistere, tempo massimo.',
      'Le tiene presenti in ogni nuova proposta. Quando una non vale più (es. il dolore alla spalla è passato) toccala per toglierla.',
      'Togliere una preferenza non cambia la scheda attuale: se vuoi tornare a un esercizio di prima chiedilo al coach.',
    ],
  },
  'coach-diet': { title: 'Dietologo', body: ['Chiedi modifiche alla dieta (es. "domani a cena mangio la pizza"): cambia solo i pasti interessati e ricalcola il resto della giornata.'] },
  'coach-chat': { title: 'Chiedi al coach', body: ['Domande libere su allenamento e alimentazione. Il coach conosce il tuo storico e il tuo obiettivo.'] },
  'coach-checkin': {
    title: 'Check-in settimanale',
    body: [
      'Ogni settimana: poche domande, la foto (facoltativa) e l\'analisi del coach su allenamenti, peso, dieta e obiettivo.',
      'Qui arrivano anche le proposte per la settimana dopo: le applichi solo se le confermi.',
      'Ogni check-in resta salvato nel tuo account: con «Tutti i check-in» riapri quelli passati con risposte, numeri, analisi del coach, foto e modifiche applicate.',
    ],
  },
  'coach-proposals': {
    title: 'Proposte del coach',
    body: [
      'Modifiche suggerite dai tuoi dati: spostare un giorno che salti spesso, pianificare uno sgarro ricorrente, aggiornare la scheda a fine mesociclo.',
      'Niente cambia senza la tua conferma: attiva solo quelle che vuoi e premi Salva check-in.',
    ],
  },
  'goal-plan': {
    title: 'Obiettivo a fasi',
    body: ['Descrivi a parole dove vuoi arrivare: il coach crea le fasi con le date, controllando che il ritmo sia sicuro. Calorie e macro seguono la fase in corso.'],
  },

  /* ---------- Profilo ---------- */
  'profile-level': { title: 'Livello', body: ['Guadagni XP allenandoti, battendo record, compilando i resoconti, registrando la dieta e completando sfide e traguardi.'] },
  'profile-achievements': { title: 'Traguardi', body: ['Oltre 80 traguardi su forza, costanza, dieta e recupero. Bronzo, argento, oro e leggenda.'] },
  'profile-ranks': {
    title: 'Ranghi di forza',
    body: [
      'Il rango si calcola su tutti gli esercizi che fai con regolarità (almeno 2 sedute nelle ultime 8 settimane): massimale stimato degli ultimi 6 mesi diviso il peso corporeo. Vedi subito i 6 più frequenti, gli altri con «Mostra tutti i ranghi».',
      'Gli esercizi senza uno standard di forza sensato (es. addominali, plank) non hanno rango.',
      'Sette ranghi, ognuno col suo stemma: Ferro, Bronzo, Argento, Oro, Platino, Diamante, Campione.',
      'Per panca, squat, stacco, lento, rematore e lat machine ci sono tabelle note; per gli altri esercizi lo standard è stimato in base al tipo (scritto "standard stimato").',
      'Con i manubri conta il peso di un manubrio; trazioni, dip e flessioni contano il corpo più l\'eventuale zavorra. Per le donne gli standard sono più bassi.',
    ],
  },
} satisfies Record<string, { title: string; body: string[] }>;

export type HelpId = keyof typeof HELP;
