import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Dumbbell, TrendingUp } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { settle } from '@/lib/firestore';
import { Button } from '../ui/Button';
import { Logo } from './Screens';

const slides = [
  {
    icon: Dumbbell,
    title: 'Logga in 3 tap',
    text: 'Peso, reps, ✓. Il peso suggerito è già precompilato: tra una serie e l’altra non perdi tempo.',
  },
  {
    icon: TrendingUp,
    title: 'Progressione automatica',
    text: 'Double progression + RIR: quando chiudi il range con il RIR giusto, Vulcan Lift ti dice quanto aggiungere.',
  },
  {
    icon: BarChart3,
    title: 'Mesocicli e deload',
    text: 'Blocchi da 4 settimane con deload automatico, PR, 1RM stimato e analytics per gruppo muscolare.',
  },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const { update } = useSettings();
  const last = i === slides.length - 1;
  const slide = slides[i];
  const Icon = slide.icon;

  const finish = async () => {
    setBusy(true);
    await settle(update({ onboardingCompleted: true }));
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6"
      style={{ paddingTop: 'calc(var(--safe-top) + 24px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="font-display text-xl font-extrabold uppercase text-fg">Vulcan <span className="text-accent-500">Lift</span></span>
        </div>
        {!last && (
          <Button variant="ghost" size="sm" onClick={finish}>
            Salta
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-col items-center"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 && !last) setI(i + 1);
              if (info.offset.x > 60 && i > 0) setI(i - 1);
            }}
          >
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent-glow shadow-glow">
              <Icon className="h-12 w-12 text-accent-500" aria-hidden />
            </div>
            <h1 className="mt-8 text-3xl text-fg">{slide.title}</h1>
            <p className="mt-3 text-lg font-medium text-fg-2">{slide.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mb-6 flex justify-center gap-2" role="tablist" aria-label="Slide">
        {slides.map((s, idx) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={idx === i}
            aria-label={`Slide ${idx + 1}`}
            onClick={() => setI(idx)}
            className="flex h-11 w-8 items-center justify-center"
          >
            <span className={`h-2 rounded-full transition-all ${idx === i ? 'w-6 bg-accent-500' : 'w-2 bg-surface-3'}`} />
          </button>
        ))}
      </div>

      <Button size="lg" fullWidth loading={busy} onClick={() => (last ? finish() : setI(i + 1))}>
        {last ? 'Iniziamo' : 'Avanti'}
      </Button>

    </div>
  );
}
