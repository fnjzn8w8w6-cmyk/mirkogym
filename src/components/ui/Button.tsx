import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent-500 text-onaccent shadow-glow hover:bg-accent-400 active:bg-accent-600',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'bg-transparent text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger-bg text-danger border border-danger/30 hover:bg-danger/20',
  success: 'bg-success text-black hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 min-w-[44px] px-3 text-sm rounded-sm gap-1.5',
  md: 'h-11 min-w-[44px] px-4 text-base rounded-md gap-2',
  lg: 'h-14 px-6 text-lg rounded-lg gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});

interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  variant?: 'ghost' | 'secondary';
}

/** Bottone solo icona con target 44×44 e aria-label obbligatoria. */
export function IconButton({ label, children, className, variant = 'ghost', type = 'button', ...rest }: IconButtonProps) {
  return (
    <motion.button
      type={type}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:text-fg',
        variant === 'secondary' ? 'bg-surface-2 hover:bg-surface-3' : 'hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
