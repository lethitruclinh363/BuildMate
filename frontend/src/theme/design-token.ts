export const tokens = {
  colors: {
    navy: {
      50: '#EAF2F8',
      100: '#D3E4F0',
      200: '#A7C9E0',
      300: '#6EA3C6',
      400: '#3B7EAA',
      500: '#1E6493',
      600: '#165A8A',
      700: '#0F4C81',
      800: '#0B2E4A',
      900: '#071E32',
    },
    copper: {
      50: '#FBF4EA',
      100: '#F5E4C8',
      200: '#EBC894',
      300: '#DCA85A',
      400: '#C9842A',
      500: '#B8612A',
      600: '#9A4C1F',
      700: '#7A3C19',
    },
    paper: {
      50: '#FBF9F4',
      100: '#F4F1EA',
      200: '#E8E2D6',
      300: '#D4CBB8',
    },
    ink: {
      50: '#F3F5F7',
      100: '#E4E8ED',
      200: '#C5CDD6',
      400: '#6B7789',
      600: '#3A4658',
      800: '#1A2332',
      900: '#122033',
    },
    mist: {
      100: '#F7F5F1',
      200: '#EEEAE3',
    },
  },
  fonts: {
    display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  },
  radii: {
    sm: '8px',
    md: '14px',
    lg: '22px',
    pill: '999px',
  },
  shadows: {
    card: '0 12px 40px -18px rgba(11, 46, 74, 0.28)',
    lift: '0 22px 50px -20px rgba(11, 46, 74, 0.35)',
  },
} as const;

export const brand = {
  name: 'BuildMate',
  slogan: 'Connect Homeowners With Trusted Local Construction Experts',
  short: 'Local construction, trusted people, one platform.',
};
