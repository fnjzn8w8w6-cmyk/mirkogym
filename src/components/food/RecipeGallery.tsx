import { useMemo, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/foods';
import { CATEGORY_IT, photoUrl, type Recipe } from '@/lib/recipes';
import { FavoriteButton, RecipeImage } from './shared';

type Filter = 'protein' | 'quick' | 'fav' | 'photo' | 'vegan' | 'vegetarian' | 'gluten-free';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'protein', label: '💪 Proteiche' },
  { value: 'quick', label: '⚡ ≤ 30 min' },
  { value: 'fav', label: '❤️ Preferite' },
  { value: 'photo', label: '📷 Con foto' },
  { value: 'vegetarian', label: '🥚 Vegetariane' },
  { value: 'vegan', label: '🌱 Vegane' },
  { value: 'gluten-free', label: '🌾 Senza glutine' },
];
const CATS = ['mie', 'primi', 'secondi', 'piatti-unici', 'zuppe', 'colazione', 'contorni', 'antipasti', 'dolci', 'salse'];
const PAGE = 24;

function matches(r: Recipe, f: Filter, favs: string[]): boolean {
  switch (f) {
    case 'protein':
      return Boolean(r.k && r.k[0] && (r.k[1] * 4) / r.k[0] >= 0.25 && r.k[1] >= 20);
    case 'quick':
      return r.min > 0 && r.min <= 30;
    case 'fav':
      return favs.includes(r.id);
    case 'photo':
      return Boolean(photoUrl(r));
    default:
      return r.d.includes(f);
  }
}

export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line-subtle bg-surface">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Apri ${recipe.t}`}>
        <RecipeImage recipe={recipe} className="aspect-square w-full" />
        <div className="p-2.5">
          <div className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight text-fg">{recipe.t}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-3">
            {recipe.k ? (
              <>
                <span>{recipe.k[0]} kcal</span>
                <span>·</span>
                <span>P {recipe.k[1]}</span>
              </>
            ) : (
              <span>{CATEGORY_IT[recipe.cat]}</span>
            )}
            {recipe.min > 0 && (
              <span className="ml-auto flex items-center gap-0.5">
                <Clock className="h-3 w-3" aria-hidden />
                {recipe.min}′
              </span>
            )}
          </div>
        </div>
      </button>
      <FavoriteButton id={recipe.id} className="absolute right-2 top-2 h-9 w-9" />
    </div>
  );
}

interface Props {
  recipes: Recipe[];
  onOpen: (r: Recipe) => void;
  /** Mostra i filtri per categoria (disattivato quando la lista è già filtrata per pasto). */
  categories?: boolean;
}

export function RecipeGallery({ recipes, onOpen, categories = true }: Props) {
  const { settings } = useSettings();
  const favs = settings.favoriteRecipes ?? [];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const words = normalize(q.trim()).split(/\s+/).filter(Boolean);
    return recipes
      .filter((r) => !cat || r.cat === cat)
      .filter((r) => filters.every((f) => matches(r, f, favs)))
      .filter((r) => {
        if (!words.length) return true;
        const text = normalize(`${r.t} ${CATEGORY_IT[r.cat] ?? ''} ${r.i.map((x) => x[0]).join(' ')}`);
        return words.every((w) => text.includes(w));
      })
      .sort(
        (a, b) =>
          Number(Boolean(b.user)) - Number(Boolean(a.user)) ||
          Number(Boolean(photoUrl(b))) - Number(Boolean(photoUrl(a))) ||
          Number(favs.includes(b.id)) - Number(favs.includes(a.id)) ||
          Number(Boolean(b.k)) - Number(Boolean(a.k)),
      );
  }, [recipes, q, cat, filters, favs]);

  const toggle = (f: Filter) => {
    setFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setLimit(PAGE);
  };
  const chip = (active: boolean) =>
    cn('h-9 shrink-0 rounded-full border px-3 text-sm', active ? 'border-accent-500 bg-accent-glow font-semibold text-accent-400' : 'border-line bg-surface-2 text-fg-2');

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface-2 px-4 focus-within:border-accent-500">
        <Search className="h-4 w-4 text-fg-3" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Cerca: carbonara, pollo, zucchine…"
          aria-label="Cerca ricette"
          className="h-full flex-1 bg-transparent text-base text-fg outline-none"
        />
      </label>
      {categories && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="button" className={chip(cat == null)} onClick={() => setCat(null)}>
            Tutte
          </button>
          {CATS.filter((c) => recipes.some((r) => r.cat === c)).map((c) => (
            <button key={c} type="button" className={chip(cat === c)} onClick={() => (setCat(cat === c ? null : c), setLimit(PAGE))}>
              {CATEGORY_IT[c]}
            </button>
          ))}
        </div>
      )}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={filters.includes(f.value)} className={chip(filters.includes(f.value))} onClick={() => toggle(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="text-sm text-fg-3">{list.length} ricette</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.slice(0, limit).map((r) => (
          <RecipeCard key={r.id} recipe={r} onOpen={() => onOpen(r)} />
        ))}
      </div>
      {list.length > limit && (
        <button type="button" className="h-11 w-full rounded-md border border-line bg-surface-2 text-sm font-semibold text-fg-2" onClick={() => setLimit(limit + PAGE)}>
          Mostra altre ({list.length - limit})
        </button>
      )}
      {list.length === 0 && <p className="py-6 text-center text-base text-fg-3">Nessuna ricetta con questi filtri.</p>}
    </div>
  );
}
