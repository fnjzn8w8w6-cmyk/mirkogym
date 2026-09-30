import { useMemo, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/cn';
import { CATEGORY_IT, flag, recipeName, type Recipe } from '@/lib/recipes';
import { FavoriteButton, RecipeImage } from './shared';

type Filter = 'protein' | 'quick' | 'fav' | 'vegan' | 'vegetarian' | 'gluten-free' | 'pescatarian';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'protein', label: '💪 Proteiche' },
  { value: 'quick', label: '⚡ ≤ 30 min' },
  { value: 'fav', label: '❤️ Preferite' },
  { value: 'vegetarian', label: '🥚 Vegetariane' },
  { value: 'vegan', label: '🌱 Vegane' },
  { value: 'pescatarian', label: '🐟 Pesce' },
  { value: 'gluten-free', label: '🌾 Senza glutine' },
];
const CATS = ['main', 'soup', 'salad', 'breakfast', 'snack', 'dessert', 'bread', 'side'];
const PAGE = 24;

const proteinPct = (r: Recipe) => (r.k[0] ? (r.k[1] * 4) / r.k[0] : 0);

function matches(r: Recipe, f: Filter, favs: string[]): boolean {
  switch (f) {
    case 'protein':
      return proteinPct(r) >= 0.25 && r.k[1] >= 20;
    case 'quick':
      return r.t <= 30;
    case 'fav':
      return favs.includes(r.id);
    case 'vegetarian':
      return r.d.includes('vegetarian') || r.d.includes('vegan');
    case 'pescatarian':
      return r.d.includes('pescatarian');
    default:
      return r.d.includes(f);
  }
}

export function RecipeCard({ recipe, onOpen, badge }: { recipe: Recipe; onOpen: () => void; badge?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line-subtle bg-surface">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Apri ${recipeName(recipe)}`}>
        <RecipeImage recipe={recipe} className="aspect-square w-full" />
        <div className="p-2.5">
          <div className="line-clamp-2 text-sm font-semibold leading-tight text-fg">{recipeName(recipe)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-3">
            <span>{flag(recipe.co)}</span>
            <span>{recipe.k[0]} kcal</span>
            <span>·</span>
            <span>P {recipe.k[1]}</span>
            <span className="ml-auto flex items-center gap-0.5">
              <Clock className="h-3 w-3" aria-hidden />
              {recipe.t}′
            </span>
          </div>
        </div>
      </button>
      <FavoriteButton id={recipe.id} className="absolute right-2 top-2 h-9 w-9" />
      {badge && <span className="absolute left-2 top-2 rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">{badge}</span>}
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
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .filter((r) => !cat || r.c === cat)
      .filter((r) => filters.every((f) => matches(r, f, favs)))
      .filter((r) => {
        if (!words.length) return true;
        const text = `${r.n} ${r.nn ?? ''} ${r.s} ${CATEGORY_IT[r.c] ?? ''} ${r.i.map((x) => x[1]).join(' ')}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => Number(Boolean(b.ph)) - Number(Boolean(a.ph)) || Number(favs.includes(b.id)) - Number(favs.includes(a.id)));
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
          placeholder="Cerca: pollo, curry, pasta, salmone…"
          aria-label="Cerca ricette"
          className="h-full flex-1 bg-transparent text-base text-fg outline-none"
        />
      </label>
      {categories && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="button" className={chip(cat == null)} onClick={() => setCat(null)}>
            Tutte
          </button>
          {CATS.filter((c) => recipes.some((r) => r.c === c)).map((c) => (
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
