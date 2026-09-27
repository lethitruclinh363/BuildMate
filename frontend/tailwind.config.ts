import type { Config } from 'tailwindcss';
import { tokens } from './src/theme/design-token';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: tokens.colors.navy,
        copper: tokens.colors.copper,
        paper: tokens.colors.paper,
        ink: tokens.colors.ink,
        mist: tokens.colors.mist,
      },
      fontFamily: {
        display: tokens.fonts.display,
        sans: tokens.fonts.sans,
      },
      boxShadow: {
        card: '0 12px 40px -18px rgba(11, 46, 74, 0.28)',
        glow: '0 0 0 4px rgba(201, 132, 42, 0.18)',
        lift: '0 22px 50px -20px rgba(11, 46, 74, 0.35)',
      },
      backgroundImage: {
        'hero-wash':
          'linear-gradient(115deg, rgba(11,46,74,0.92) 0%, rgba(11,46,74,0.72) 46%, rgba(11,46,74,0.28) 100%)',
        'copper-glow':
          'radial-gradient(circle at 20% 20%, rgba(201,132,42,0.28), transparent 42%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
