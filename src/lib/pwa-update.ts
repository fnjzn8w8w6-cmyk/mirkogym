/**
 * Aggiornamenti della web app.
 * Su iPhone la web app aperta dalla Home viene "ripresa" dallo sfondo senza ricaricare la pagina,
 * quindi il service worker non controllerebbe mai se c'è una versione nuova. Qui:
 * - si controlla all'avvio, ogni volta che l'app torna in primo piano e ogni 30 minuti;
 * - la nuova versione si attiva e la pagina si ricarica da sola (registerType autoUpdate);
 * - durante un allenamento in corso non si controlla, per non ricaricare mentre ti alleni.
 */
import { registerSW } from 'virtual:pwa-register';

const inSession = () => location.hash.startsWith('#/session/');

export function setupUpdates() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = 0;
  const check = () => {
    if (!registration || !navigator.onLine || inSession() || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    void registration.update().catch(() => undefined);
  };

  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      registration = r;
      check();
      window.setInterval(check, 30 * 60_000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
      window.addEventListener('hashchange', check);
    },
  });
}
