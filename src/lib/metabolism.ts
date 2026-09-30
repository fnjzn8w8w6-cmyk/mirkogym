/**
 * Stime metaboliche e di composizione corporea (indicative, non mediche).
 * - BMR: Mifflin-St Jeor (1990), l'equazione raccomandata dall'Academy of Nutrition and Dietetics.
 * - TDEE: BMR × fattore di attività.
 * - Massa grassa: Deurenberg (da BMI) oppure metodo US Navy (circonferenze), più preciso.
 */

export type Sex = 'm' | 'f';
export type Goal = 'cut' | 'strength' | 'bulk' | 'maintain';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight';

export interface UserProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** 1 sedentario … 5 molto attivo */
  activity: 1 | 2 | 3 | 4 | 5;
  experience: Experience;
  goal: Goal;
  daysPerWeek: number;
  equipment: Equipment;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
  /** Massa grassa nota (misurata o stimata da foto): ha la priorità sulle formule. */
  bodyFatPct?: number;
  bodyFatSource?: 'manual' | 'photo';
}

export type BodyFatMethod = 'manual' | 'photo' | 'navy' | 'bmi';

export const BF_METHOD_LABEL: Record<BodyFatMethod, string> = {
  manual: 'valore inserito da te',
  photo: 'stima AI da foto',
  navy: 'metodo US Navy (circonferenze)',
  bmi: 'formula di Deurenberg (da BMI): poco precisa per chi è muscoloso',
};

export const ACTIVITY: { value: UserProfile['activity']; label: string; description: string; factor: number }[] = [
  { value: 1, label: 'Sedentario', description: 'Lavoro da scrivania, pochi passi (< 5.000/giorno)', factor: 1.2 },
  { value: 2, label: 'Poco attivo', description: 'In piedi a tratti, 5.000–7.500 passi', factor: 1.375 },
  { value: 3, label: 'Attivo', description: 'Spesso in movimento, 7.500–10.000 passi', factor: 1.55 },
  { value: 4, label: 'Molto attivo', description: 'Lavoro fisico o > 10.000 passi al giorno', factor: 1.725 },
  { value: 5, label: 'Estremamente attivo', description: 'Lavoro pesante + sport quotidiano', factor: 1.9 },
];

export const GOALS: { value: Goal; label: string; emoji: string; description: string; kcal: number }[] = [
  { value: 'cut', label: 'Definizione', emoji: '🔥', description: 'Perdere grasso mantenendo il muscolo', kcal: -0.2 },
  { value: 'bulk', label: 'Massa', emoji: '💪', description: 'Aumentare la massa muscolare', kcal: 0.1 },
  { value: 'strength', label: 'Forza', emoji: '🏋️', description: 'Sollevare di più sui fondamentali', kcal: 0.05 },
  { value: 'maintain', label: 'Mantenimento', emoji: '⚖️', description: 'Restare in forma e in salute', kcal: 0 },
];

export const EXPERIENCE: { value: Experience; label: string; description: string }[] = [
  { value: 'beginner', label: 'Neofita', description: 'Meno di 1 anno di allenamento costante' },
  { value: 'intermediate', label: 'Intermedio', description: 'Da 1 a 3 anni, conosci i fondamentali' },
  { value: 'advanced', label: 'Avanzato', description: 'Oltre 3 anni, progressi ormai lenti' },
];

export const bmi = (p: Pick<UserProfile, 'weightKg' | 'heightCm'>): number => p.weightKg / (p.heightCm / 100) ** 2;

export function bmr(p: UserProfile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === 'm' ? base + 5 : base - 161);
}

export const tdee = (p: UserProfile): number => Math.round(bmr(p) * (ACTIVITY.find((a) => a.value === p.activity)?.factor ?? 1.375));

/** Grasso corporeo stimato da BMI, età e sesso (Deurenberg 1991). */
export const bfDeurenberg = (p: UserProfile): number => 1.2 * bmi(p) + 0.23 * p.age - 10.8 * (p.sex === 'm' ? 1 : 0) - 5.4;

/** Grasso corporeo con il metodo US Navy (circonferenze in cm). */
export function bfNavy(p: UserProfile): number | null {
  const { waistCm: w, neckCm: n, hipCm: h, heightCm: ht } = p;
  if (!w || !n || w <= n) return null;
  if (p.sex === 'm') return 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(ht)) - 450;
  if (!h) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(w + h - n) + 0.221 * Math.log10(ht)) - 450;
}

export function bodyFat(p: UserProfile): { value: number; method: BodyFatMethod } {
  if (p.bodyFatPct != null && p.bodyFatPct > 0) return { value: Math.round(p.bodyFatPct * 10) / 10, method: p.bodyFatSource ?? 'manual' };
  const navy = bfNavy(p);
  const v = navy ?? bfDeurenberg(p);
  return { value: Math.round(Math.min(60, Math.max(3, v)) * 10) / 10, method: navy != null ? 'navy' : 'bmi' };
}

export function bfCategory(bf: number, sex: Sex): string {
  const t = sex === 'm' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (bf < t[0]) return 'Essenziale';
  if (bf < t[1]) return 'Atletico';
  if (bf < t[2]) return 'In forma';
  if (bf < t[3]) return 'Nella media';
  return 'Sopra la media';
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return 'Sottopeso';
  if (v < 25) return 'Normopeso';
  if (v < 30) return 'Sovrappeso';
  return 'Obesità';
}

export interface Nutrition {
  bmr: number;
  tdee: number;
  target: number;
  protein: number;
  fat: number;
  carbs: number;
}

/** Calorie obiettivo e macronutrienti (proteine 1,8–2,2 g/kg, grassi ~0,9 g/kg, resto carboidrati). */
export function nutrition(p: UserProfile): Nutrition {
  const t = tdee(p);
  const goal = GOALS.find((g) => g.value === p.goal) ?? GOALS[3];
  const target = Math.round((t * (1 + goal.kcal)) / 10) * 10;
  const protein = Math.round(p.weightKg * (p.goal === 'cut' ? 2.2 : 1.8));
  const fat = Math.round(p.weightKg * 0.9);
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  return { bmr: bmr(p), tdee: t, target, protein, fat, carbs };
}

export function composition(p: UserProfile) {
  const bf = bodyFat(p);
  const lean = p.weightKg * (1 - bf.value / 100);
  const ffmi = lean / (p.heightCm / 100) ** 2 + 6.1 * (1.8 - p.heightCm / 100);
  return { bf, lean: Math.round(lean * 10) / 10, ffmi: Math.round(ffmi * 10) / 10, bmi: Math.round(bmi(p) * 10) / 10 };
}
