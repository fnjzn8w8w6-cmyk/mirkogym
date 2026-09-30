import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Apple, BarChart3, Home, Scale, Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/history', label: 'Storico', icon: BarChart3 },
  { to: '/food', label: 'Dieta', icon: Apple },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/body', label: 'Corpo', icon: Scale },
  { to: '/profile', label: 'Profilo', icon: UserRound },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-base/90 backdrop-blur-xl"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--nav-h)] max-w-2xl items-stretch">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors',
                  isActive ? 'text-accent-500' : 'text-fg-3 hover:text-fg-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-accent-500"
                      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    />
                  )}
                  <Icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
