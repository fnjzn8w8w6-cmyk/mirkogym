import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Barcode, Loader2, Plus, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useMyFoods } from '@/hooks/use-food';
import { cn } from '@/lib/cn';
import { FOOD_CATEGORY, loadBaseFoods, lookupBarcode, macrosFor, recheckFood, round1, searchLocal, searchOff, type Food } from '@/lib/foods';
import { AlertTriangle, Check as CheckIcon } from 'lucide-react';
import type { Recipe } from '@/lib/recipes';
import { BarcodeScanner } from './BarcodeScanner';
import { Segmented } from '@/components/ui/Input';
import { fmtPieces, isCountable, pieceGrams, rememberMode, rememberedMode } from '@/lib/food-units';
import { MacroLine, RecipeImage, fmtNum } from './shared';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** ricette selezionabili (diario); se assenti si scelgono solo alimenti */
  recipes?: Recipe[];
  /** pieces: quantità in pezzi, se scelta (es. 3 uova) */
  onPickFood: (food: Food, grams: number, pieces?: { n: number; grams: number }) => void;
  onPickRecipe?: (recipe: Recipe, servings: number) => void;
}

type Step = { kind: 'search' } | { kind: 'food'; food: Food } | { kind: 'recipe'; recipe: Recipe } | { kind: 'custom'; barcode?: string; name?: string };

function Row({ title, subtitle, right, onClick, image }: { title: string; subtitle: string; right?: string; onClick: () => void; image?: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left">
        {image}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-fg">{title}</span>
          <span className="block truncate text-xs text-fg-3">{subtitle}</span>
        </span>
        {right && <span className="shrink-0 text-sm font-semibold text-fg-2">{right}</span>}
      </button>
    </li>
  );
}

const foodSubtitle = (f: Food) =>
  [f.brand, f.source === 'off' ? 'prodotto' : f.source === 'custom' ? 'mio alimento' : FOOD_CATEGORY[f.category ?? ''], `P ${fmtNum(f.per100.protein)} · C ${fmtNum(f.per100.carbs)} · G ${fmtNum(f.per100.fat)} /100 g`]
    .filter(Boolean)
    .join(' · ');

