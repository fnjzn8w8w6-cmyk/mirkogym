import { useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useMyRecipes } from '@/hooks/use-food';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { CATEGORY_EMOJI, loadRecipes, photoUrl, withUserRecipes, type Recipe, type RecipeData } from '@/lib/recipes';

/** Ricettario italiano + ricette dell'utente (caricato una volta, poi in cache anche offline). */
export function useRecipes() {
  const [base, setBase] = useState<RecipeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { recipes: mine } = useMyRecipes();
  useEffect(() => {
    let alive = true;
    setError(null);
    loadRecipes()
      .then((d) => alive && setBase(d))
      .catch(() => alive && setError('Ricettario non disponibile: controlla la connessione.'));
    return () => {
      alive = false;
    };
  }, [attempt]);
  const data = useMemo(() => (base ? withUserRecipes(base, mine) : null), [base, mine]);
  return { data, mine, error, retry: () => setAttempt((a) => a + 1) };
}

const GRADIENTS = ['from-orange-500/40 to-rose-500/30', 'from-emerald-500/40 to-teal-500/30', 'from-amber-500/40 to-yellow-500/20', 'from-sky-500/40 to-indigo-500/30'];

/** Foto della ricetta; se non c'è una foto verificata, un riquadro colorato con l'emoji della categoria. */
export function RecipeImage({ recipe, emoji, className }: { recipe?: Recipe; emoji?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = recipe ? photoUrl(recipe) : null;
  if (src && !failed)
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('bg-surface-3 object-cover', className)} />;
  const g = GRADIENTS[((recipe?.id.length ?? 0) + (recipe?.t.length ?? emoji?.length ?? 0)) % GRADIENTS.length];
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br', g, className)} aria-hidden>
      <span className="text-4xl">{emoji ?? CATEGORY_EMOJI[recipe?.cat ?? ''] ?? '🍽️'}</span>
    </div>
  );
}

/** Cuore dei preferiti (salvato nelle impostazioni dell'account). */
export function FavoriteButton({ id, className }: { id: string; className?: string }) {
  const { settings, update } = useSettings();
  const favs = settings.favoriteRecipes ?? [];
  const on = favs.includes(id);
  return (
    <button
      type="button"
      aria-label={on ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        void settle(update({ favoriteRecipes: on ? favs.filter((x) => x !== id) : [id, ...favs].slice(0, 200) }));
      }}
      className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm', className)}
    >
      <Heart className={cn('h-5 w-5', on ? 'fill-rose-500 text-rose-500' : 'text-white')} />
    </button>
  );
}

export function MacroLine({ kcal, protein, carbs, fat, className }: { kcal: number; protein: number; carbs: number; fat: number; className?: string }) {
  return (
    <span className={cn('text-sm text-fg-3', className)}>
      <strong className="text-fg-2">{Math.round(kcal)} kcal</strong> · P {Math.round(protein)} · C {Math.round(carbs)} · G {Math.round(fat)}
    </span>
  );
}

/** Barra di avanzamento di un macronutriente rispetto all'obiettivo. */
export function MacroBar({ label, value, target, unit, color }: { label: string; value: number; target: number; unit: string; color: string }) {
  const pct = target ? Math.min(1.3, value / target) : 0;
  const off = target ? Math.round(((value - target) / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-fg-2">{label}</span>
        <span className={cn('font-semibold', off > 10 ? 'text-warning' : 'text-fg')}>
          {Math.round(value)} / {target} {unit}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export const fmtNum = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
