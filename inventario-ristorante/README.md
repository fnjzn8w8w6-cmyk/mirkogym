# Inventario Ristorante

Web app a pagina singola (nessun backend) per fare l'inventario fotografico di un ristorante.

- Riconoscimento oggetti con Gemini Flash (piano gratuito di Google AI Studio), chiamato dal browser.
  La chiave si inserisce in Impostazioni e resta solo sul telefono (localStorage).
- Dati e foto (compresse a ~1024 px) salvati sul telefono in IndexedDB. Senza rete le foto vanno in coda
  e vengono analizzate quando la connessione torna.
- Export Excel (ExcelJS) con foto nelle celle, ordinato per tipologia e zona, più foglio "Riepilogo".
- Backup e ripristino completi in JSON.

## File da pubblicare
`index.html`, `sw.js`, `manifest.json`, `icon-180.png`, `icon-192.png`, `icon-512.png`
(tutti nella stessa cartella, ad esempio la radice di un repository GitHub con GitHub Pages attivo).
