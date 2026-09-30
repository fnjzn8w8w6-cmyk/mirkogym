import { useEffect } from 'react';

/** Tiene lo schermo acceso finché `active` è true (Screen Wake Lock API; no-op se non supportata). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* es. batteria scarica o pagina non visibile: ignorato */
      }
    };
    // Il lock viene rilasciato quando l'app va in background: lo richiediamo al ritorno
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
