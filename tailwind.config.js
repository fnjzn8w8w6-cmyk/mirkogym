/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // colori del tema (variabili in src/index.css): `rgb(... / alfa)` per poter usare bg-surface/50 ecc.
        // «page» e non «base»: text-base è già la grandezza del testo (con «base» diventava anche il colore dello sfondo)
        page: 'rgb(var(--rgb-base) / <alpha-value>)',
        surface: 'rgb(var(--rgb-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--rgb-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--rgb-surface-3) / <alpha-value>)',
        onaccent: 'rgb(var(--rgb-onaccent) / <alpha-value>)',
        violet: { 400: 'rgb(var(--rgb-violet-400) / <alpha-value>)', 500: 'rgb(var(--rgb-violet-500) / <alpha-value>)', 600: 'rgb(var(--rgb-violet-600) / <alpha-value>)' },
        line: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        fg: {
          DEFAULT: 'var(--text-primary)',
          2: 'var(--text-secondary)',
          3: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
        },
        accent: {
          400: 'rgb(var(--rgb-accent-400) / <alpha-value>)',
          500: 'rgb(var(--rgb-accent-500) / <alpha-value>)',
          600: 'rgb(var(--rgb-accent-600) / <alpha-value>)',
          glow: 'var(--accent-glow)',
        },
        success: { DEFAULT: 'rgb(var(--rgb-accent-500) / <alpha-value>)', bg: 'var(--success-bg)' },
        warning: { DEFAULT: 'rgb(var(--rgb-warning) / <alpha-value>)', bg: 'var(--warning-bg)' },
        danger: { DEFAULT: 'rgb(var(--rgb-danger) / <alpha-value>)', bg: 'var(--danger-bg)' },
        info: { DEFAULT: 'rgb(var(--rgb-info) / <alpha-value>)', bg: 'var(--info-bg)' },
        muscle: {
          back: '#8B5CF6',
          chest: '#EC4899',
          legs: '#14B8A6',
          shoulders: '#F59E0B',
          arms: '#06B6D4',
          core: '#84CC16',
        },
      },
      keyframes: {
        'bounce-slow': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-3px)' } },
        think: { '0%,100%': { transform: 'rotate(-6deg) translateY(0)' }, '50%': { transform: 'rotate(6deg) translateY(-4px)' } },
        read: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg) translateX(2px)' } },
        float: { '0%': { transform: 'translateY(4px) scale(0.6)', opacity: '0' }, '30%': { opacity: '1' }, '100%': { transform: 'translateY(-18px) scale(1)', opacity: '0' } },
        lift: { '0%,100%': { transform: 'translateY(4px)' }, '50%': { transform: 'translateY(-6px)' } },
        flip: { '0%,100%': { transform: 'scaleX(1)' }, '50%': { transform: 'scaleX(-1)' } },
      },
      animation: {
        'bounce-slow': 'bounce-slow 1.8s ease-in-out infinite',
        think: 'think 1.6s ease-in-out infinite',
        read: 'read 2.2s ease-in-out infinite',
        float: 'float 1.8s ease-out infinite',
        lift: 'lift 1s ease-in-out infinite',
        flip: 'flip 1.2s steps(1) infinite',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Saira Condensed"', '"Inter Variable"', 'sans-serif'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '14px', fontWeight: '600' }],
        sm: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        base: ['15px', { lineHeight: '22px', fontWeight: '500' }],
        lg: ['17px', { lineHeight: '24px', fontWeight: '600' }],
        xl: ['20px', { lineHeight: '28px', fontWeight: '700' }],
        '2xl': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        '3xl': ['32px', { lineHeight: '40px', fontWeight: '800' }],
        '4xl': ['40px', { lineHeight: '48px', fontWeight: '800' }],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
