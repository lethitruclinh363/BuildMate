import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b14',
          900: '#0b1220',
          800: '#111b2e',
          700: '#18253d',
          600: '#243552',
          500: '#3a4d6e',
        },
        copper: {
          300: '#e4c9a0',
          400: '#d4af77',
          500: '#c89445',
          600: '#b08b4f',
          700: '#8c6d3a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 2px rgba(0, 0, 0, 0.2)',
        copper: '0 0 0 1px rgba(201, 163, 106, 0.28)',
        xl: '0 4px 12px rgba(0, 0, 0, 0.18)',
        '2xl': '0 4px 12px rgba(0, 0, 0, 0.18)',
      },
      backgroundImage: {
        'admin-grid':
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'admin-glow':
          'radial-gradient(ellipse at 12% -10%, rgba(201,163,106,0.18), transparent 42%), radial-gradient(ellipse at 90% 0%, rgba(36,80,140,0.22), transparent 40%)',
      },
    },
  },
  plugins: [],
};

export default config;
