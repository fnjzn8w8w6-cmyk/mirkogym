import { BookOpen, CalendarPlus, Clock, NotebookPen, Pencil, Trash2, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CATEGORY_EMOJI, CATEGORY_IT, type Recipe } from '@/lib/recipes';
import { FavoriteButton, MacroLine, RecipeImage, fmtNum } from './shared';

const DIET_IT: Record<string, string> = { vegan: '🌱 Vegana', vegetarian: '🥚 Vegetariana', 'gluten-free': '🌾 Senza glutine' };
const DIFF_IT = ['', 'Facile', 'Media', 'Impegnativa'];

interface Props {
  recipe: Recipe | null;
  onClose: () => void;
  /** Porzioni previste nel piano (se aperta da un pasto del piano). */
  servings?: number;
  onAddToPlan?: (r: Recipe) => void;
  onAddToDiary?: (r: Recipe) => void;
  onEdit?: (r: Recipe) => void;
  onDelete?: (r: Recipe) => void;
}

export function RecipeDetail({ recipe: r, onClose, servings, onAddToPlan, onAddToDiary, onEdit, onDelete }: Props) {
  const k = r?.k;
  return (
    <Modal open={Boolean(r)} onClose={onClose} title={r?.t ?? ''}>
      {r && (
        <div className="space-y-4">
          <div className="relative -mx-5 overflow-hidden">
            <RecipeImage recipe={r} className="aspect-[4/3] w-full" />
            <FavoriteButton id={r.id} className="absolute right-3 top-3" />
          </div>
          {r.ph && (
            <p className="-mt-3 text-[11px] text-fg-3">
              Foto: {r.ph[1]} ·{' '}
              <a href={r.ph[3]} target="_blank" rel="noreferrer" className="underline">
                {r.ph[2]}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Chip>
              {CATEGORY_EMOJI[r.cat] ?? '🍽️'} {CATEGORY_IT[r.cat] ?? r.cat}
            </Chip>
            {r.min > 0 && <Chip icon={<Clock className="h-3.5 w-3.5" />}>{r.min} min</Chip>}
            {!r.user && <Chip>{DIFF_IT[r.df] ?? ''}</Chip>}
            {r.d.map((d) => DIET_IT[d] && <Chip key={d} tone="success">{DIET_IT[d]}</Chip>)}
          </div>

          <div className="rounded-lg bg-surface-2 p-3">
            {k ? (
              <>
                <div className="text-xs uppercase text-fg-3">Per porzione</div>
                <MacroLine kcal={k[0]} protein={k[1]} carbs={k[2]} fat={k[3]} />
                {servings != null && servings !== 1 && (
                  <>
                    <div className="mt-2 text-xs uppercase text-fg-3">Nel tuo piano ({fmtNum(servings)} porzioni)</div>
                    <MacroLine kcal={k[0] * servings} protein={k[1] * servings} carbs={k[2] * servings} fat={k[3] * servings} />
                  </>
                )}
                <p className="mt-1 text-[11px] text-fg-3">
                  {r.user ? 'Calcolati dagli ingredienti che hai inserito.' : 'Calcolati dagli ingredienti con i valori USDA FoodData Central.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-3">Valori nutrizionali non calcolabili con precisione per questa ricetta (ingredienti senza quantità).</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {onAddToPlan && k && (
              <Button variant="secondary" icon={<CalendarPlus className="h-5 w-5" />} onClick={() => onAddToPlan(r)}>
                Al piano
              </Button>
            )}
            {onAddToDiary && k && (
              <Button variant="secondary" icon={<NotebookPen className="h-5 w-5" />} onClick={() => onAddToDiary(r)}>
                Al diario
              </Button>
            )}
            {onEdit && r.user && (
              <Button variant="secondary" icon={<Pencil className="h-5 w-5" />} onClick={() => onEdit(r)}>
                Modifica
              </Button>
            )}
            {onDelete && r.user && (
              <Button variant="danger" icon={<Trash2 className="h-5 w-5" />} onClick={() => onDelete(r)}>
                Elimina
              </Button>
            )}
          </div>

          <section>
            <div className="section-title flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden /> Ingredienti · {r.sv} {r.sv === 1 ? 'porzione' : 'porzioni'}
            </div>
            <ul className="divide-y divide-line-subtle">
              {r.i.map(([name, qty], j) => (
                <li key={`${name}-${j}`} className="flex items-baseline justify-between gap-3 py-1.5 text-base">
                  <span className="text-fg">{name}</span>
                  <span className="shrink-0 text-sm font-semibold text-fg-2">{qty}</span>
                </li>
              ))}
            </ul>
            {servings != null && servings !== 1 && (
              <p className="mt-1 text-xs text-fg-3">
                Dosi per {r.sv} porzioni: tu ne mangi {fmtNum(servings)} (circa {Math.round((servings / r.sv) * 100)}% della ricetta).
              </p>
            )}
          </section>

          {r.st.length > 0 && (
            <section>
              <div className="section-title">Preparazione</div>
              <ol className="space-y-3">
                {r.st.map((text, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-glow text-sm font-bold text-accent-400">{j + 1}</span>
                    <span className="text-base text-fg-2">{text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!r.user && (
            <p className="flex items-start gap-1.5 text-[11px] text-fg-3">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {r.src ? (
                  <>
                    Ricetta da Wikibooks,{' '}
                    <a href={r.src[1]} target="_blank" rel="noreferrer" className="underline">
                      “{r.src[0]}”
                    </a>
                  </>
                ) : (
                  'Ricetta FrigoDispensa (dispensa-dati)'
                )}{' '}
                · licenza CC BY-SA 4.0.
              </span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
