/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Editorial "papel cálido" ---
        paper: '#F6F3EC', // fondo de la app
        surface: '#FCFAF5', // tarjetas
        'surface-2': '#EFEBDF', // insets / barras vacías
        ink: '#211E1A', // texto principal (casi negro cálido)
        'ink-soft': '#6F6A60', // texto secundario
        'ink-faint': '#A39D90', // texto terciario / captions
        hair: '#E4DED1', // bordes finos
        accent: '#B0491F', // terracota — acción principal, nav activa
        ok: '#5A7D2A', // oliva — positivo / ahorro en verde
        caution: '#C77B2C', // ámbar — zona de aviso
        warn: '#A23B2B', // ladrillo — pasado de presupuesto
        vivienda: '#1F5673', // azul acero apagado
        salidas: '#6D4B8F', // ciruela apagado
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
