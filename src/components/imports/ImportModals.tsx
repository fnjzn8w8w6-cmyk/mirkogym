import { useRef, useState, type ReactNode } from 'react';
import { Camera, Check, FileUp, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MicButton, appendText } from '@/components/ui/MicButton';
import { AIBusy, useAITask } from '@/components/coach/AIBusy';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { settle } from '@/lib/firestore';
import { macrosFor } from '@/lib/foods';
import { analyzeMealPhoto, dietToWeekPlan, guessMacros, importDiet, importSchedule, type FoodGuess, type ImportedDiet, type ImportMatch } from '@/lib/imports';
import { ExerciseBrowser } from '@/components/library/ExerciseBrowser';
import { displayName, groupForLibrary } from '@/lib/exercise-library';
import { cn } from '@/lib/cn';
import type { Day } from '@/types';

const numIn = 'w-16 rounded-md border border-line bg-surface-2 px-2 py-1 text-right text-sm text-fg';
const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

/** Pulsante che apre la scelta di foto/PDF (su iPhone: Fotocamera, Libreria foto o File). */
function PickFiles({ onFiles, label, camera, icon }: { onFiles: (f: File[]) => void; label: string; camera?: boolean; icon?: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        accept={camera ? 'image/*' : 'image/*,application/pdf'}
        multiple={!camera}
        {...(camera ? { capture: 'environment' } : {})}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, 6);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
        data-testid="import-file"
      />
      <Button fullWidth size="lg" icon={icon ?? <FileUp className="h-5 w-5" />} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

function FoodRows({ items, onChange }: { items: FoodGuess[]; onChange: (i: FoodGuess[]) => void }) {
  return (
    <ul className="divide-y divide-line-subtle">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-fg">{it.name}</span>
            <span className="block text-xs text-fg-3">
              {macrosFor(it.per100, it.grams).kcal} kcal{it.matched ? '' : ' · stima AI'}
            </span>
          </span>
          <input
            aria-label={`Grammi ${it.name}`}
            inputMode="numeric"
            className={numIn}
            value={it.grams}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, grams: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) } : x)))}
          />
          <span className="text-xs text-fg-3">g</span>
          <button type="button" aria-label={`Rimuovi ${it.name}`} className="p-1 text-fg-3" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const Totals = ({ items }: { items: FoodGuess[] }) => {
  const m = guessMacros(items);
  return (
    <p className="text-sm font-semibold text-fg">
      {m.kcal} kcal <span className="font-normal text-fg-2">· P {Math.round(m.protein)} · C {Math.round(m.carbs)} · G {Math.round(m.fat)}</span>
    </p>
  );
};

/* ---------- Foto del piatto ---------- */

