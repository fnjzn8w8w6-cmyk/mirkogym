import { HUNGER_WORDS } from '@/components/ui/LevelScale';
import type { CheckInAnswers } from '@/lib/checkin';

/** Domande del check-in settimanale con le parole della scala 1–5. */
export const QUESTIONS: { key: keyof Omit<CheckInAnswers, 'note'>; label: string; scale: string[] }[] = [
  { key: 'energy', label: 'Energia durante la settimana', scale: ['A terra', 'Bassa', 'Normale', 'Alta', 'Al top'] },
  { key: 'sleep', label: 'Qualità del sonno', scale: ['Pessima', 'Scarsa', 'Normale', 'Buona', 'Ottima'] },
  { key: 'stress', label: 'Stress (lavoro, studio, vita)', scale: ['Nessuno', 'Poco', 'Normale', 'Alto', 'Altissimo'] },
  { key: 'soreness', label: 'Dolori muscolari / articolari', scale: ['Nessuno', 'Lievi', 'Medi', 'Forti', 'Intensi'] },
  { key: 'hunger', label: 'Fame durante il giorno', scale: HUNGER_WORDS },
  { key: 'adherence', label: 'Quanto hai rispettato calorie e macro?', scale: ['0–20%', '40%', '60%', '80%', '100%'] },
];