export function FoodPicker({ open, onClose, title = 'Aggiungi alimento', recipes, onPickFood, onPickRecipe }: Props) {
  const toast = useToast();
  const { foods: myFoods, remember } = useMyFoods();
  const [base, setBase] = useState<(Food & { kw: string })[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<Food[]>([]);
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [onlineError, setOnlineError] = useState('');
  const [scan, setScan] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (open) {
      setStep({ kind: 'search' });
      setQuery('');
      setOnline([]);
      loadBaseFoods()
        .then(setBase)
        .catch(() => toast.error('Tabella alimenti non disponibile'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Ricerca online (Open Food Facts) dopo una breve pausa di digitazione
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setOnline([]);
      setOnlineState('idle');
      return;
    }
    setOnlineState('loading');
    let alive = true;
    const t = window.setTimeout(() => {
      searchOff(q)
        .then((r) => {
          if (!alive) return;
          setOnline(r);
          setOnlineState('idle');
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setOnlineState('error');
          setOnlineError(e instanceof Error ? e.message : 'Ricerca non disponibile');
        });
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query]);

  const q = query.trim();
  const mine = useMemo(() => (q ? searchLocal(myFoods, q, 15) : myFoods.slice(0, 12)), [myFoods, q]);
  const baseHits = useMemo(() => (q ? searchLocal(base, q, 25) : []), [base, q]);
  const recipeHits = useMemo(
    () => (q && recipes ? searchLocal(recipes.filter((r) => r.k).map((r) => ({ ...r, name: r.t })), q, 8) : []),
    [recipes, q],
  );
  const onlineHits = online.filter((f) => !mine.some((m) => m.id === f.id));

  const handleCode = async (code: string) => {
    setScan(false);
    const known = myFoods.find((f) => f.barcode === code);
    if (known) {
      setStep({ kind: 'food', food: known });
      return;
    }
    setLookingUp(true);
    try {
      const r = await lookupBarcode(code);
      if (r.food) setStep({ kind: 'food', food: r.food });
      else {
        toast.info(r.found ? 'Prodotto trovato ma senza valori nutrizionali: inseriscili dall\'etichetta' : 'Prodotto non trovato: inserisci i valori dall\'etichetta');
        setStep({ kind: 'custom', barcode: code, name: r.name });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ricerca non riuscita');
    } finally {
      setLookingUp(false);
    }
  };

  const back = step.kind !== 'search' && (
    <button type="button" onClick={() => setStep({ kind: 'search' })} className="mb-2 flex items-center gap-1 text-sm font-semibold text-accent-400">
      <ArrowLeft className="h-4 w-4" /> Indietro
    </button>
  );

  return (
    <>
      <Modal open={open && !scan} onClose={onClose} title={title}>
        {step.kind === 'search' && (
          <div className="space-y-3">
            <label className="flex h-12 items-center gap-2 rounded-full border border-line bg-surface-2 px-4 focus-within:border-accent-500">
              <Search className="h-5 w-5 text-fg-3" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca: petto di pollo, yogurt, Barilla…"
                aria-label="Cerca alimento"
                className="h-full flex-1 bg-transparent text-base text-fg outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={lookingUp ? <Loader2 className="h-5 w-5 animate-spin" /> : <Barcode className="h-5 w-5" />} onClick={() => setScan(true)} disabled={lookingUp}>
                Codice a barre
              </Button>
              <Button variant="secondary" icon={<Plus className="h-5 w-5" />} onClick={() => setStep({ kind: 'custom', name: q })}>
                Crea alimento
              </Button>
            </div>

            {mine.length > 0 && (
              <section>
                <div className="section-title !mb-0">{q ? 'I miei alimenti' : 'Usati di recente'}</div>
                <ul className="divide-y divide-line-subtle">
                  {mine.map((f) => (
                    <Row key={f.id} title={f.name} subtitle={foodSubtitle(f)} right={`${f.per100.kcal} kcal`} onClick={() => setStep({ kind: 'food', food: f })} />
                  ))}
                </ul>
              </section>
            )}
            {baseHits.length > 0 && (
              <section>
                <div className="section-title !mb-0">Alimenti</div>
                <ul className="divide-y divide-line-subtle">
                  {baseHits.map((f) => (
                    <Row key={f.id} title={f.name} subtitle={foodSubtitle(f)} right={`${f.per100.kcal} kcal`} onClick={() => setStep({ kind: 'food', food: f })} />
                  ))}
                </ul>
              </section>
            )}
            {recipeHits.length > 0 && (
              <section>
                <div className="section-title !mb-0">Ricette</div>
                <ul className="divide-y divide-line-subtle">
                  {recipeHits.map((r) => (
                    <Row
                      key={r.id}
                      title={r.t}
                      subtitle={`${r.k?.[0]} kcal a porzione · P ${r.k?.[1]}`}
                      image={<RecipeImage recipe={r} className="h-10 w-10 shrink-0 rounded-sm text-base" />}
                      onClick={() => setStep({ kind: 'recipe', recipe: r })}
                    />
                  ))}
                </ul>
              </section>
            )}
            {q.length >= 3 && (
              <section>
                <div className="section-title !mb-0 flex items-center gap-2">
                  Prodotti confezionati {onlineState === 'loading' && <Loader2 className="h-4 w-4 animate-spin" aria-label="Ricerca in corso" />}
                </div>
                {onlineState === 'error' && <p className="py-2 text-sm text-fg-3">{onlineError}</p>}
                {onlineState === 'idle' && onlineHits.length === 0 && <p className="py-2 text-sm text-fg-3">Nessun prodotto trovato: prova il codice a barre.</p>}
                <ul className="divide-y divide-line-subtle">
                  {onlineHits.map((f) => (
                    <Row
                      key={f.id}
                      title={f.name}
                      subtitle={foodSubtitle(f)}
                      right={`${f.per100.kcal} kcal`}
                      image={f.image ? <img src={f.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-sm bg-white object-contain" /> : undefined}
                      onClick={() => setStep({ kind: 'food', food: f })}
                    />
                  ))}
                </ul>
              </section>
            )}
            {!q && mine.length === 0 && (
              <p className="py-4 text-center text-sm text-fg-3">Cerca un alimento o un prodotto, oppure scansiona il codice a barre della confezione.</p>
            )}
          </div>
        )}

        {step.kind === 'food' && (
          <>
            {back}
            <AmountStep
              food={recheckFood(step.food)}
              onConfirm={(grams, pieces, food) => {
                void remember(food);
                onPickFood(food, grams, pieces);
              }}
            />
          </>
        )}
        {step.kind === 'recipe' && (
          <>
            {back}
            <RecipeAmountStep recipe={step.recipe} onConfirm={(sv) => onPickRecipe?.(step.recipe, sv)} />
          </>
        )}
        {step.kind === 'custom' && (
          <>
            {back}
            <CustomFoodForm
              barcode={step.barcode}
              initialName={step.name}
              onSave={(f) => {
                void remember(f);
                setStep({ kind: 'food', food: f });
              }}
            />
          </>
        )}
      </Modal>
      <BarcodeScanner open={open && scan} onClose={() => setScan(false)} onCode={(c) => void handleCode(c)} />
    </>
  );
}

/* ---------- Quantità ---------- */

function AmountStep({ food: original, onConfirm }: { food: Food; onConfirm: (grams: number, pieces: { n: number; grams: number } | undefined, food: Food) => void }) {
  // valori modificabili quando il database ha dati dubbi (o se vuoi correggerli dall'etichetta)
  const [edit, setEdit] = useState(original.check === 'suspect');
  const [vals, setVals] = useState(() => ({
    kcal: String(original.per100.kcal),
    protein: String(original.per100.protein).replace('.', ','),
    carbs: String(original.per100.carbs).replace('.', ','),
    fat: String(original.per100.fat).replace('.', ','),
  }));
  const num = (v: string) => Number(v.replace(',', '.'));
  const edited = edit && Object.entries(vals).some(([k, v]) => num(v) !== original.per100[k as keyof Food['per100']]);
  const food: Food = edited
    ? {
        ...original,
        per100: { kcal: Math.round(num(vals.kcal)) || 0, protein: round1(num(vals.protein) || 0), carbs: round1(num(vals.carbs) || 0), fat: round1(num(vals.fat) || 0) },
        source: 'custom',
        check: undefined,
      }
    : original;
  // prodotti confezionati: il "pezzo" è quello dell'etichetta (1 panino, 1 biscotto), mai stimato dal nome
  const packaged = original.source !== 'base';
  const unit = packaged ? original.unitGrams : pieceGrams(original.name, original.unitGrams);
  const realPiece = !packaged || (original.unitLabel != null && !/^(porzione|confezione)/.test(original.unitLabel));
  const pieceText = packaged && original.unitLabel ? `${original.unitLabel.charAt(0).toUpperCase()}${original.unitLabel.slice(1)} = ${fmtNum(unit ?? 0)} g` : `Pezzi (1 = ${fmtNum(unit ?? 0)} g)`;
  const [mode, setMode] = useState<'pz' | 'g'>(() =>
    unit ? (rememberedMode(original.id) ?? (realPiece && (packaged || isCountable(original.name)) ? 'pz' : 'g')) : 'g',
  );
  // la confezione intera non è una quantità tipica: si parte da 100 g
  const [grams, setGrams] = useState(String(unit && original.unitLabel !== 'confezione' ? unit : 100));
  const [pieces, setPieces] = useState(1);
  const g = mode === 'pz' && unit ? Math.round(pieces * unit * 10) / 10 : Number(grams.replace(',', '.'));
  const valid = Number.isFinite(g) && g > 0 && g <= 5000 && (!edit || [vals.protein, vals.carbs, vals.fat, vals.kcal].every((v) => v !== '' && Number.isFinite(num(v)) && num(v) >= 0));
  const m = macrosFor(food.per100, valid ? g : 0);
  const presets = [...new Set([50, 100, 150, 200])];
  const switchMode = (v: 'pz' | 'g') => {
    setMode(v);
    rememberMode(original.id, v);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {food.image && <img src={food.image} alt="" className="h-16 w-16 shrink-0 rounded-md bg-white object-contain" />}
        <div>
          <div className="text-lg text-fg">{food.name}</div>
          {food.brand && <div className="text-sm text-fg-3">{food.brand}</div>}
          <div className="text-xs text-fg-3">
            Per 100 g: {food.per100.kcal} kcal · P {fmtNum(food.per100.protein)} · C {fmtNum(food.per100.carbs)} · G {fmtNum(food.per100.fat)}
          </div>
          {packaged && !edit && (
            <button type="button" onClick={() => setEdit(true)} className="mt-0.5 text-xs font-semibold text-accent-400">
              Correggi i valori
            </button>
          )}
        </div>
      </div>
      {original.check === 'fixed' && !edit && (
        <p className="flex gap-2 rounded-md border border-line bg-surface-2 p-2.5 text-xs text-fg-2">
          <CheckIcon className="h-4 w-4 shrink-0 text-accent-400" aria-hidden />
          Le kcal nel database erano sbagliate (kJ al posto di kcal o mancanti): le abbiamo ricalcolate da proteine, carboidrati e grassi.
        </p>
      )}
      {edit && (
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning-bg p-3">
          <p className="flex gap-2 text-sm text-fg-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            {original.check === 'suspect'
              ? 'I valori di questo prodotto non tornano: controlla l\'etichetta (per 100 g). La correzione resta salvata per le prossime volte.'
              : 'Correggi i valori per 100 g copiandoli dall\'etichetta: resta salvato per le prossime volte.'}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ['kcal', 'Kcal'],
                ['protein', 'Prot.'],
                ['carbs', 'Carbo'],
                ['fat', 'Grassi'],
              ] as const
            ).map(([k, l]) => (
              <Input key={k} label={l} kind="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            ))}
          </div>
        </div>
      )}
      {unit && (
        <Segmented<'pz' | 'g'>
          label="Unità"
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'pz', label: pieceText },
            { value: 'g', label: 'Grammi' },
          ]}
        />
      )}
      {mode === 'pz' && unit ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Un pezzo in meno"
              disabled={pieces <= 0.5}
              onClick={() => setPieces((n) => Math.max(0.5, n - (n > 1 ? 1 : 0.5)))}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface-2 text-2xl font-bold text-fg disabled:opacity-40"
            >
              −
            </button>
            <div className="min-w-[96px] text-center">
              <div className="font-display text-4xl font-extrabold text-fg" aria-live="polite">
                {fmtPieces(pieces)}
              </div>
              <div className="text-xs text-fg-3">{pieces === 1 ? 'pezzo' : 'pezzi'} · {fmtNum(g)} g</div>
            </div>
            <button
              type="button"
              aria-label="Un pezzo in più"
              onClick={() => setPieces((n) => (n < 1 ? 1 : n + 1))}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-accent-500 bg-accent-glow text-2xl font-bold text-accent-400"
            >
              +
            </button>
          </div>
          <div className="flex justify-center gap-2">
            {[0.5, 1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPieces(n)}
                className={cn('h-9 min-w-[44px] rounded-full border px-3 text-sm', pieces === n ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2')}
              >
                {fmtPieces(n)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Input label="Quantità (grammi)" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setGrams(String(p))}
                className={cn('h-9 rounded-full border px-3 text-sm', g === p ? 'border-accent-500 bg-accent-glow text-accent-400' : 'border-line bg-surface-2 text-fg-2')}
              >
                {p} g
              </button>
            ))}
          </div>
        </>
      )}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Kcal', m.kcal],
          ['Proteine', m.protein],
          ['Carbo', m.carbs],
          ['Grassi', m.fat],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md bg-surface-2 py-2">
            <div className="text-lg text-fg">{typeof v === 'number' ? fmtNum(v) : v}</div>
            <div className="text-xs uppercase text-fg-3">{l}</div>
          </div>
        ))}
      </div>
      <Button fullWidth size="lg" disabled={!valid} onClick={() => onConfirm(Math.round(g * 10) / 10, mode === 'pz' && unit ? { n: pieces, grams: unit } : undefined, food)}>
        Aggiungi
      </Button>
      {food.source === 'off' && <p className="text-xs text-fg-3">Valori dall'etichetta del prodotto (Open Food Facts).</p>}
      {food.source === 'base' && <p className="text-xs text-fg-3">Valori medi USDA FoodData Central.</p>}
    </div>
  );
}

