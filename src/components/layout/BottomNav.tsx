import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Apple, Dumbbell, Home, Scale, Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/training', label: 'Allenamento', icon: Dumbbell },
  { to: '/food', label: 'Dieta', icon: Apple },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/body', label: 'Corpo', icon: Scale },
  { to: '/profile', label: 'Profilo', icon: UserRound },
];

/** Barra di navigazione a "pillola" (tema Toxic): sezione attiva evidenziata in verde. */
export function BottomNav() {
  return (
    <nav aria-label="Navigazione principale" className="fixed inset-x-0 bottom-0 z-40 px-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 10px)' }}>
      <ul className="mx-auto flex h-[64px] max-w-md items-center rounded-full border border-line bg-surface/95 px-1.5 shadow-lg backdrop-blur-xl">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex flex-1 justify-center">
            <NavLink to={to} end={end} aria-label={label} title={label} className="relative flex h-12 w-12 items-center justify-center rounded-full">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-accent-500 shadow-glow"
                      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    />
                  )}
                  <Icon className={cn('relative h-[22px] w-[22px]', isActive ? 'text-onaccent' : 'text-fg-3')} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
