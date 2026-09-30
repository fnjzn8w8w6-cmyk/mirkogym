import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { settle } from '@/lib/firestore';
import { cn } from '@/lib/cn';
import { loadRecipes, type Recipe, type RecipeData } from '@/lib/recipes';

/** Carica il ricettario (una sola volta, poi in cache anche offline). */
export function useRecipes() {
  const [data, setData] = useState<RecipeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    loadRecipes()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError('Ricettario non disponibile: controlla la connessione.'));
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

const GRADIENTS = ['from-orange-500/40 to-rose-500/30', 'from-emerald-500/40 to-teal-500/30', 'from-amber-500/40 to-yellow-500/20', 'from-sky-500/40 to-indigo-500/30'];
const EMOJI: Record<string, string> = { main: '🍲', soup: '🥣', salad: '🥗', breakfast: '🍳', snack: '🥨', dessert: '🍰', bread: '🥖', side: '🥔', sauce: '🫙', drink: '🥤' };

/** Foto della ricetta con segnaposto colorato se manca o non si carica. */
export function RecipeImage({ recipe, emoji, className }: { recipe?: Recipe; emoji?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = recipe?.ph?.[0];
  if (src && !failed)
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('bg-surface-3 object-cover', className)}
      />
    );
  const g = GRADIENTS[(recipe?.id.length ?? emoji?.length ?? 0) % GRADIENTS.length];
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br', g, className)} aria-hidden>
      <span className="text-4xl">{emoji ?? EMOJI[recipe?.c ?? 'main'] ?? '🍽️'}</span>
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
