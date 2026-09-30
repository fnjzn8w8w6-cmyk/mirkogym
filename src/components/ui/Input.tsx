import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  suffix?: string;
  kind?: 'text' | 'number' | 'decimal';
}

/** Input con label flottante. `kind` imposta la tastiera corretta su mobile. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, suffix, kind = 'text', className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const kbd =
    kind === 'decimal'
      ? { inputMode: 'decimal' as const, type: 'text', pattern: '[0-9]*[.,]?[0-9]*' }
      : kind === 'number'
        ? { inputMode: 'numeric' as const, type: 'text', pattern: '[0-9]*' }
        : { type: rest.type ?? 'text' };
  return (
    <div className={cn('relative', className)}>
      <input
        ref={ref}
        id={inputId}
        placeholder=" "
        {...kbd}
        {...rest}
        className="peer h-14 w-full rounded-md border border-line bg-surface-2 px-4 pb-1.5 pt-5 text-base text-fg outline-none transition-colors focus:border-accent-500 focus:bg-surface-3"
      />
      <label
        htmlFor={inputId}
        className="pointer-events-none absolute left-4 top-1.5 text-xs text-fg-3 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-accent-400"
      >
        {label}
      </label>
      {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-3">{suffix}</span>}
    </div>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, className, id, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        placeholder=" "
        {...rest}
        className="peer w-full resize-none rounded-md border border-line bg-surface-2 px-4 pb-2 pt-6 text-base text-fg outline-none transition-colors focus:border-accent-500 focus:bg-surface-3"
      />
      <label
        htmlFor={inputId}
        className="pointer-events-none absolute left-4 top-2 text-xs text-fg-3 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-focus:top-2 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-accent-400"
      >
        {label}
      </label>
    </div>
  );
});

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className={cn('flex min-h-[56px] items-center justify-between gap-4 py-2', disabled && 'opacity-50')}>
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <div className="text-base text-fg">{label}</div>
        {description && <div className="text-sm text-fg-3">{description}</div>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-8 w-[52px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent-500' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-1 h-6 w-6 rounded-full shadow-sm transition-transform',
            checked ? 'translate-x-[24px] bg-onaccent' : 'translate-x-1 bg-fg-2',
          )}
        />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 flex-1 rounded-sm text-sm font-semibold transition-colors',
            o.value === value ? 'bg-surface-3 text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
