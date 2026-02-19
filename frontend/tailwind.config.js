/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          50:  '#F3EDFD',
          100: '#E3D5FB',
          200: '#C7ABF7',
          300: '#A87BF0',
          400: '#8A4DE8',
          500: '#5314B9',
          600: '#4510A0',
          700: '#370D82',
          800: '#290A63',
          900: '#1B0644',
        },
        base: {
          950: '#06060B',
          900: '#0A0A12',
          800: '#111119',
          700: '#18182A',
          600: '#22223A',
          500: '#2E2E48',
        },
        txt: {
          primary:   '#F0ECE6',
          secondary: '#A8A29E',
          muted:     '#6B6560',
        },
        semantic: {
          success: '#34D399',
          warning: '#FBBF24',
          error:   '#F87171',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'Consolas', 'monospace'],
        accent:  ['var(--font-accent)', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'card':  '12px',
        'btn':   '10px',
        'badge': '6px',
      },
      boxShadow: {
        'card-hover':  '0 8px 32px rgba(6, 6, 11, 0.5)',
        'btn-hover':   '0 0 0 4px rgba(83, 20, 185, 0.20)',
        'input-focus': '0 0 0 3px rgba(83, 20, 185, 0.15)',
        'header':      '0 1px 0 rgba(83, 20, 185, 0.08)',
      },
      animation: {
        'fade-in-up':   'fade-in-up 0.35s ease-out forwards',
        'pulse-subtle': 'pulse-subtle 1.5s ease-in-out infinite',
      },
      keyframes: {
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