export function MealPhotoModal({ open, onClose, mealLabel, onAdd }: { open: boolean; onClose: () => void; mealLabel: string; onAdd: (items: FoodGuess[]) => void }) {
  const ai = useAITask();
  const [note, setNote] = useState('');
  const [items, setItems] = useState<FoodGuess[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const close = () => {
    ai.cancel();
    setItems(null);
    setNote('');
    setPreview(null);
    onClose();
  };
  const analyze = async (f: File) => {
    setPreview(URL.createObjectURL(f));
    const r = await ai.run((o) => analyzeMealPhoto(f, note, o));
    if (r) setItems(r);
  };
  return (
    <Modal open={open} onClose={close} title={`Foto del piatto · ${mealLabel}`}>
      <div className="space-y-3">
        {preview && <img src={preview} alt="Il tuo piatto" className="max-h-48 w-full rounded-lg object-cover" />}
        {ai.busy ? (
          <AIBusy persona="photo" status={ai.status} onCancel={ai.cancel} />
        ) : items ? (
          <>
            <p className="text-sm text-fg-2">Controlla e correggi i grammi: la stima da foto può sbagliare del 20-30%, soprattutto su olio e condimenti.</p>
            <FoodRows items={items} onChange={setItems} />
            <Totals items={items} />
            <Button fullWidth disabled={!items.some((i) => i.grams > 0)} onClick={() => (onAdd(items.filter((i) => i.grams > 0)), close())}>
              Aggiungi al diario
            </Button>
          </>
        ) : (
          <>
            <div className="relative [&_textarea]:pr-14">
              <label className="mb-1 block text-sm text-fg-2" htmlFor="meal-note">
                Nota facoltativa (es. "2 cucchiai d'olio", "80 g di pasta")
              </label>
              <textarea id="meal-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-line bg-surface-2 p-3 text-base text-fg" />
              <div className="absolute right-2 top-8">
          <MicButton size="sm" onText={(t) => setNote((n) => appendText(n, t))} />
        </div>
            </div>
            <PickFiles camera label="Scatta o scegli la foto" icon={<Camera className="h-5 w-5" />} onFiles={(f) => void analyze(f[0])} />
          </>
        )}
        {ai.error && <p className="text-sm text-danger" role="alert">{ai.error}</p>}
      </div>
    </Modal>
  );
}

/* ---------- Dieta del nutrizionista ---------- */

export function DietImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ai = useAITask();
  const toast = useToast();
  const { update } = useSettings();
  const [diet, setDiet] = useState<ImportedDiet | null>(null);
  const close = () => (ai.cancel(), setDiet(null), onClose());
  const setItems = (d: number, m: number, items: FoodGuess[]) =>
    setDiet((x) => x && { ...x, days: x.days.map((day, i) => (i !== d ? day : day.map((meal, j) => (j === m ? { ...meal, items } : meal)))) });
  const save = async () => {
    if (!diet) return;
    await settle(update({ weekPlan: dietToWeekPlan(diet) }));
    toast.success('Dieta del nutrizionista importata');
    close();
  };
  return (
    <Modal open={open} onClose={close} title="Importa la dieta del nutrizionista">
      <div className="space-y-3">
        {ai.busy ? (
          <AIBusy persona="diet" status={ai.status} onCancel={ai.cancel} />
        ) : diet ? (
          <>
            <p className="text-sm text-fg-2">
              {diet.days.length === 1 ? 'Stessa dieta tutti i giorni.' : `${diet.days.length} giorni diversi.`} Controlla alimenti e grammi, poi salva: sostituirà il piano settimanale.
            </p>
            {diet.days.map((day, d) => (
              <div key={d} className="rounded-lg border border-line-subtle p-3">
                {diet.days.length > 1 && <div className="mb-1 font-display text-sm font-bold text-accent-400">{DAY_NAMES[d]}</div>}
                {day.map((meal, m) => (
                  <div key={m} className="mt-2">
                    <div className="flex justify-between text-sm font-semibold capitalize text-fg">
                      {meal.slot} <span className="font-normal text-fg-3">{guessMacros(meal.items).kcal} kcal</span>
                    </div>
                    <FoodRows items={meal.items} onChange={(i) => setItems(d, m, i)} />
                    {meal.alternatives && <p className="text-xs text-fg-3">Oppure: {meal.alternatives}</p>}
                  </div>
                ))}
              </div>
            ))}
            {diet.notes && <p className="text-sm text-fg-2">📝 {diet.notes}</p>}
            <Button fullWidth onClick={() => void save()}>
              Salva come piano settimanale
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-2">Carica le foto o il PDF della dieta: l'AI legge pasti e grammature, l'app calcola i macro. Prima di salvare puoi controllare tutto.</p>
            <PickFiles label="Scegli foto o PDF" onFiles={async (f) => setDiet(await ai.run((o) => importDiet(f, o)))} />
          </>
        )}
        {ai.error && <p className="text-sm text-danger" role="alert">{ai.error}</p>}
      </div>
    </Modal>
  );
}

/* ---------- Scheda del personal trainer ---------- */

