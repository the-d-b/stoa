/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        stoa: {
          50:  '#f0f0ff',
          100: '#e4e4ff',
          200: '#cdcdff',
          300: '#b4b4ff',
          400: '#9090ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        }
      }
    }
  },
  plugins: []
}