export function RecipeAmountStep({ recipe, onConfirm }: { recipe: Recipe; onConfirm: (servings: number) => void }) {
  const [sv, setSv] = useState(1);
  const k = recipe.k ?? [0, 0, 0, 0];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <RecipeImage recipe={recipe} className="h-16 w-16 shrink-0 rounded-md" />
        <div>
          <div className="text-lg text-fg">{recipe.t}</div>
          <MacroLine kcal={k[0]} protein={k[1]} carbs={k[2]} fat={k[3]} className="text-xs" />
          <div className="text-xs text-fg-3">a porzione (ricetta per {recipe.sv})</div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface-2 p-2">
        <Button variant="ghost" onClick={() => setSv(Math.max(0.25, sv - 0.25))} aria-label="Meno">
          −
        </Button>
        <span className="text-lg text-fg">
          {fmtNum(sv)} {sv === 1 ? 'porzione' : 'porzioni'}
        </span>
        <Button variant="ghost" onClick={() => setSv(Math.min(6, sv + 0.25))} aria-label="Più">
          +
        </Button>
      </div>
      <MacroLine kcal={k[0] * sv} protein={k[1] * sv} carbs={k[2] * sv} fat={k[3] * sv} className="block text-center" />
      <Button fullWidth size="lg" onClick={() => onConfirm(sv)}>
        Aggiungi
      </Button>
    </div>
  );
}

