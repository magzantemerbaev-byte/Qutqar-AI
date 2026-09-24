/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#06101F',
          900: '#0A1A33',
          800: '#0F2444',
          700: '#163257',
          600: '#1F4270',
          500: '#2C5A92',
        },
        signal: {
          red: '#D92D20',
          amber: '#F79009',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        cond: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', '"Arial Narrow"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
