import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#071e32',
          900: '#0b2e4a',
          800: '#0f4c81',
          700: '#165a8a',
          600: '#1e6493',
          500: '#3b7eaa',
        },
        copper: {
          300: '#cfe3f1',
          400: '#8eb0c9',
          500: '#5f8ca9',
          600: '#3d6f8d',
          700: '#173b4f',
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
          'linear-gradient(rgba(23,59,79,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(23,59,79,0.06) 1px, transparent 1px)',
        'admin-glow':
          'radial-gradient(ellipse at 12% -10%, rgba(23,59,79,0.18), transparent 42%), radial-gradient(ellipse at 90% 0%, rgba(30,100,147,0.22), transparent 40%)',
      },
    },
  },
  plugins: [],
};

export default config;
