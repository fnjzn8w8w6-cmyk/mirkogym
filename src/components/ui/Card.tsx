import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  variant?: 'surface' | 'elevated';
  interactive?: boolean;
  children?: ReactNode;
}

export function Card({ variant = 'surface', interactive, className, children, ...rest }: CardProps) {
  return (
    <motion.div
      whileTap={interactive ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.1 }}
      className={cn(
        'rounded-lg border',
        variant === 'surface' ? 'border-line-subtle bg-surface/90' : 'border-line bg-surface-2/95 shadow-md',
        interactive && 'cursor-pointer transition-colors hover:border-line-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
