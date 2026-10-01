/** Sfide settimanali: 3 missioni che cambiano ogni lunedì (stesse per tutta la settimana). */
import type { BodyLog, ExerciseLog, FoodLog, Session } from '@/types';
import { sessionTonnage, workingSets } from './analytics';
import { toISODate, weekStart } from './date-utils';

export const QUEST_XP = 150;

export interface QuestCtx {
  week: Session[];
  prevWeek: Session[];
  food: FoodLog[];
  body: BodyLog[];
  planned: number;
  target: { kcal: number; protein: number } | null;
  groupOf: (l: ExerciseLog) => string;
}
interface QuestDef {
  id: string;
  emoji: string;
  title: (c: QuestCtx) => string;
  progress: (c: QuestCtx) => [number, number];
}

const kcal = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.kcal * e.qty) / 100 : e.per.kcal * e.qty), 0);
const prot = (l: FoodLog) => l.entries.reduce((a, e) => a + (e.unit === 'g' ? (e.per.protein * e.qty) / 100 : e.per.protein * e.qty), 0);
const cap = (v: number, t: number): [number, number] => [Math.min(Math.round(v), t), t];

const POOL: QuestDef[] = [
  { id: 'all', emoji: '📅', title: (c) => `Fai tutti i ${c.planned} allenamenti della settimana`, progress: (c) => cap(c.week.length, c.planned) },
  { id: 'pr', emoji: '🏆', title: () => 'Batti almeno un record personale', progress: (c) => cap(c.week.reduce((a, s) => a + s.logs.reduce((b, l) => b + l.sets.filter((x) => x.isPersonalRecord).length, 0), 0), 1) },
  { id: 'recap', emoji: '🗣️', title: () => 'Invia il resoconto al coach dopo 3 allenamenti', progress: (c) => cap(c.week.filter((s) => s.recap).length, 3) },
  { id: 'diary', emoji: '🍽️', title: () => 'Registra 5 giornate nel diario', progress: (c) => cap(c.food.filter((l) => l.entries.length).length, 5) },
  {
    id: 'protein',
    emoji: '🥩',
    title: () => 'Raggiungi le proteine in 4 giornate',
    progress: (c) => cap(c.target ? c.food.filter((l) => prot(l) >= c.target!.protein * 0.9).length : 0, 4),
  },
  {
    id: 'target',
    emoji: '🎯',
    title: () => 'Resta nelle calorie obiettivo (±10%) per 4 giornate',
    progress: (c) => cap(c.target ? c.food.filter((l) => l.entries.length && Math.abs(kcal(l) - c.target!.kcal) <= c.target!.kcal * 0.1).length : 0, 4),
  },
  {
    id: 'volume',
    emoji: '📈',
    title: (c) => `Supera il volume della settimana scorsa (${Math.round(c.prevWeek.reduce((a, s) => a + sessionTonnage(s), 0) / 100) / 10} t)`,
    progress: (c) => {
      const prev = c.prevWeek.reduce((a, s) => a + sessionTonnage(s), 0);
      const cur = c.week.reduce((a, s) => a + sessionTonnage(s), 0);
      return prev > 0 ? cap((cur / prev) * 100, 101) : [0, 1];
    },
  },
  {
    id: 'legs',
    emoji: '🦵',
    title: () => 'Allena le gambe almeno 2 volte',
    progress: (c) => cap(c.week.filter((s) => s.logs.some((l) => workingSets(l.sets).length && c.groupOf(l) === 'Gambe')).length, 2),
  },
  { id: 'weigh', emoji: '⚖️', title: () => 'Pesati 3 volte', progress: (c) => cap(c.body.filter((b) => b.weight != null).length, 3) },
  { id: 'clean', emoji: '😇', title: () => '5 giornate senza sgarri (resoconto della dieta)', progress: (c) => cap(c.food.filter((l) => l.recap && !l.recap.cheat).length, 5) },
  { id: 'sets', emoji: '🧱', title: () => 'Completa 60 serie allenanti', progress: (c) => cap(c.week.reduce((a, s) => a + s.logs.reduce((b, l) => b + workingSets(l.sets).length, 0), 0), 60) },
];

/** Chiave della settimana (data del lunedì). */
export const weekKey = (d: Date | number = new Date()) => toISODate(weekStart(d));

export function weeklyQuests(ctx: QuestCtx, key = weekKey()) {
  // scelta deterministica: stesse 3 sfide per tutta la settimana
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // senza una settimana precedente la sfida sul volume non ha senso
  const hasPrev = ctx.prevWeek.some((x) => sessionTonnage(x) > 0);
  const pool = POOL.filter((q) => hasPrev || q.id !== 'volume');
  const picked: QuestDef[] = [];
  while (picked.length < 3 && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picked.map((q) => {
    const [v, t] = q.progress(ctx);
    return { id: `${key}:${q.id}`, emoji: q.emoji, title: q.title(ctx), value: v, target: t, done: v >= t };
  });
}
