/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bgc: {
          body: '#121318',
          header: '#17181f',
          'header-md': '#14151b',
          layer1: '#1b1c24',
          layer2: '#242530',
          'layer-semi-neutral': 'rgba(255, 255, 255, 0.08)',
        },
        bd: {
          default: 'rgba(255, 255, 255, 0.09)',
          strong: 'rgba(255, 255, 255, 0.16)',
        },
        txt: {
          primary: '#f4f4f6',
          secondary: '#9ca3af',
          focus: '#d8b4fe',
          inverse: '#0f0f14',
        },
        lav: {
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
        },
        mag: {
          400: '#f472b6',
          500: '#ec4899',
        },
      },
    },
  },
  plugins: [],
};
