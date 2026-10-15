import { useState } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { useBodyLogs } from '@/hooks/use-body-logs';
import { useRecentFoodLogs } from '@/hooks/use-athlete';
import { useEnergy } from '@/hooks/use-energy';
import { useEffectiveProfile } from '@/hooks/use-effective-profile';
import { completeDays, METABOLISM_RELIABLE_DAYS, METABOLISM_WEIGH_DAYS, SETTLING_DAYS, weighSpan } from '@/lib/body-model';
import { metabolismReliable } from '@/lib/coach';
import { composition, tdee } from '@/lib/metabolism';
import { ENERGY_WINDOW } from '@/lib/energy';
import { mondayISO } from '@/lib/date-utils';
import { parseNum } from '@/hooks/use-active-session';
import { settle } from '@/lib/firestore';
import { SectionTitle } from '@/components/ui/Help';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatKg } from '@/lib/analytics';

const nf = (n: number) => Math.round(n).toLocaleString('it-IT');

/** Consumo giornaliero voce per voce (basale, movimento, allenamenti, digestione) e verifica col diario. */
export function EnergyCard() {
  const { settings, update } = useSettings();
  const { bodyLogs } = useBodyLogs();
  const foodLogs = useRecentFoodLogs(21);
  const e = useEnergy();
  const p = useEffectiveProfile();
  const [editSteps, setEditSteps] = useState(false);
  const [steps, setSteps] = useState('');
  if (!e || !p || !settings.profile) return null;
  const m = settings.metabolism;
  const reliable = metabolismReliable(m);
  const complete = completeDays(foodLogs).length;
  const span = weighSpan(bodyLogs);
  const wk = settings.weekCal && settings.weekCal.week === mondayISO() ? settings.weekCal : null;
  // consumo su cui sono calcolate le calorie di questa settimana (le settimane vecchie usavano la formula senza allenamenti)
  const weekValue = wk ? (wk.tdee ?? wk.formula ?? tdee(p)) : null;
  const lean = composition(p).lean;

  const saveSteps = (v: number | undefined) => {
    // 0 = nessun valore (il salvataggio unisce i campi, quindi non si può solo togliere la chiave)
    void settle(update({ profile: { ...settings.profile!, stepsPerDay: v ?? 0 } }));
    setEditSteps(false);
  };

  const rows: { emoji: string; label: string; note: string; value: number; action?: React.ReactNode }[] = [
    {
      emoji: '🫀',
      label: 'Basale',
      note: e.bmrMethod === 'katch' ? `dalla massa magra (${formatKg(lean)} kg)` : 'da peso, altezza ed età',
      value: e.bmr,
    },
    {
      emoji: '🚶',
      label: 'Movimento',
      note: `${nf(e.steps)} passi al giorno${e.stepsSource === 'level' ? ' (stima)' : ''} + movimento quotidiano`,
      value: e.neat,
      action: (
        <button
          type="button"
          className="text-xs font-semibold text-accent-400"
          onClick={() => {
            setSteps(settings.profile?.stepsPerDay ? String(settings.profile.stepsPerDay) : '');
            setEditSteps((v) => !v);
          }}
        >
          {e.stepsSource === 'level' ? 'Inserisci i tuoi passi' : 'Modifica i passi'}
        </button>
      ),
    },
    {
      emoji: '🏋️',
      label: 'Allenamenti',
      note:
        e.eatSource === 'sessions'
          ? `${e.eatSessions} ${e.eatSessions === 1 ? 'sessione' : 'sessioni'} negli ultimi ${ENERGY_WINDOW} giorni (durata, serie, esercizi)`
          : `${e.eatSessions} a settimana previsti dalla scheda`,
      value: e.eat,
    },
    {
      emoji: '🍽️',
      label: 'Digestione',
      note: e.tefSource === 'diary' ? 'dai macro del tuo diario (le proteine costano di più)' : '10% del totale (stima, finché il diario è vuoto)',
      value: e.tef,
    },
  ];

  return (
    <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-fg-2">
      <SectionTitle help="body-metabolism" isNew className="text-xs font-bold uppercase tracking-wider text-fg-3">
        Il tuo consumo
      </SectionTitle>
      <p className="mt-1">
        🔥 <strong className="font-display text-xl text-fg">{nf(e.total)} kcal</strong> al giorno
      </p>
      <ul className="mt-2 divide-y divide-line-subtle">
        {rows.map((r) => (
          <li key={r.label} className="py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-fg">
                {r.emoji} <strong>{r.label}</strong>
              </span>
              <span className="font-semibold text-fg">{nf(r.value)}</span>
            </div>
            <div className="text-xs text-fg-3">{r.note}</div>
            {r.action && <div className="mt-1">{r.action}</div>}
            {r.label === 'Movimento' && editSteps && (
              <div className="mt-2 rounded-md bg-surface-3 p-2">
                <Input label="Passi medi al giorno" kind="number" value={steps} onChange={(ev) => setSteps(ev.target.value.replace(/\D/g, ''))} />
                <p className="mt-1 text-xs text-fg-3">Su iPhone: app Salute → Passi → S (media della settimana). Basta aggiornarlo ogni tanto.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={!parseNum(steps) || (parseNum(steps) ?? 0) > 60000} onClick={() => saveSteps(Math.round(parseNum(steps) ?? 0))}>
                    Salva
                  </Button>
                  {Boolean(settings.profile?.stepsPerDay) && (
                    <Button size="sm" variant="secondary" onClick={() => saveSteps(undefined)}>
                      Usa la stima
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditSteps(false)}>
                    Annulla
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Verifica con diario e peso */}
      <div className="mt-2 border-t border-line pt-2">
        {m && m.anomalous ? (
          <p>
            ⚠️ Dal diario e dal peso risulterebbero <strong className="text-fg">{nf(m.measured ?? 0)} kcal</strong>: troppo lontano dal calcolo. Il peso si sta muovendo
            soprattutto per acqua e glicogeno, quindi per ora non lo uso.
          </p>
        ) : m && reliable ? (
          <p>
            ✅ Confermato dal diario e dal peso: <strong className="text-fg">{nf(m.tdee)} kcal</strong> (±{m.sd}), {m.days} giornate complete. È il valore usato per le calorie.
          </p>
        ) : m ? (
          <p>
            ⏳ Verifica dal diario: <strong className="text-fg">{nf(m.tdee)} kcal</strong> (±{m.sd}), provvisoria. Diventa affidabile con {METABOLISM_RELIABLE_DAYS} giornate
            complete (ora {Math.min(m.days, METABOLISM_RELIABLE_DAYS)}/{METABOLISM_RELIABLE_DAYS}) e {METABOLISM_RELIABLE_DAYS} giorni di pesate (ora{' '}
            {Math.min(m.span ?? span, METABOLISM_RELIABLE_DAYS)}/{METABOLISM_RELIABLE_DAYS}).
          </p>
        ) : (
          <p>
            📊 Per verificarlo con il diario servono 7 giornate complete negli ultimi 21 giorni (ora {Math.min(complete, 7)}/7) e {METABOLISM_WEIGH_DAYS} giorni di pesate
            dopo la prima settimana di assestamento (ora {Math.min(span, METABOLISM_WEIGH_DAYS)}/{METABOLISM_WEIGH_DAYS}).
          </p>
        )}
        {weekValue != null && Math.abs(weekValue - (m && reliable ? m.tdee : e.total)) >= 50 && (
          <p className="mt-1 text-xs text-fg-3">
            Le calorie di questa settimana usano {nf(weekValue)} kcal (fissate a inizio settimana): il valore aggiornato entra lunedì prossimo, con cambi di al massimo 200 kcal a
            settimana.
          </p>
        )}
        {span > 0 && span < METABOLISM_WEIGH_DAYS && (
          <p className="mt-1 text-xs text-fg-3">La prima settimana di pesate ({SETTLING_DAYS} giorni) non conta: con una dieta nuova il peso cambia per acqua e glicogeno.</p>
        )}
      </div>
    </div>
  );
}
