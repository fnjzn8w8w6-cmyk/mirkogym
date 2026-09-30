/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0B0714',
        surface: '#150F22',
        'surface-2': '#1D1530',
        'surface-3': '#2A1F3D',
        onaccent: '#0B0714',
        violet: { 400: '#C084FC', 500: '#8B5CF6', 600: '#6D28D9' },
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
          400: '#6BFFA8',
          500: '#39FF88',
          600: '#1FD86A',
          glow: 'var(--accent-glow)',
        },
        success: { DEFAULT: '#39FF88', bg: 'var(--success-bg)' },
        warning: { DEFAULT: '#EAB308', bg: 'var(--warning-bg)' },
        danger: { DEFAULT: '#EF4444', bg: 'var(--danger-bg)' },
        info: { DEFAULT: '#3B82F6', bg: 'var(--info-bg)' },
        muscle: {
          back: '#8B5CF6',
          chest: '#EC4899',
          legs: '#14B8A6',
          shoulders: '#F59E0B',
          arms: '#06B6D4',
          core: '#84CC16',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Unbounded', '"Inter Variable"', 'sans-serif'],
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