/* ---------- Nuovo alimento (dall'etichetta) ---------- */

function CustomFoodForm({ barcode, initialName, onSave }: { barcode?: string; initialName?: string; onSave: (f: Food) => void }) {
  const [v, setV] = useState({ name: initialName ?? '', brand: '', kcal: '', protein: '', carbs: '', fat: '', unit: '' });
  const num = (s: string) => Number(s.replace(',', '.'));
  const valid = v.name.trim().length > 1 && [v.protein, v.carbs, v.fat].every((x) => x !== '' && Number.isFinite(num(x)) && num(x) >= 0);
  const kcalCalc = Math.round(num(v.protein || '0') * 4 + num(v.carbs || '0') * 4 + num(v.fat || '0') * 9);
  const field = (key: keyof typeof v, label: string, props: Record<string, string> = { inputMode: 'decimal' }) => (
    <Input label={label} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...props} />
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-2">Copia i valori dalla tabella nutrizionale dell'etichetta (per 100 g).{barcode ? ` Codice: ${barcode}` : ''}</p>
      {field('name', 'Nome', {})}
      {field('brand', 'Marca (facoltativo)', {})}
      <div className="grid grid-cols-2 gap-3">
        {field('protein', 'Proteine (g)')}
        {field('carbs', 'Carboidrati (g)')}
        {field('fat', 'Grassi (g)')}
        {field('kcal', `Kcal (vuoto = ${kcalCalc})`)}
      </div>
      {field('unit', 'Porzione tipica in grammi (facoltativo)')}
      <Button
        fullWidth
        size="lg"
        disabled={!valid}
        onClick={() =>
          onSave({
            id: barcode ? `off:${barcode}` : `custom:${Date.now().toString(36)}`,
            name: v.name.trim(),
            brand: v.brand.trim() || undefined,
            per100: { kcal: v.kcal ? Math.round(num(v.kcal)) : kcalCalc, protein: round1(num(v.protein)), carbs: round1(num(v.carbs)), fat: round1(num(v.fat)) },
            unitGrams: num(v.unit) > 0 ? num(v.unit) : undefined,
            source: 'custom',
            barcode,
          })
        }
      >
        Salva alimento
      </Button>
    </div>
  );
}
