import { useCallback, useEffect, useState } from 'react';
import type { DayRecap, DiaryEntry, FoodLog, UserRecipe } from '@/types';
import {
  deleteRecipe,
  saveDayRecap,
  saveFoodLog,
  saveMyFoods,
  saveRecipe,
  settle,
  subscribeFoodLog,
  subscribeMyFoods,
  subscribeRecipes,
} from '@/lib/firestore';
import type { Food } from '@/lib/foods';
import { useData } from './data-context';

/** Diario alimentare di un giorno (YYYY-MM-DD). */
export function useFoodLog(date: string) {
  const { uid } = useData();
  const [log, setLog] = useState<FoodLog>({ date, entries: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setLog({ date, entries: [] });
    return subscribeFoodLog(
      uid,
      date,
      (l) => {
        setLog(l);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid, date]);

  const write = useCallback(
    (entries: DiaryEntry[]) => {
      setLog((l) => ({ ...l, date, entries }));
      return uid ? settle(saveFoodLog(uid, { date, entries })) : Promise.resolve();
    },
    [uid, date],
  );

  return {
    entries: log.date === date ? log.entries : [],
    recap: log.date === date ? log.recap : undefined,
    saveRecap: (r: DayRecap) => {
      setLog((l) => ({ ...l, recap: r }));
      return uid ? settle(saveDayRecap(uid, date, r)) : Promise.resolve();
    },
    loading,
    add: (items: DiaryEntry[]) => write([...log.entries, ...items]),
    update: (e: DiaryEntry) => write(log.entries.map((x) => (x.id === e.id ? e : x))),
    remove: (id: string) => write(log.entries.filter((x) => x.id !== id)),
  };
}

/** Ricette create dall'utente. */
export function useMyRecipes() {
  const { uid } = useData();
  const [recipes, setRecipes] = useState<UserRecipe[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeRecipes(uid, setRecipes, () => undefined);
  }, [uid]);
  return {
    recipes,
    save: (r: UserRecipe) => (uid ? settle(saveRecipe(uid, r)) : Promise.resolve()),
    remove: (id: string) => (uid ? settle(deleteRecipe(uid, id)) : Promise.resolve()),
  };
}

/** Alimenti personali e recenti (scansionati o creati a mano). */
export function useMyFoods() {
  const { uid } = useData();
  const [foods, setFoods] = useState<Food[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeMyFoods(uid, setFoods, () => undefined);
  }, [uid]);
  /** Porta in cima (o aggiunge) un alimento: così resta disponibile anche offline. */
  const remember = useCallback(
    (f: Food) => {
      if (!uid || f.source === 'base') return Promise.resolve();
      const next = [f, ...foods.filter((x) => x.id !== f.id)];
      setFoods(next);
      return settle(saveMyFoods(uid, next));
    },
    [uid, foods],
  );
  const forget = useCallback(
    (id: string) => {
      if (!uid) return Promise.resolve();
      const next = foods.filter((x) => x.id !== id);
      setFoods(next);
      return settle(saveMyFoods(uid, next));
    },
    [uid, foods],
  );
  return { foods, remember, forget };
}
