# Inventario Ristorante

Web app a pagina singola (nessun backend) per fare l'inventario fotografico di un ristorante.

- Foto (compresse a ~1024 px) e dati salvati sul telefono in IndexedDB: funziona anche senza rete.
- Scheda compilata a mano: tipologia, stato, CTM, quantità, zona, scadenza per FOOD/BEVERAGE.
- Tipologie modificabili dalle Impostazioni (aggiunta e rimozione); salvate nel telefono e nel backup.
- Export Excel (ExcelJS) ordinato per tipologia e zona, con foglio "Riepilogo":
  foto dentro le celle (Excel 365/2021+) oppure sopra le celle (anteprima iPhone/WhatsApp).
- Backup e ripristino completi in JSON.

Pubblicata da GitHub Pages su `/mirkogym/inventario/` (cartella `public/inventario`, copiata da Vite così com'è).
