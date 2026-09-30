import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Segmented, TextArea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/hooks/data-context';
import { useMyRecipes } from '@/hooks/use-food';
import { newRecipeId } from '@/lib/firestore';
import { prepareImage } from '@/lib/ai-bodyfat';
import { macrosFor } from '@/lib/foods';
import { userRecipeMacros } from '@/lib/recipes';
import type { RecipeIngredient, UserRecipe } from '@/types';
import { FoodPicker } from './FoodPicker';
import { MacroLine, fmtNum } from './shared';

const EMPTY = { name: '', kind: 'principale' as UserRecipe['kind'], servings: '2', minutes: '', steps: '', photo: undefined as string | undefined };

/** Crea o modifica una ricetta personale: i macro si calcolano dagli ingredienti. */
export function RecipeEditor({ open, recipe, onClose, onSaved }: { open: boolean; recipe?: UserRecipe | null; onClose: () => void; onSaved?: (r: UserRecipe) => void }) {
  const { uid } = useData();
  const { save } = useMyRecipes();
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [ings, setIngs] = useState<RecipeIngredient[]>([]);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (recipe) {
      setV({ name: recipe.name, kind: recipe.kind, servings: String(recipe.servings), minutes: recipe.minutes ? String(recipe.minutes) : '', steps: recipe.steps, photo: recipe.photo });
      setIngs(recipe.ingredients);
    } else {
      setV(EMPTY);
      setIngs([]);
    }
  }, [open, recipe]);

  const servings = Math.max(1, Math.round(Number(v.servings) || 1));
  const k = userRecipeMacros({ ingredients: ings, servings });
  const valid = v.name.trim().length > 1 && ings.length > 0;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { preview } = await prepareImage(file, 560);
      setV((x) => ({ ...x, photo: preview }));
    } catch {
      toast.error('Foto non leggibile');
    }
  };

  const submit = async () => {
    if (!uid || !valid) return;
    setSaving(true);
    const now = Date.now();
    const r: UserRecipe = {
      id: recipe?.id ?? newRecipeId(uid),
      name: v.name.trim(),
      kind: v.kind,
      servings,
      minutes: Number(v.minutes) > 0 ? Math.round(Number(v.minutes)) : undefined,
      ingredients: ings,
      steps: v.steps.trim(),
      photo: v.photo,
      createdAt: recipe?.createdAt ?? now,
      updatedAt: now,
    };
    await save(r);
    setSaving(false);
    toast.success(recipe ? 'Ricetta aggiornata' : 'Ricetta salvata');
    onSaved?.(r);
    onClose();
  };

  return (
    <>
      <Modal open={open && !picker} onClose={onClose} title={recipe ? 'Modifica ricetta' : 'Nuova ricetta'} dismissible={!saving}>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2"
            aria-label={v.photo ? 'Cambia foto' : 'Aggiungi foto'}
          >
            {v.photo ? (
              <img src={v.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-fg-3">
                <Camera className="h-8 w-8" aria-hidden />
                <span className="text-sm">Aggiungi una foto del piatto</span>
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />

          <Input label="Nome della ricetta" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <div>
            <div className="section-title">Tipo di pasto</div>
            <Segmented<UserRecipe['kind']>
              label="Tipo di pasto"
              value={v.kind}
              onChange={(kind) => setV({ ...v, kind })}
              options={[
                { value: 'colazione', label: 'Colazione' },
                { value: 'principale', label: 'Pranzo/cena' },
                { value: 'spuntino', label: 'Spuntino' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Porzioni" inputMode="numeric" value={v.servings} onChange={(e) => setV({ ...v, servings: e.target.value })} />
            <Input label="Minuti (facoltativo)" inputMode="numeric" value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })} />
          </div>

          <section>
            <div className="section-title">Ingredienti (per tutta la ricetta)</div>
            {ings.length === 0 && <p className="mb-2 text-sm text-fg-3">Aggiungi gli ingredienti con i grammi: calorie e macro si calcolano da soli.</p>}
            <ul className="divide-y divide-line-subtle">
              {ings.map((i, idx) => {
                const m = macrosFor(i.per100, i.grams);
                return (
                  <li key={`${i.foodId}-${idx}`} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-fg">{i.name}</span>
                      <span className="block text-xs text-fg-3">
                        {m.kcal} kcal · P {fmtNum(m.protein)} · C {fmtNum(m.carbs)} · G {fmtNum(m.fat)}
                      </span>
                    </span>
                    <input
                      inputMode="decimal"
                      aria-label={`Grammi di ${i.name}`}
                      value={i.grams}
                      onChange={(e) => {
                        const g = Number(e.target.value.replace(',', '.'));
                        setIngs(ings.map((x, j) => (j === idx ? { ...x, grams: Number.isFinite(g) ? g : 0 } : x)));
                      }}
                      className="h-10 w-20 rounded-md border border-line bg-surface-2 px-2 text-right text-base text-fg outline-none focus:border-accent-500"
                    />
                    <span className="text-sm text-fg-3">g</span>
                    <button type="button" aria-label={`Rimuovi ${i.name}`} onClick={() => setIngs(ings.filter((_, j) => j !== idx))} className="p-2 text-fg-3">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button className="mt-2" variant="secondary" fullWidth icon={<Plus className="h-5 w-5" />} onClick={() => setPicker(true)}>
              Aggiungi ingrediente
            </Button>
          </section>

          {ings.length > 0 && (
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs uppercase text-fg-3">Per porzione ({servings} porzioni)</div>
              <MacroLine kcal={k[0]} protein={k[1]} carbs={k[2]} fat={k[3]} />
            </div>
          )}

          <TextArea label="Preparazione (un passaggio per riga)" rows={5} value={v.steps} onChange={(e) => setV({ ...v, steps: e.target.value })} />
          <Button fullWidth size="lg" loading={saving} disabled={!valid} onClick={() => void submit()}>
            Salva ricetta
          </Button>
        </div>
      </Modal>
      <FoodPicker
        open={open && picker}
        onClose={() => setPicker(false)}
        title="Aggiungi ingrediente"
        onPickFood={(food, grams) => {
          setIngs((x) => [...x, { foodId: food.id, name: food.brand ? `${food.name} (${food.brand})` : food.name, grams, per100: food.per100 }]);
          setPicker(false);
        }}
      />
    </>
  );
}
