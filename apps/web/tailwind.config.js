/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      colors: {
        oled: '#0b0b0e',
        card: '#14141a',
        cardHover: '#1c1c24',
      },
    },
  },
  plugins: [],
};