export function ScheduleImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ai = useAITask();
  const toast = useToast();
  const { save } = useSchedule();
  const [days, setDays] = useState<Day[] | null>(null);
  const [matches, setMatches] = useState<Record<string, ImportMatch>>({});
  const [picking, setPicking] = useState<{ d: number; e: number } | null>(null);
  const close = () => (ai.cancel(), setDays(null), setMatches({}), onClose());
  const edit = (d: number, e: number, patch: Partial<Day['exercises'][number]> | null) =>
    setDays((x) =>
      x &&
      x.map((day, i) =>
        i !== d ? day : { ...day, exercises: patch ? day.exercises.map((ex, j) => (j === e ? { ...ex, ...patch } : ex)) : day.exercises.filter((_, j) => j !== e) },
      ),
    );
  const n = (v: string) => Math.max(1, Math.min(100, Number(v.replace(/\D/g, '')) || 1));
  return (
    <>
    <Modal open={open} onClose={close} title="Importa la scheda del personal trainer">
      <div className="space-y-3">
        {ai.busy ? (
          <AIBusy persona="scan" status={ai.status} onCancel={ai.cancel} />
        ) : days ? (
          <>
            <p className="text-sm text-fg-2">
              Ogni esercizio del PDF è collegato a uno della libreria (demo, istruzioni, storico). Controlla quelli in giallo con «Verifica» e quelli
              non trovati: tocca «Cambia» per scegliere quello giusto. Salvando sostituisci la scheda attuale; lo storico resta.
            </p>
            {days.map((day, d) => (
              <div key={d} className="rounded-lg border border-line-subtle p-3">
                <div className="font-display text-sm font-bold text-accent-400">
                  {day.name} · <span className="text-fg">{day.subtitle}</span>
                </div>
                {day.exercises.map((ex, e) => (
                  <div
                    key={ex.id}
                    className={cn(
                      'mt-2 rounded-md p-2',
                      matches[ex.id]?.confidence === 'dubbio' && 'border border-warning/40 bg-warning-bg',
                      (!ex.libraryId || matches[ex.id]?.confidence === 'none') && 'border border-danger/40 bg-danger-bg',
                    )}
                  >
                  {matches[ex.id] && <div className="text-xs text-fg-3">Nel PDF: “{matches[ex.id].pdf}”</div>}
                  <div className="mt-0.5 flex items-start gap-1.5 text-base font-semibold text-fg">
                    {ex.libraryId ? <Check className={cn('mt-1 h-4 w-4 shrink-0', matches[ex.id]?.confidence === 'dubbio' ? 'text-warning' : 'text-accent-400')} aria-hidden /> : null}
                    <span className="min-w-0">{ex.name}</span>
                  </div>
                  <div className="text-xs text-fg-3">
                    {!ex.libraryId ? 'Non trovato nella libreria · ' : matches[ex.id]?.confidence === 'dubbio' ? 'Verifica · ' : ''}
                    {ex.group} · rec. {ex.rest}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input aria-label={`Serie ${ex.name}`} inputMode="numeric" className={numIn + ' !w-10'} value={ex.sets} onChange={(v) => edit(d, e, { sets: n(v.target.value) })} />
                    <span className="text-xs text-fg-3">×</span>
                    <input aria-label={`Ripetizioni min ${ex.name}`} inputMode="numeric" className={numIn + ' !w-10'} value={ex.repMin} onChange={(v) => edit(d, e, { repMin: n(v.target.value) })} />
                    <span className="text-xs text-fg-3">-</span>
                    <input aria-label={`Ripetizioni max ${ex.name}`} inputMode="numeric" className={numIn + ' !w-10'} value={ex.repMax} onChange={(v) => edit(d, e, { repMax: n(v.target.value) })} />
                    <button type="button" className="ml-auto h-9 px-1 text-sm font-semibold text-accent-400" onClick={() => setPicking({ d, e })}>
                      Cambia
                    </button>
                    <button type="button" aria-label={`Rimuovi ${ex.name}`} className="p-1 text-fg-3" onClick={() => edit(d, e, null)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  </div>
                ))}
              </div>
            ))}
            <Button
              fullWidth
              onClick={async () => {
                await settle(save(days.filter((d) => d.exercises.length)));
                toast.success('Scheda importata');
                close();
              }}
            >
              Salva come mia scheda
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-2">Carica le foto o il PDF della scheda: l'AI legge giorni, esercizi, serie, ripetizioni e recuperi. Prima di salvare puoi correggere tutto.</p>
            <PickFiles
              label="Scegli foto o PDF"
              onFiles={async (f) => {
                const r = await ai.run((o) => importSchedule(f, o));
                if (r) {
                  setDays(r.days);
                  setMatches(r.matches);
                  const todo = Object.values(r.matches).filter((m) => m.confidence !== 'ok').length;
                  if (todo) toast.info(todo === 1 ? '1 esercizio da verificare' : `${todo} esercizi da verificare`);
                }
              }}
            />
          </>
        )}
        {ai.error && <p className="text-sm text-danger" role="alert">{ai.error}</p>}
      </div>
    </Modal>
    <Modal open={picking != null} onClose={() => setPicking(null)} title="Scegli l'esercizio giusto">
      {picking && days && (
        <ExerciseBrowser
          initialQuery={matches[days[picking.d].exercises[picking.e].id]?.pdf ?? ''}
          pickLabel="Usa questo esercizio"
          onPick={(lib) => {
            const ex = days[picking.d].exercises[picking.e];
            edit(picking.d, picking.e, { libraryId: lib.id, name: displayName(lib), group: groupForLibrary(lib) });
            setMatches((m) => ({ ...m, [ex.id]: { pdf: m[ex.id]?.pdf ?? ex.name, confidence: 'ok' } }));
            setPicking(null);
          }}
        />
      )}
    </Modal>
    </>
  );
}
