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
      borderRadius: {
        md: '10px',
        lg: '12px',
        xl: '12px',
        '2xl': '12px',
        '3xl': '12px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
        md: '0 1px 2px rgba(15, 23, 42, 0.04)',
        lg: '0 1px 2px rgba(15, 23, 42, 0.04)',
        xl: '0 4px 12px rgba(15, 23, 42, 0.05)',
        '2xl': '0 4px 12px rgba(15, 23, 42, 0.05)',
        card: '0 1px 2px rgba(15, 23, 42, 0.04)',
        glow: '0 0 0 1px rgba(15, 23, 42, 0.06)',
        lift: '0 4px 12px rgba(15, 23, 42, 0.05)',
        soft: '0 1px 2px rgba(15, 23, 42, 0.04)',
        panel: '0 4px 12px rgba(15, 23, 42, 0.05)',
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
