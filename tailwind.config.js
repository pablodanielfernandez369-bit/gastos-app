/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vivienda: '#2563eb',
        local: '#d97706',
        ok: '#16a34a',
        warn: '#dc2626',
        caution: '#d97706',
      },
    },
  },
  plugins: [],
};
