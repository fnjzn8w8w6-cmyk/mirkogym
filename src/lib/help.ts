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
  'train-analysis': {
    title: 'Analisi',
    body: [
      'Il coach legge tutto lo storico (sessioni, resoconti, note, diario, obiettivo) e ti scrive cosa va bene, cosa migliorare e 3 azioni concrete.',
      'L\'analisi resta salvata: aggiornala quando hai fatto nuove sessioni.',
    ],
  },
  'session-suggestion': {
    title: 'Carico suggerito',
    body: [
      'Calcolato dalla tua ultima volta su questo esercizio: se hai raggiunto le ripetizioni obiettivo si sale di carico, altrimenti si consolida.',
      'RIR calibrato: l\'app impara quanto sei preciso quando dici "me ne restavano 2". Se tendi a lasciarne di più, il carico suggerito sale un po\'.',
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
      'Sopra 70/100 quel gruppo fa una settimana leggera: carichi −30% e una serie in meno. Il resto della scheda resta normale.',
    ],
  },
  'session-swap': {
    title: 'Sostituisci esercizio',
    body: ['Scegli un esercizio alternativo. Il carico equivalente è calcolato con rapporti di forza standard tra attrezzi (es. manubri ≈ 75% del bilanciere in totale) e poi con i tuoi dati reali quando hai fatto entrambi gli esercizi.'],
  },

  /* ---------- Corpo ---------- */
  'body-composition': {
    title: 'Composizione corporea',
    body: ['Peso, massa grassa, massa magra e FFMI (quanto muscolo hai rispetto all\'altezza). La massa grassa viene dalla misura più recente (inserita, formula o stima da foto).'],
  },
  'body-status': {
    title: 'Sei nell\'obiettivo?',
    body: ['Confronta la velocità reale con cui cambia il peso con quella necessaria per il tuo obiettivo. Servono almeno 4 pesate in 10 giorni.'],
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
    title: 'Foto dei progressi',
    body: [
      'Le foto del check-in settimanale, salvate solo nel tuo account. Tocca due foto per confrontarle con il cursore prima/dopo.',
      'Per confronti affidabili: stesso posto e stessa luce, al mattino a digiuno.',
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
  'body-metabolism': {
    title: 'Il tuo metabolismo',
    body: [
      'Le calorie che consumi davvero, calcolate da quanto mangi (diario) e da come cambia il peso reale: è più preciso delle formule.',
      'Si aggiorna ogni giorno, ma l\'obiettivo calorico si muove al massimo di 50 kcal al giorno per non oscillare.',
      'Servono almeno 7 giornate complete nel diario nelle ultime 3 settimane. Prima di allora si usa la formula.',
    ],
  },
  'body-measurements': { title: 'Misure', body: ['Le circonferenze registrate, con la differenza rispetto alla misura precedente.'] },

  /* ---------- Dieta ---------- */
  'diet-diary': {
    title: 'Diario',
    body: [
      'Il diario è quello che conta: calorie, metabolismo, check-in e coach si basano su quello che hai mangiato davvero, non sul piano.',
      'In ogni pasto: "Alimento" (ricerca, codice a barre), "Ricetta" (la libreria con le tue ricette e il ricettario), "Piano" (il pasto suggerito dal piano per quel giorno) e la fotocamera per la foto del piatto.',
      'Se un pasto è vuoto e il piano ha un suggerimento, lo vedi nel riquadro tratteggiato: lo aggiungi con un tocco oppure scegli altro.',
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
    title: 'Calorie che seguono la scheda',
    body: [
      'L\'app impara dallo storico in quali giorni della settimana ti alleni. In quei giorni ci sono più carboidrati, nei giorni di riposo meno: il totale settimanale resta uguale.',
      'Se ti alleni in un giorno di riposo, l\'obiettivo di quel giorno sale in automatico.',
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
      'Quando ti mancano calorie per arrivare all\'obiettivo, l\'app ti propone 3 pasti con le quantità già calcolate per chiudere calorie e macro rimanenti (prima le proteine).',
      'Le idee partono dal tuo storico: i pasti che hai già mangiato in quel momento della giornata, poi il piano di oggi, poi abbinamenti e ricette compatibili con dieta e allergie.',
      '"Tutto in questo pasto" usa tutte le calorie che mancano per il pasto scelto (anche solo uno spuntino); "Dividi tra i pasti vuoti" lascia una parte per gli altri pasti della giornata.',
      'Quello che aggiungi conta come "mi piace", quello che salti con "Altre idee" viene proposto meno: i suggerimenti imparano dai tuoi gusti.',
    ],
  },
  'complete-day': { title: 'Giornata completa', body: ['Se nel diario manca qualche pasto, rispondi "No": quella giornata non verrà usata per calcolare il tuo metabolismo.'] },

  /* ---------- Coach ---------- */
  'coach-training': { title: 'Coach allenamento', body: ['Chiedi una modifica alla scheda in parole tue (es. "ho male al ginocchio, togli l\'hack squat"): il coach cambia solo quello che serve e ti mostra l\'anteprima.'] },
  'coach-diet': { title: 'Dietologo', body: ['Chiedi modifiche alla dieta (es. "domani a cena mangio la pizza"): cambia solo i pasti interessati e ricalcola il resto della giornata.'] },
  'coach-chat': { title: 'Chiedi al coach', body: ['Domande libere su allenamento e alimentazione. Il coach conosce il tuo storico e il tuo obiettivo.'] },
  'coach-checkin': {
    title: 'Check-in settimanale',
    body: [
      'Ogni settimana: poche domande, la foto (facoltativa) e l\'analisi del coach su allenamenti, peso, dieta e obiettivo.',
      'Qui arrivano anche le proposte per la settimana dopo: le applichi solo se le confermi.',
    ],
  },
  'coach-proposals': {
    title: 'Proposte del coach',
    body: [
      'Modifiche suggerite dai tuoi dati: spostare un giorno che salti spesso, pianificare uno sgarro ricorrente, aggiornare la scheda a fine mesociclo.',
      'Niente cambia senza la tua conferma: attiva solo quelle che vuoi e premi Applica.',
    ],
  },
  'goal-plan': {
    title: 'Obiettivo a fasi',
    body: ['Descrivi a parole dove vuoi arrivare: il coach crea le fasi con le date, controllando che il ritmo sia sicuro. Calorie e macro seguono la fase in corso.'],
  },

  /* ---------- Profilo ---------- */
  'profile-level': { title: 'Livello', body: ['Guadagni XP allenandoti, battendo record, compilando i resoconti, registrando la dieta e completando sfide e traguardi.'] },
  'profile-achievements': { title: 'Traguardi', body: ['Oltre 80 traguardi su forza, costanza, dieta e recupero. Bronzo, argento, oro e leggenda.'] },
  'profile-ranks': { title: 'Ranghi di forza', body: ['Il tuo massimale stimato sui fondamentali rispetto al peso corporeo, confrontato con standard indicativi.'] },
} satisfies Record<string, { title: string; body: string[] }>;

export type HelpId = keyof typeof HELP;
