import { useEffect, useState } from 'react';
import { CalendarPlus, Clock, Languages, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { AIBusy, useAITask } from '@/components/coach/AIBusy';
import { CATEGORY_IT, flag, ingredientIt, recipeName, recipeNative, type Recipe } from '@/lib/recipes';
import { cachedTranslation, translateRecipe, type RecipeIt } from '@/lib/recipe-ai';
import { FavoriteButton, MacroLine, RecipeImage } from './shared';

const DIET_IT: Record<string, string> = { vegan: '🌱 Vegana', vegetarian: '🥚 Vegetariana', pescatarian: '🐟 Pescetariana', 'gluten-free': '🌾 Senza glutine' };
const DIFF_IT: Record<string, string> = { easy: 'Facile', medium: 'Media', hard: 'Impegnativa' };
const UNIT: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', piece: 'pz', tbsp: 'cucchiai', tsp: 'cucchiaini', clove: 'spicchi', slice: 'fette', sprig: 'rametti', pinch: 'pizzico', cup: 'tazze' };

function qty(q: number | null, unit: string, scaling: string, factor: number): string {
  if (q == null || unit === 'toTaste') return 'q.b.';
  const k = scaling === 'fixed' ? 1 : scaling === 'damped' ? factor ** 0.8 : factor;
  const v = q * k;
  const r = unit === 'g' || unit === 'ml' ? Math.round(v / 5) * 5 || Math.round(v) : Math.round(v * 4) / 4;
  return `${String(r).replace('.', ',')} ${UNIT[unit] ?? unit}`;
}

interface Props {
  recipe: Recipe | null;
  onClose: () => void;
  /** Porzioni previste nel piano (se aperta da un pasto del piano). */
  servings?: number;
  onAddToPlan?: (r: Recipe) => void;
}

export function RecipeDetail({ recipe, onClose, servings, onAddToPlan }: Props) {
  const ai = useAITask();
  const [it, setIt] = useState<RecipeIt | null>(null);

  useEffect(() => {
    setIt(recipe ? cachedTranslation(recipe.id) : null);
    ai.setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  const r = recipe;
  const portions = servings ?? r?.sv ?? 1;
  const factor = r ? portions / (r.sv || 1) : 1;

  return (
    <Modal open={Boolean(r)} onClose={onClose} title={r ? (it?.name ?? recipeName(r)) : ''}>
      {r && (
        <div className="space-y-4">
          <div className="relative -mx-5 overflow-hidden">
            <RecipeImage recipe={r} className="aspect-[4/3] w-full" />
            <FavoriteButton id={r.id} className="absolute right-3 top-3" />
          </div>
          {r.ph && (
            <p className="-mt-3 text-[11px] text-fg-3">
              Foto: {r.ph[1] || 'UniTools'} · {r.ph[2] || 'CC BY-SA 4.0'}
            </p>
          )}
          <div>
            {recipeNative(r) && <div className="text-sm italic text-fg-3">{recipeNative(r)}</div>}
            <p className="mt-1 text-base text-fg-2">{it?.summary || r.s}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip>
                {flag(r.co)} {CATEGORY_IT[r.c] ?? r.c}
              </Chip>
              <Chip icon={<Clock className="h-3.5 w-3.5" />}>{r.t} min</Chip>
              <Chip>{DIFF_IT[r.df] ?? r.df}</Chip>
              {r.d.map((d) => DIET_IT[d] && <Chip key={d} tone="success">{DIET_IT[d]}</Chip>)}
            </div>
          </div>

          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs uppercase text-fg-3">Per porzione</div>
            <MacroLine kcal={r.k[0]} protein={r.k[1]} carbs={r.k[2]} fat={r.k[3]} />
            {servings != null && servings !== 1 && (
              <>
                <div className="mt-2 text-xs uppercase text-fg-3">Nel tuo piano ({String(servings).replace('.', ',')} porzioni)</div>
                <MacroLine kcal={r.k[0] * servings} protein={r.k[1] * servings} carbs={r.k[2] * servings} fat={r.k[3] * servings} />
              </>
            )}
          </div>

          {onAddToPlan && (
            <Button fullWidth icon={<CalendarPlus className="h-5 w-5" />} onClick={() => onAddToPlan(r)}>
              Aggiungi al piano settimanale
            </Button>
          )}

          <section>
            <div className="section-title flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden /> Ingredienti · {String(portions).replace('.', ',')} {portions === 1 ? 'porzione' : 'porzioni'}
            </div>
            <ul className="divide-y divide-line-subtle">
              {r.i.map(([id, name, q, unit, scaling, note], j) => (
                <li key={`${id}-${j}`} className="flex items-baseline justify-between gap-3 py-1.5 text-base">
                  <span className="text-fg">
                    {it ? it.ingredients[j]?.replace(/^[\d.,/\s]+(g|kg|ml|l|pz|cucchia\w*|q\.b\.)?\s*/i, '') || ingredientIt(name) : ingredientIt(name)}
                    {!it && note && <span className="block text-xs text-fg-3">{note}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-fg-2">{qty(q, unit, scaling, factor)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="section-title">Preparazione</div>
            <ol className="space-y-3">
              {r.st.map(([text, min], j) => (
                <li key={j} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-glow text-sm font-bold text-accent-400">{j + 1}</span>
                  <span className="text-base text-fg-2">
                    {it?.steps[j] ?? text}
                    {min > 0 && <span className="ml-1 text-xs text-fg-3">· {min} min</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {!it && (
            <div>
              {ai.busy ? (
                <AIBusy status={ai.status} onCancel={ai.cancel} />
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Languages className="h-5 w-5" />}
                  onClick={async () => {
                    const t = await ai.run((o) => translateRecipe(r, o));
                    if (t) setIt(t);
                  }}
                >
                  Traduci la ricetta in italiano (AI)
                </Button>
              )}
              {ai.error && (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {ai.error}
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-fg-3">
            Ricetta e valori nutrizionali: UniTools — theunitools.com (World Recipes, licenza CC BY-SA 4.0){it ? ' · traduzione automatica' : ''}.
          </p>
        </div>
      )}
    </Modal>
  );
}
